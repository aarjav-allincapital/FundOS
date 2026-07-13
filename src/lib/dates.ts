/** Local calendar date as YYYY-MM-DD (not UTC). */

export function todayLocalIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** True when `date` is strictly after today (local). */
export function isAfterToday(date: string): boolean {
  if (!date) return false;
  return date > todayLocalIso();
}

/** Clamp a date down to today when it would otherwise be in the future. */
export function clampNotAfterToday(date: string | null | undefined): string {
  const today = todayLocalIso();
  if (!date) return today;
  return date > today ? today : date;
}
