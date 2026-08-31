/** Shop ledgers should never land on Unix epoch (Jan 1970) or similar parser junk. */
export function isPlausibleBusinessDate(date: Date | null | undefined): date is Date {
  if (!date || Number.isNaN(date.getTime())) return false;
  const year = date.getFullYear();
  return year >= 2000 && year <= 2100;
}
