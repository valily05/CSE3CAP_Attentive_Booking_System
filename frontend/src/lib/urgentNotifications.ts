import { urgentStatuses, type UrgentReceipt } from "@/components/urgent/types";

export type UrgentNotification = { code: string; token: string; submittedAt: string; status: string; seen: boolean };
const KEY = "attentive-urgent-notifications";
export const URGENT_NOTIFICATIONS_CHANGED = "urgent-notifications-changed";

export function readUrgentNotifications(): UrgentNotification[] {
 try {
  const value: unknown = JSON.parse(localStorage.getItem(KEY) || "[]");
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is UrgentNotification => Boolean(item && /^ATT\d{4}$/.test(item.code) && typeof item.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(item.token) && typeof item.submittedAt === "string" && urgentStatuses.includes(item.status))).slice(0, 30);
 } catch { return []; }
}

export function saveUrgentNotification(receipt: UrgentReceipt, token: string) {
 if (!token) return;
 try {
  const previous = readUrgentNotifications();
  const old = previous.find(item => item.code === receipt.bookingCode);
  const item = { code: receipt.bookingCode, token, submittedAt: receipt.workflow.submittedAt, status: receipt.status, seen: old?.status === receipt.status ? old.seen : false };
  localStorage.setItem(KEY, JSON.stringify([item, ...previous.filter(entry => entry.code !== item.code)].slice(0, 30)));
  window.dispatchEvent(new Event(URGENT_NOTIFICATIONS_CHANGED));
 } catch { /* The current confirmation still works when storage is unavailable. */ }
}

export function markUrgentNotificationSeen(code: string) {
 try {
  localStorage.setItem(KEY, JSON.stringify(readUrgentNotifications().map(item => item.code === code ? { ...item, seen: true } : item)));
  window.dispatchEvent(new Event(URGENT_NOTIFICATIONS_CHANGED));
 } catch { /* Storage is optional. */ }
}

export function dismissUrgentNotification(code: string) {
 try {
  localStorage.setItem(KEY, JSON.stringify(readUrgentNotifications().filter(item => item.code !== code)));
  sessionStorage.removeItem("urgent-owner-" + code);
  window.dispatchEvent(new Event(URGENT_NOTIFICATIONS_CHANGED));
 } catch { /* Storage is optional. */ }
}
