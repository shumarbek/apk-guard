import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getPlatformProxy, type PlatformProxy } from "wrangler";
import type { Env, Telegram } from "../src/types";
import {
  insertEvent,
  eventById,
  subscribe,
  upsertPrivateUser,
  type NewEvent,
} from "../src/repository";
import {
  attemptDelete,
  finishEvent,
  notificationText,
  warningText,
} from "../src/moderation";
import { groupStatus, handleCommand } from "../src/commands";
import { handleRequest, processUpdate } from "../src/index";
import { tashkentTime } from "../src/display";

let proxy: PlatformProxy<Env>;
let db: D1Database;
const sent: Array<{ id: number; text: string }> = [];
let deleteError: unknown = null;
let adminIds = new Set([20]);
const tg: Telegram = {
  getMe: async () => ({ id: 999, is_bot: true, first_name: "Guard" }),
  getChatMember: async (_chat, user) =>
    ({
      status: adminIds.has(user) ? "administrator" : "member",
      user: { id: user, is_bot: false, first_name: "X" },
      can_delete_messages: user === 999,
    }) as Awaited<ReturnType<Telegram["getChatMember"]>>,
  deleteMessage: async () => {
    if (deleteError) throw deleteError;
    return true;
  },
  sendMessage: async (id, text) => {
    sent.push({ id, text });
    return { message_id: id === -1001 ? 777 : 1 };
  },
};

function newEvent(id: number, groupId = -1001): NewEvent {
  return {
    updateId: id,
    groupId,
    groupTitle: "<Guruh>",
    groupUsername: "public_group",
    messageId: id,
    senderId: 15,
    senderName: "Ali <Test>",
    senderUsername: "ali_test",
    senderChatId: null,
    fileName: "<evil>.apk",
    mimeType: null,
    reason: "kengaytma",
  };
}

beforeAll(async () => {
  proxy = await getPlatformProxy<Env>({
    persist: false,
    remoteBindings: false,
  });
  db = proxy.env.DB;
  for (const migration of ["0001_initial.sql", "0002_message_details.sql"]) {
    for (const statement of readFileSync(`migrations/${migration}`, "utf8")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      await db.prepare(statement).run();
    }
  }
});
afterAll(async () => {
  await proxy?.dispose();
});

describe("moderation with local D1", () => {
  it("deletes one APK, escapes HTML, and notifies owner and subscribed admin only", async () => {
    sent.length = 0;
    await upsertPrivateUser(db, 20);
    await subscribe(db, -1001, 20);
    await upsertPrivateUser(db, 30);
    await subscribe(db, -2002, 30);
    await insertEvent(db, newEvent(101));
    await insertEvent(db, newEvent(101));
    await attemptDelete(db, tg, 101);
    await finishEvent(db, tg, 101, "10,20");
    const e = await eventById(db, 101);
    expect(e?.delete_status).toBe("deleted");
    expect(e?.delete_attempts).toBe(1);
    expect(sent.map((s) => s.id).sort()).toEqual([-1001, 10, 20]);
    expect(sent.every((s) => !s.text.includes("<evil>"))).toBe(true);
    expect(warningText(e!)).toContain("muvaffaqiyatli o‘chirildi");
    expect(notificationText(e!)).toContain("&lt;Guruh&gt;");
    expect(notificationText(e!)).toContain(
      '<a href="https://t.me/public_group">&lt;Guruh&gt;</a>',
    );
    expect(notificationText(e!)).toContain(
      '<a href="https://t.me/ali_test">Ali &lt;Test&gt;</a>',
    );
    await finishEvent(db, tg, 101, "10,20");
    expect(sent).toHaveLength(3);
  });

  it("formats UTC time in Tashkent and links a private supergroup warning", async () => {
    expect(tashkentTime("2026-10-13 19:01:24")).toBe(
      "2026-10-14 00:01:24 (Toshkent)",
    );
    const event = newEvent(108);
    event.groupUsername = null;
    event.senderUsername = null;
    await insertEvent(db, event);
    await attemptDelete(db, tg, 108);
    await finishEvent(db, tg, 108, "10");
    const text = notificationText((await eventById(db, 108))!);
    expect(text).toContain('href="https://t.me/c/1/777"');
    expect(text).toContain('href="tg://user?id=15"');
  });

  it("records permission denial as failure and warns truthfully", async () => {
    sent.length = 0;
    deleteError = { error_code: 400 };
    await insertEvent(db, newEvent(102));
    await attemptDelete(db, tg, 102);
    await finishEvent(db, tg, 102, "10");
    const e = await eventById(db, 102);
    expect(e?.delete_status).toBe("delete_failed");
    expect(sent.find((s) => s.id === -1001)?.text).toContain("o‘chirilmadi");
    deleteError = null;
  });

  it("stores Telegram 429 retry time without claiming deletion", async () => {
    deleteError = { error_code: 429, parameters: { retry_after: 2 } };
    await insertEvent(db, newEvent(103));
    await attemptDelete(db, tg, 103);
    const e = await eventById(db, 103);
    expect(e?.delete_status).toBe("delete_failed");
    expect(e?.next_retry_at).not.toBeNull();
    deleteError = null;
  });

  it("rejects a non-admin subscription and reports missing bot delete rights", async () => {
    sent.length = 0;
    await upsertPrivateUser(db, 40);
    const env = {
      DB: db,
      BOT_TOKEN: "test",
      WEBHOOK_SECRET: "secret",
      OWNER_IDS: "10",
    };
    await handleCommand(
      {
        message_id: 1,
        chat: { id: 40, type: "private" },
        from: { id: 40 },
        text: "/subscribe -1001",
      },
      env,
      tg,
    );
    expect(sent.at(-1)?.text).toContain("rad etildi");
    adminIds = new Set();
    expect(await groupStatus(tg, -1001, "supergroup", db)).toContain(
      "huquq yetarli emas",
    );
    const group = await db
      .prepare("SELECT moderation_status FROM groups WHERE group_id=?")
      .bind(-1001)
      .first<{ moderation_status: string }>();
    expect(group?.moderation_status).toBe("no_permission");
  });

  it("rejects bad webhook secret before touching D1", async () => {
    const env = {
      DB: db,
      BOT_TOKEN: "test",
      WEBHOOK_SECRET: "secret",
      OWNER_IDS: "10",
    };
    const response = await handleRequest(
      new Request("https://example.com/webhook", {
        method: "POST",
        body: "{}",
      }),
      env,
    );
    expect(response.status).toBe(403);
  });

  it("ignores plain text and messages sent by a bot", async () => {
    const env = {
      DB: db,
      BOT_TOKEN: "test",
      WEBHOOK_SECRET: "secret",
      OWNER_IDS: "10",
    };
    await processUpdate(
      {
        update_id: 105,
        message: {
          message_id: 5,
          chat: { id: -1001, type: "supergroup" },
          text: "hello",
        },
      },
      env,
      tg,
    );
    await processUpdate(
      {
        update_id: 106,
        message: {
          message_id: 6,
          chat: { id: -1001, type: "supergroup" },
          from: { id: 999, is_bot: true },
          document: { file_name: "warning.apk" },
        },
      },
      env,
      tg,
    );
    expect(await eventById(db, 105)).toBeNull();
    expect(await eventById(db, 106)).toBeNull();
  });

  it("checks edited messages as separate updates", async () => {
    const env = {
      DB: db,
      BOT_TOKEN: "test",
      WEBHOOK_SECRET: "secret",
      OWNER_IDS: "10",
    };
    sent.length = 0;
    await processUpdate(
      {
        update_id: 107,
        edited_message: {
          message_id: 7,
          chat: { id: -1001, type: "supergroup", username: "public_group" },
          from: {
            id: 15,
            first_name: "Ali",
            last_name: "Valiyev",
            username: "ali_valiyev",
          },
          document: { file_name: "edited.APK" },
        },
      },
      env,
      tg,
    );
    const event = await eventById(db, 107);
    expect(event?.delete_status).toBe("deleted");
    expect(event?.group_username).toBe("public_group");
    expect(event?.sender_name).toBe("Ali Valiyev");
    expect(event?.sender_username).toBe("ali_valiyev");
  });

  it("surfaces D1 failure as retriable webhook response", async () => {
    const badDb = {
      prepare: () => {
        throw new Error("D1 unavailable");
      },
    } as unknown as D1Database;
    const env = {
      DB: badDb,
      BOT_TOKEN: "test",
      WEBHOOK_SECRET: "secret",
      OWNER_IDS: "10",
    };
    const response = await handleRequest(
      new Request("https://example.com/webhook", {
        method: "POST",
        headers: { "X-Telegram-Bot-Api-Secret-Token": "secret" },
        body: JSON.stringify({
          update_id: 104,
          message: {
            message_id: 1,
            chat: { id: -1001, type: "supergroup" },
            document: { file_name: "x.apk" },
          },
        }),
      }),
      env,
    );
    expect(response.status).toBe(503);
  });
});
