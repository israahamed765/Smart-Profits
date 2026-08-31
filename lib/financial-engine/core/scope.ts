import { dateFromSheetName } from "./sheets";
import { monthKey } from "@/shared/constants/calendar";
import { isUnspecifiedProduct, normalizeHeader } from "./mapping";
import type { Transaction } from "../types";

export interface AnalysisScope {
  monthKey: string | null;
  sheet: string | null;
  product: string | null;
}

export const EMPTY_SCOPE: AnalysisScope = {
  monthKey: null,
  sheet: null,
  product: null,
};

export function scopeIsAll(scope: AnalysisScope) {
  return !scope.monthKey && !scope.sheet && !scope.product;
}

const MONTH_INDEX: Record<string, number> = {
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

export function monthKeyFromDate(date: Date | null | undefined) {
  if (!date || Number.isNaN(date.getTime())) return null;
  return monthKey(date.getFullYear(), date.getMonth());
}

export function filterTransactions(transactions: Transaction[], scope: AnalysisScope) {
  return transactions.filter((tx) => {
    if (scope.sheet) {
      if ((tx.sourceSheet || "") !== scope.sheet) return false;
      if (scope.product && tx.product !== scope.product) return false;
      return true;
    }
    if (scope.monthKey) {
      const key = monthKeyFromDate(tx.date);
      if (key !== scope.monthKey) return false;
    }
    if (scope.product && tx.product !== scope.product) return false;
    return true;
  });
}

export function uniqueProducts(transactions: Transaction[]) {
  const names = new Set<string>();
  for (const tx of transactions) {
    if (tx.product && !isUnspecifiedProduct(tx.product) && !tx.needsReview) names.add(tx.product);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, "ar"));
}

export function detectMonthKeyFromText(text: string, transactions: Transaction[]): string | null {
  const n = normalizeHeader(text);
  if (!n) return null;
  if (/(كل الشهور|كل الاشهر|السنه|السنة|full year|all months|whole year)/.test(n)) return null;

  let month: number | null = null;
  for (const [label, index] of Object.entries(MONTH_INDEX)) {
    if (n.includes(normalizeHeader(label))) {
      month = index;
      break;
    }
  }
  if (month == null) return null;

  const years = transactions
    .map((tx) => tx.date?.getFullYear())
    .filter((year): year is number => typeof year === "number");
  const yearMatch = text.match(/20\d{2}/);
  const year = yearMatch ? Number(yearMatch[0]) : years.sort((a, b) => b - a)[0] ?? new Date().getFullYear();
  return monthKey(year, month);
}

export function detectProductFromText(text: string, products: string[]) {
  const q = normalizeHeader(text);
  const sorted = [...products].sort((a, b) => b.length - a.length);
  return sorted.find((name) => {
    const n = normalizeHeader(name);
    return n.length >= 2 && q.includes(n);
  }) ?? null;
}

export function scopeFromSheetName(name: string, transactions: Transaction[]): AnalysisScope {
  const dated = dateFromSheetName(name);
  const rows = transactions.filter((tx) => (tx.sourceSheet || "") === name);
  const withDates = rows.filter((tx) => tx.date && !Number.isNaN(tx.date.getTime()));
  const wantedMonth = dated?.getMonth() ?? null;
  const sample =
    (wantedMonth != null ? withDates.find((tx) => tx.date!.getMonth() === wantedMonth) : null)?.date ??
    withDates[0]?.date ??
    dated ??
    null;
  return {
    sheet: name,
    monthKey: monthKeyFromDate(sample),
    product: null,
  };
}

export function scopeFromQuestion(text: string, transactions: Transaction[], prev: AnalysisScope): AnalysisScope {
  const month = detectMonthKeyFromText(text, transactions);
  const product = detectProductFromText(text, uniqueProducts(transactions));
  const n = normalizeHeader(text);
  const wantsAllMonths = /(كل الشهور|كل الاشهر|السنه|السنة|full year|all months|whole year)/.test(n);
  const wantsAllProducts = /(كل المنتجات|all products)/.test(n);

  return {
    sheet: month || wantsAllMonths ? null : prev.sheet,
    monthKey: wantsAllMonths ? null : month ?? prev.monthKey,
    product: wantsAllProducts ? null : product ?? (month ? null : prev.product),
  };
}
