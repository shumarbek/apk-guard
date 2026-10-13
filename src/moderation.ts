import type { EventRow, Telegram } from "./types";
import { escapeHtml, ownerIds } from "./security";
import { apiCode, retryAfter } from "./telegram";
import { claimDelete, dueDeletes, eventById } from "./repository";
import { groupLabel, senderLabel, tashkentTime } from "./display";

function isAdmin(status: string): boolean {
  return status === "administrator" || status === "creator";
}

function retryTime(seconds: number): string {
  return new Date(Date.now() + seconds * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

export function warningText(e: EventRow): string {
  const result =
    e.delete_status === "deleted"
      ? "muvaffaqiyatli o‘chirildi"
      : "o‘chirilmadi; administrator aralashuvi kerak";
  return `⚠️ <b>Xavfsizlik ogohlantirishi</b>\nGuruhda APK aniqlandi.\n📄 Fayl: <code>${escapeHtml(e.file_name ?? "nomi ko‘rsatilmagan")}</code>\n👤 Yuboruvchi: ${senderLabel(e)}${e.sender_id ? ` (ID: <code>${e.sender_id}</code>)` : ""}\n🛡️ Amal: ${result}.`;
}

export function notificationText(e: EventRow): string {
  return `🚨 <b>APK fayl aniqlandi</b>\nGuruh: ${groupLabel(e)}\nFayl: <code>${escapeHtml(e.file_name ?? "nomi yo‘q")}</code>\nYuboruvchi: ${senderLabel(e)}${e.sender_id ? ` (ID: <code>${e.sender_id}</code>)` : ""}\nXabar ID: <code>${e.message_id}</code>\nVaqt: ${escapeHtml(tashkentTime(e.created_at))}\nO‘chirish: ${e.delete_status === "deleted" ? "muvaffaqiyatli" : "muvaffaqiyatsiz yoki tasdiqlanmagan"}\nSabab: ${escapeHtml(e.detection_reason)}${e.delete_error ? `\nAPI xato kodi: ${escapeHtml(e.delete_error)}` : ""}`;
}

export async function attemptDelete(
  db: D1Database,
  tg: Telegram,
  id: number,
): Promise<void> {
  if (!(await claimDelete(db, id))) return;
  const e = await eventById(db, id);
  if (!e) throw new Error("Event missing after claim");
  try {
    const ok = await tg.deleteMessage(e.group_id, e.message_id);
    if (ok !== true) throw new Error("deleteMessage returned non-true");
  } catch (error) {
    const code = apiCode(error);
    const backoff = retryAfter(error);
    const retry =
      e.delete_attempts < 3 &&
      (code === "429" || code === "network_or_unknown" || Number(code) >= 500)
        ? retryTime(backoff ?? 30 * e.delete_attempts)
        : null;
    await db
      .prepare(
        `UPDATE moderation_events SET delete_status='delete_failed', delete_error=?,
      next_retry_at=?, updated_at=CURRENT_TIMESTAMP WHERE update_id=?`,
      )
      .bind(code, retry, id)
      .run();
    if (!retry)
      await db
        .prepare(
          `UPDATE groups SET moderation_status='delete_failed',
      last_api_code=?, checked_at=CURRENT_TIMESTAMP WHERE group_id=?`,
        )
        .bind(code, e.group_id)
        .run();
    return;
  }
  await db
    .prepare(
      `UPDATE moderation_events SET delete_status='deleted', delete_error=NULL,
    next_retry_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE update_id=?`,
    )
    .bind(id)
    .run();
  await db
    .prepare(
      `UPDATE groups SET moderation_status='active', last_api_code=NULL,
    checked_at=CURRENT_TIMESTAMP WHERE group_id=?`,
    )
    .bind(e.group_id)
    .run();
}

async function queueDeliveries(
  db: D1Database,
  e: EventRow,
  owners: number[],
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO notification_deliveries(update_id, recipient_id)
    SELECT ?, user_id FROM subscriptions WHERE group_id=?`,
    )
    .bind(e.update_id, e.group_id)
    .run();
  if (owners.length) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO notification_deliveries(update_id, recipient_id)
      SELECT ?, CAST(value AS INTEGER) FROM json_each(?)`,
      )
      .bind(e.update_id, JSON.stringify(owners))
      .run();
  }
}

async function sendWarning(
  db: D1Database,
  tg: Telegram,
  e: EventRow,
): Promise<void> {
  const claim = await db
    .prepare(
      `UPDATE moderation_events SET warning_status='sending',
    warning_attempts=warning_attempts+1, updated_at=CURRENT_TIMESTAMP WHERE update_id=?
    AND warning_attempts<3 AND (warning_status='pending' OR
      (warning_status='retry' AND warning_retry_at<=CURRENT_TIMESTAMP))`,
    )
    .bind(e.update_id)
    .run();
  if (!claim.meta.changes) return;
  let warningMessageId: number | null = null;
  try {
    const warning = await tg.sendMessage(e.group_id, warningText(e), {
      parse_mode: "HTML",
    });
    warningMessageId = warning.message_id ?? null;
  } catch (error) {
    const wait = retryAfter(error);
    await db
      .prepare(
        `UPDATE moderation_events SET warning_status=?, warning_retry_at=? WHERE update_id=?`,
      )
      .bind(
        wait && e.warning_attempts < 2 ? "retry" : "failed",
        wait ? retryTime(wait) : null,
        e.update_id,
      )
      .run();
    return;
  }
  await db
    .prepare(
      "UPDATE moderation_events SET warning_status='sent', warning_message_id=? WHERE update_id=?",
    )
    .bind(warningMessageId, e.update_id)
    .run();
}

async function sendDeliveries(
  db: D1Database,
  tg: Telegram,
  e: EventRow,
  owners: number[],
): Promise<void> {
  const rows = await db
    .prepare(
      `SELECT recipient_id, attempts FROM notification_deliveries
    WHERE update_id=? AND (status='pending' OR (status='retry' AND retry_at<=CURRENT_TIMESTAMP))
    ORDER BY recipient_id LIMIT 5`,
    )
    .bind(e.update_id)
    .all<{ recipient_id: number; attempts: number }>();
  for (const row of rows.results) {
    const claim = await db
      .prepare(
        `UPDATE notification_deliveries SET status='sending',
      attempts=attempts+1, updated_at=CURRENT_TIMESTAMP WHERE update_id=? AND recipient_id=?
      AND status IN ('pending','retry') AND attempts<3`,
      )
      .bind(e.update_id, row.recipient_id)
      .run();
    if (!claim.meta.changes) continue;
    let status = "sent";
    let code: string | null = null;
    let retry: string | null = null;
    try {
      if (!owners.includes(row.recipient_id)) {
        const membership = await tg.getChatMember(e.group_id, row.recipient_id);
        if (!isAdmin(membership.status)) {
          status = "skipped_not_admin";
        }
      }
      if (status === "sent")
        await tg.sendMessage(row.recipient_id, notificationText(e), {
          parse_mode: "HTML",
        });
    } catch (error) {
      code = apiCode(error);
      const wait = retryAfter(error);
      status = wait && row.attempts < 2 ? "retry" : "failed";
      retry = wait ? retryTime(wait) : null;
    }
    await db
      .prepare(
        `UPDATE notification_deliveries SET status=?, error_code=?, retry_at=?,
      updated_at=CURRENT_TIMESTAMP WHERE update_id=? AND recipient_id=?`,
      )
      .bind(status, code, retry, e.update_id, row.recipient_id)
      .run();
  }
}

export async function finishEvent(
  db: D1Database,
  tg: Telegram,
  id: number,
  ownerRaw: string,
): Promise<void> {
  const e = await eventById(db, id);
  if (
    !e ||
    !["deleted", "delete_failed"].includes(e.delete_status) ||
    e.next_retry_at
  )
    return;
  const owners = ownerIds(ownerRaw);
  await queueDeliveries(db, e, owners);
  await sendWarning(db, tg, e);
  await sendDeliveries(db, tg, (await eventById(db, id)) ?? e, owners);
}

export async function retryDue(
  db: D1Database,
  tg: Telegram,
  ownerRaw: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE moderation_events SET delete_status='delete_failed', delete_error='unconfirmed',
    updated_at=CURRENT_TIMESTAMP WHERE delete_status='deleting' AND delete_attempts>=3
    AND updated_at<=datetime('now','-2 minutes')`,
    )
    .run();
  await db
    .prepare(
      `UPDATE moderation_events SET warning_status='unknown' WHERE warning_status='sending'
    AND updated_at<=datetime('now','-2 minutes')`,
    )
    .run();
  await db
    .prepare(
      `UPDATE notification_deliveries SET status='unknown' WHERE status='sending'
    AND updated_at<=datetime('now','-2 minutes')`,
    )
    .run();
  const due = await dueDeletes(db);
  for (const e of due) {
    await attemptDelete(db, tg, e.update_id);
    await finishEvent(db, tg, e.update_id, ownerRaw);
  }
  if (due.length) return;
  const pending = await db
    .prepare(
      `SELECT update_id FROM moderation_events WHERE
    delete_status IN ('deleted','delete_failed') AND
    (warning_status='pending' OR (warning_status='retry' AND warning_retry_at<=CURRENT_TIMESTAMP)
      OR EXISTS (SELECT 1 FROM notification_deliveries n WHERE n.update_id=moderation_events.update_id
        AND (n.status='pending' OR (n.status='retry' AND n.retry_at<=CURRENT_TIMESTAMP))))
    ORDER BY created_at LIMIT 1`,
    )
    .all<{ update_id: number }>();
  for (const e of pending.results)
    await finishEvent(db, tg, e.update_id, ownerRaw);
}
