import type { CurrencyCode } from "@/lib/types";

const SAR_PER_UNIT: Record<CurrencyCode, number> = {
  SAR: 1,
  USD: 3.75,
  AED: 1.02,
  JOD: 5.29,
  ILS: 1.03,
};

const MONEY_SUFFIX: Record<CurrencyCode, string> = {
  SAR: "ر.س",
  USD: "$",
  AED: "د.إ",
  JOD: "د.أ",
  ILS: "₪",
};

export function formatMoney(amountSar: number, currency: CurrencyCode) {
  const value = amountSar / SAR_PER_UNIT[currency];
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return currency === "USD" ? `$${formatted}` : `${formatted} ${MONEY_SUFFIX[currency]}`;
}

export function formatDateAr(date: Date) {
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
