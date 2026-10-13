import type { EventRow } from "./types";
import { escapeHtml } from "./security";

const usernamePattern = /^[A-Za-z0-9_]{5,32}$/;

export function tashkentTime(utc: string): string {
  const date = new Date(`${utc.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return `${utc} UTC`;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}:${value("second")} (Toshkent)`;
}

export function groupLabel(e: EventRow): string {
  const name = escapeHtml(e.group_title ?? e.group_id);
  let url: string | null = null;
  if (e.group_username && usernamePattern.test(e.group_username))
    url = `https://t.me/${e.group_username}`;
  else if (
    String(e.group_id).startsWith("-100") &&
    e.warning_message_id &&
    e.warning_message_id > 0
  )
    url = `https://t.me/c/${String(e.group_id).slice(4)}/${e.warning_message_id}`;
  return url ? `<a href="${url}">${name}</a>` : name;
}

export function senderLabel(e: EventRow): string {
  const name = escapeHtml(e.sender_name ?? e.sender_id ?? "noma’lum");
  if (e.sender_username && usernamePattern.test(e.sender_username))
    return `<a href="https://t.me/${e.sender_username}">${name}</a>`;
  if (e.sender_id && e.sender_id > 0 && !e.sender_chat_id)
    return `<a href="tg://user?id=${e.sender_id}">${name}</a>`;
  return name;
}
