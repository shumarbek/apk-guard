import { Api } from "grammy";
import type { Telegram } from "./types";

export function telegram(token: string): Telegram {
  const api = new Api(token);
  return {
    getMe: () => api.getMe(),
    getChatMember: (chatId, userId) => api.getChatMember(chatId, userId),
    deleteMessage: (chatId, messageId) => api.deleteMessage(chatId, messageId),
    sendMessage: (chatId, text, options) =>
      api.sendMessage(chatId, text, options),
  };
}

export function apiCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "error_code" in error) {
    return String((error as { error_code: unknown }).error_code);
  }
  return "network_or_unknown";
}

export function retryAfter(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("parameters" in error))
    return null;
  const p = (error as { parameters?: { retry_after?: unknown } }).parameters;
  return typeof p?.retry_after === "number" && p.retry_after > 0
    ? Math.min(p.retry_after, 60)
    : null;
}
