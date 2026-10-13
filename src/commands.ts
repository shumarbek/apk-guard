import type { Telegram, Env } from "./types";
import { escapeHtml, ownerIds, parseGroupId } from "./security";
import {
  privateUserExists,
  recentEvents,
  subscribe,
  subscriptionsForUser,
  unsubscribe,
  upsertPrivateUser,
} from "./repository";
import { apiCode } from "./telegram";
import { tashkentTime } from "./display";

export interface IncomingMessage {
  message_id: number;
  chat: { id: number; type: string; title?: string; username?: string };
  from?: {
    id: number;
    is_bot?: boolean;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  sender_chat?: { id: number; title?: string; username?: string };
  text?: string;
  document?: { file_name?: string; mime_type?: string };
}

function admin(status: string): boolean {
  return status === "administrator" || status === "creator";
}

export async function groupStatus(
  tg: Telegram,
  groupId: number,
  chatType = "supergroup",
  db?: D1Database,
): Promise<string> {
  try {
    const me = await tg.getMe();
    const member = await tg.getChatMember(groupId, me.id);
    const present = !["left", "kicked"].includes(member.status);
    const administrator = admin(member.status);
    const canDelete =
      member.status === "creator" ||
      (member.status === "administrator" &&
        member.can_delete_messages === true) ||
      (member.status === "administrator" && chatType === "group");
    if (db) {
      await db
        .prepare(
          `INSERT INTO groups(group_id, moderation_status, last_api_code)
        VALUES (?, ?, NULL) ON CONFLICT(group_id) DO UPDATE SET
        moderation_status=excluded.moderation_status, last_api_code=NULL, checked_at=CURRENT_TIMESTAMP`,
        )
        .bind(groupId, canDelete ? "active" : "no_permission")
        .run();
    }
    return `Bot guruhda: ${present ? "ha" : "yo‘q"}\nAdministrator: ${administrator ? "ha" : "yo‘q"}\nXabarlarni o‘chirish: ${canDelete ? "ha" : "yo‘q"}\nOgohlantirish yuborish: ${present ? "sinab ko‘riladi" : "yo‘q"}\nModeratsiya: ${canDelete ? "faol" : "huquq yetarli emas; botni admin qiling va xabar o‘chirish huquqini bering"}`;
  } catch (error) {
    if (db) {
      await db
        .prepare(
          `INSERT INTO groups(group_id, moderation_status, last_api_code)
        VALUES (?, 'unknown', ?) ON CONFLICT(group_id) DO UPDATE SET
        moderation_status='unknown', last_api_code=excluded.last_api_code, checked_at=CURRENT_TIMESTAMP`,
        )
        .bind(groupId, apiCode(error))
        .run();
    }
    return `Telegram API orqali holatni tekshirib bo‘lmadi (kod: ${apiCode(error)}). Moderatsiya holati tasdiqlanmagan.`;
  }
}

export async function handleCommand(
  message: IncomingMessage,
  env: Env,
  tg: Telegram,
): Promise<boolean> {
  const text = message.text;
  if (!text?.startsWith("/")) return false;
  const [raw, arg] = text.trim().split(/\s+/, 2);
  const addressedTo = raw.split("@")[1];
  if (addressedTo) {
    const me = await tg.getMe();
    if (addressedTo.toLowerCase() !== me.username?.toLowerCase()) return false;
  }
  const command = raw.slice(1).split("@")[0].toLowerCase();
  const privateChat = message.chat.type === "private";
  const userId = message.from?.id;
  const reply = (body: string) =>
    tg.sendMessage(message.chat.id, body, { parse_mode: "HTML" });

  if (command === "start") {
    if (privateChat && userId) await upsertPrivateUser(env.DB, userId);
    await reply(
      "🛡️ APK Guard guruhlardagi APK hujjatlarni aniqlaydi va o‘chirishga urinadi. Guruhda botga administrator va xabarni o‘chirish huquqini bering. Shaxsiy chatda <code>/subscribe GROUP_ID</code> bilan bildirishnomaga obuna bo‘ling. /help — barcha buyruqlar.",
    );
  } else if (command === "help") {
    await reply(
      "Buyruqlar: /start, /help, /id, /status, /subscribe GROUP_ID, /unsubscribe GROUP_ID. /logs faqat bot egasi uchun. Obuna uchun shu guruh administratori bo‘lishingiz va botga shaxsiy /start yuborgan bo‘lishingiz kerak.",
    );
  } else if (command === "id") {
    await reply(
      `Sizning ID: <code>${userId ?? "noma’lum"}</code>${privateChat ? "" : `\nGuruh ID: <code>${message.chat.id}</code>`}`,
    );
  } else if (command === "status") {
    if (privateChat) {
      const groups = userId ? await subscriptionsForUser(env.DB, userId) : [];
      await reply(
        `Bot: ishlayapti. Shaxsiy bildirishnoma: ${userId && (await privateUserExists(env.DB, userId)) ? "chat boshlangan" : "avval /start yuboring"}.\nObunalar: ${groups.length ? groups.map((g) => `<code>${g}</code>`).join(", ") : "yo‘q"}. Har bir hodisada adminlik qayta tekshiriladi.`,
      );
    } else {
      await reply(
        await groupStatus(tg, message.chat.id, message.chat.type, env.DB),
      );
    }
  } else if (command === "subscribe") {
    const groupId = parseGroupId(arg);
    if (!privateChat || !userId || groupId === null) {
      await reply(
        "Bu buyruq shaxsiy chatda ishlaydi: <code>/subscribe -1001234567890</code>.",
      );
    } else if (!(await privateUserExists(env.DB, userId))) {
      await reply("Avval botga /start yuboring.");
    } else {
      try {
        const member = await tg.getChatMember(groupId, userId);
        if (!admin(member.status))
          await reply(
            "Obuna rad etildi: siz ushbu guruh administratori emassiz.",
          );
        else {
          await subscribe(env.DB, groupId, userId);
          await reply(`Obuna qo‘shildi: <code>${groupId}</code>.`);
        }
      } catch (error) {
        await reply(
          `Guruh yoki huquqni tekshirib bo‘lmadi (Telegram kodi: ${apiCode(error)}). Guruh ID va bot a’zoligini tekshiring.`,
        );
      }
    }
  } else if (command === "unsubscribe") {
    const groupId = parseGroupId(arg);
    if (!privateChat || !userId || groupId === null)
      await reply(
        "Shaxsiy chatda <code>/unsubscribe GROUP_ID</code> yuboring.",
      );
    else {
      await unsubscribe(env.DB, groupId, userId);
      await reply("Obuna bekor qilindi.");
    }
  } else if (command === "logs") {
    if (!userId || !ownerIds(env.OWNER_IDS).includes(userId)) {
      await reply("Ruxsat yo‘q. OWNER_IDS sozlamasini tekshiring.");
    } else {
      const rows = await recentEvents(env.DB);
      await reply(
        rows.length
          ? rows
              .map(
                (e) =>
                  `${escapeHtml(tashkentTime(e.created_at))} | ${escapeHtml(e.group_title ?? e.group_id)} | ${escapeHtml(e.file_name ?? "nomi yo‘q")} | ${e.delete_status}`,
              )
              .join("\n")
              .slice(0, 3800)
          : "Hodisalar yo‘q.",
      );
    }
  } else {
    await reply("Noma’lum buyruq. /help ni ko‘ring.");
  }
  return true;
}
