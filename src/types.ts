import type { ChatMember, User } from "grammy/types";

export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  OWNER_IDS: string;
}

export interface Telegram {
  getMe(): Promise<User>;
  getChatMember(chatId: number, userId: number): Promise<ChatMember>;
  deleteMessage(chatId: number, messageId: number): Promise<true>;
  sendMessage(
    chatId: number,
    text: string,
    options?: { parse_mode?: "HTML" },
  ): Promise<{ message_id?: number }>;
}

export interface EventRow {
  update_id: number;
  group_id: number;
  group_title: string | null;
  group_username: string | null;
  message_id: number;
  sender_id: number | null;
  sender_name: string | null;
  sender_username: string | null;
  sender_chat_id: number | null;
  warning_message_id: number | null;
  file_name: string | null;
  mime_type: string | null;
  detection_reason: string;
  delete_status: string;
  delete_attempts: number;
  delete_error: string | null;
  next_retry_at: string | null;
  warning_status: string;
  warning_attempts: number;
  created_at: string;
}
