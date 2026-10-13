import type { EventRow } from "./types";

export interface NewEvent {
  updateId: number;
  groupId: number;
  groupTitle: string | null;
  groupUsername: string | null;
  messageId: number;
  senderId: number | null;
  senderName: string | null;
  senderUsername: string | null;
  senderChatId: number | null;
  fileName: string | null;
  mimeType: string | null;
  reason: string;
}

export async function insertEvent(db: D1Database, e: NewEvent): Promise<void> {
  await db
    .prepare(`INSERT OR IGNORE INTO groups(group_id) VALUES (?)`)
    .bind(e.groupId)
    .run();
  await db
    .prepare(
      `INSERT OR IGNORE INTO moderation_events
    (update_id, group_id, group_title, group_username, message_id, sender_id,
      sender_name, sender_username, sender_chat_id, file_name, mime_type, detection_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      e.updateId,
      e.groupId,
      e.groupTitle,
      e.groupUsername,
      e.messageId,
      e.senderId,
      e.senderName,
      e.senderUsername,
      e.senderChatId,
      e.fileName,
      e.mimeType,
      e.reason,
    )
    .run();
}

export async function eventById(
  db: D1Database,
  id: number,
): Promise<EventRow | null> {
  return db
    .prepare("SELECT * FROM moderation_events WHERE update_id = ?")
    .bind(id)
    .first<EventRow>();
}

export async function claimDelete(
  db: D1Database,
  id: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE moderation_events SET delete_status='deleting',
    delete_attempts=delete_attempts+1, updated_at=CURRENT_TIMESTAMP
    WHERE update_id=? AND delete_attempts<3 AND
    (delete_status='pending' OR
     (delete_status='delete_failed' AND next_retry_at IS NOT NULL AND next_retry_at<=CURRENT_TIMESTAMP) OR
     (delete_status='deleting' AND updated_at<=datetime('now','-2 minutes')))`,
    )
    .bind(id)
    .run();
  return result.meta.changes > 0;
}

export async function finishDelete(
  db: D1Database,
  id: number,
  success: boolean,
  code: string | null,
  retrySeconds: number | null,
): Promise<void> {
  const next =
    retrySeconds === null
      ? null
      : new Date(Date.now() + retrySeconds * 1000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
  await db
    .prepare(
      `UPDATE moderation_events SET delete_status=?, delete_error=?, next_retry_at=?,
    updated_at=CURRENT_TIMESTAMP WHERE update_id=?`,
    )
    .bind(success ? "deleted" : "delete_failed", code, next, id)
    .run();
}

export async function dueDeletes(db: D1Database): Promise<EventRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM moderation_events WHERE delete_attempts<3 AND
    ((delete_status='delete_failed' AND next_retry_at<=CURRENT_TIMESTAMP) OR
     (delete_status='deleting' AND updated_at<=datetime('now','-2 minutes')))
    ORDER BY created_at LIMIT 1`,
    )
    .all<EventRow>();
  return result.results;
}

export async function upsertPrivateUser(
  db: D1Database,
  id: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO private_users(user_id) VALUES (?)
    ON CONFLICT(user_id) DO UPDATE SET last_seen_at=CURRENT_TIMESTAMP`,
    )
    .bind(id)
    .run();
}

export async function privateUserExists(
  db: D1Database,
  id: number,
): Promise<boolean> {
  return !!(await db
    .prepare("SELECT user_id FROM private_users WHERE user_id=?")
    .bind(id)
    .first());
}

export async function subscribe(
  db: D1Database,
  groupId: number,
  userId: number,
): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO subscriptions(group_id,user_id) VALUES (?,?)",
    )
    .bind(groupId, userId)
    .run();
}

export async function unsubscribe(
  db: D1Database,
  groupId: number,
  userId: number,
): Promise<void> {
  await db
    .prepare("DELETE FROM subscriptions WHERE group_id=? AND user_id=?")
    .bind(groupId, userId)
    .run();
}

export async function subscriptionsForUser(
  db: D1Database,
  userId: number,
): Promise<number[]> {
  const rows = await db
    .prepare(
      "SELECT group_id FROM subscriptions WHERE user_id=? ORDER BY group_id",
    )
    .bind(userId)
    .all<{ group_id: number }>();
  return rows.results.map((r) => r.group_id);
}

export async function recipients(
  db: D1Database,
  groupId: number,
): Promise<number[]> {
  const rows = await db
    .prepare("SELECT user_id FROM subscriptions WHERE group_id=?")
    .bind(groupId)
    .all<{ user_id: number }>();
  return rows.results.map((r) => r.user_id);
}

export async function recentEvents(db: D1Database): Promise<EventRow[]> {
  const rows = await db
    .prepare(
      "SELECT * FROM moderation_events ORDER BY created_at DESC LIMIT 10",
    )
    .all<EventRow>();
  return rows.results;
}
