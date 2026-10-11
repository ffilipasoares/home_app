const pad = (n: number) => String(n).padStart(2, "0");

/** Today on this device, YYYY-MM-DD (local time, not UTC). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** This month on this device, YYYY-MM. */
export function currentMonth(): string {
  return todayIso().slice(0, 7);
}

function monthDate(month: string): Date {
  return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
}

function isoDate(date: string): Date {
  return new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

/** "October 2026" */
export function formatMonth(month: string): string {
  return monthDate(month).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/** The month `delta` months after `month` (negative: before). */
export function shiftMonth(month: string, delta: number): string {
  const d = monthDate(month);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** "Today", "Yesterday" or "Saturday 10 October" (with the year when it isn't this year). */
export function formatDayHeading(date: string): string {
  const today = todayIso();
  if (date === today) return "Today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date === `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`) {
    return "Yesterday";
  }
  return isoDate(date).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
  });
}

/** "11 Oct 2026" from YYYY-MM-DD or a timestamp in ms. */
export function formatShortDate(value: string | number): string {
  const d = typeof value === "number" ? new Date(value) : isoDate(value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "today, 13:00" or "10 Oct, 23:00" from a timestamp in ms. */
export function formatSyncTime(ms: number): string {
  const d = new Date(ms);
  const day =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` === todayIso()
      ? "today"
      : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${day}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
