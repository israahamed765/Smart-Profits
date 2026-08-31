/**
 * Calendar identity for monthly series and forecasts.
 * Not money display — `formatMoney` stays in lib/format.ts.
 * Implementations must stay identical to the former lib/format helpers.
 */
export const ARABIC_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

export function monthLabel(year: number, month: number) {
  return `${ARABIC_MONTHS[month]} ${year}`;
}

export function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}
