import { normalizeHeader } from "./mapping";

const ARABIC_MONTHS: Record<string, number> = {
  يناير: 0,
  فبراير: 1,
  مارس: 2,
  ابريل: 3,
  أبريل: 3,
  مايو: 4,
  يونيو: 5,
  يوليو: 6,
  اغسطس: 7,
  أغسطس: 7,
  سبتمبر: 8,
  اكتوبر: 9,
  أكتوبر: 9,
  نوفمبر: 10,
  ديسمبر: 11,
};

const ENGLISH_MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

export function dateFromSheetName(name: string): Date | null {
  const raw = name.trim();
  const yearMatch = raw.match(/20\d{2}/);
  const year = yearMatch ? Number(yearMatch[0]) : new Date().getFullYear();

  for (const [label, month] of Object.entries(ARABIC_MONTHS)) {
    if (raw.includes(label)) return new Date(year, month, 1);
  }

  const norm = normalizeHeader(raw);
  for (const [label, month] of Object.entries(ENGLISH_MONTHS)) {
    if (new RegExp(`(?:^|\\b)${label}(?:\\b|$)`).test(norm)) return new Date(year, month, 1);
  }

  const ym = raw.match(/(20\d{2})[-/.](\d{1,2})/) || raw.match(/(\d{1,2})[-/.](20\d{2})/);
  if (ym) {
    const a = Number(ym[1]);
    const b = Number(ym[2]);
    const month = a > 12 ? b - 1 : a - 1;
    const y = a > 12 ? a : b;
    if (month >= 0 && month <= 11) return new Date(y, month, 1);
  }

  return null;
}

export function isSummarySheetName(name: string) {
  const n = normalizeHeader(name);
  return /ملخص|خلاصه|خلاصة|summary|total|totals|اجمالي|dashboard|pivot|overview|مجموع|تقرير عام/.test(n);
}

export function classifySheetName(name: string): "summary" | "detail" {
  if (dateFromSheetName(name)) return "detail";
  if (isSummarySheetName(name)) return "summary";
  return "detail";
}
