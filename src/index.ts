import type { Env, Telegram } from "./types";
import type { IncomingMessage } from "./commands";
import { authorizedWebhook } from "./security";
import { detectApk } from "./detector";
import { handleCommand, groupStatus } from "./commands";
import { insertEvent } from "./repository";
import { attemptDelete, finishEvent, retryDue } from "./moderation";
import { telegram } from "./telegram";

interface IncomingUpdate {
  update_id: number;
  message?: IncomingMessage;
  edited_message?: IncomingMessage;
  my_chat_member?: {
    chat: { id: number; type: string };
    new_chat_member: { status: string };
  };
}

export async function processUpdate(
  update: IncomingUpdate,
  env: Env,
  tg: Telegram = telegram(env.BOT_TOKEN),
): Promise<void> {
  const message = update.message ?? update.edited_message;
  if (message) {
    if (update.message && (await handleCommand(message, env, tg))) return;
    if (
      !["group", "supergroup"].includes(message.chat.type) ||
      !message.document ||
      (message.from?.is_bot && !message.sender_chat)
    )
      return;
    const detection = detectApk(
      message.document.file_name,
      message.document.mime_type,
    );
    if (detection.verdict !== "apk") return;
    const senderName =
      message.sender_chat?.title ??
      [message.from?.first_name, message.from?.last_name]
        .filter(Boolean)
        .join(" ");
    await insertEvent(env.DB, {
      updateId: update.update_id,
      groupId: message.chat.id,
      groupTitle: message.chat.title ?? null,
      groupUsername: message.chat.username ?? null,
      messageId: message.message_id,
      senderId: message.sender_chat ? null : (message.from?.id ?? null),
      senderName: senderName || null,
      senderUsername:
        message.sender_chat?.username ?? message.from?.username ?? null,
      senderChatId: message.sender_chat?.id ?? null,
      fileName: message.document.file_name ?? null,
      mimeType: message.document.mime_type ?? null,
      reason: detection.reason,
    });
    await attemptDelete(env.DB, tg, update.update_id);
    await finishEvent(env.DB, tg, update.update_id, env.OWNER_IDS);
  } else if (
    update.my_chat_member &&
    ["group", "supergroup"].includes(update.my_chat_member.chat.type) &&
    ["administrator", "member"].includes(
      update.my_chat_member.new_chat_member.status,
    )
  ) {
    const id = update.my_chat_member.chat.id;
    await tg.sendMessage(
      id,
      await groupStatus(tg, id, update.my_chat_member.chat.type, env.DB),
    );
  }
}

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET")
    return new Response("ok");
  if (url.pathname !== "/webhook")
    return new Response("Not found", { status: 404 });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET || !env.DB)
    return new Response("Not configured", { status: 503 });
  if (
    !authorizedWebhook(
      request.headers.get("X-Telegram-Bot-Api-Secret-Token"),
      env.WEBHOOK_SECRET,
    )
  ) {
    return new Response("Forbidden", { status: 403 });
  }
  let update: IncomingUpdate;
  try {
    update = (await request.json()) as IncomingUpdate;
    if (!Number.isSafeInteger(update.update_id) || update.update_id < 0)
      throw new Error("Invalid update");
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  try {
    await processUpdate(update, env);
    return new Response("ok");
  } catch (error) {
    console.error("webhook_processing_failed", {
      update_id: update.update_id,
      error_type: error instanceof Error ? error.name : "unknown",
    });
    return new Response("Temporary failure", { status: 503 });
  }
}

export default {
  fetch: handleRequest,
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    if (!env.BOT_TOKEN || !env.DB) return;
    try {
      await retryDue(env.DB, telegram(env.BOT_TOKEN), env.OWNER_IDS);
    } catch (error) {
      console.error(
        "retry_failed",
        error instanceof Error ? error.name : "unknown",
      );
    }
  },
};
