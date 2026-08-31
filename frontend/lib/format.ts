import type { CurrencyCode } from "@/lib/types";
import { ARABIC_MONTHS, monthKey, monthLabel } from "@/shared/constants/calendar";

export { ARABIC_MONTHS, monthKey, monthLabel };

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

export function currencySuffix(currency: CurrencyCode) {
  return MONEY_SUFFIX[currency];
}

export function convertAmount(amountSar: number, currency: CurrencyCode) {
  return amountSar / SAR_PER_UNIT[currency];
}

export function formatMoney(
  amountSar: number,
  currency: CurrencyCode,
  options?: { compact?: boolean },
) {
  const value = convertAmount(amountSar, currency);
  const abs = Math.abs(value);
  const suffix = MONEY_SUFFIX[currency];

  if (options?.compact && abs >= 1000) {
    const compact =
      abs >= 1_000_000
        ? `${(value / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`
        : `${Math.round(value / 1000)}k`;
    return currency === "USD" ? `$${compact}` : `${compact} ${suffix}`;
  }

  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return currency === "USD" ? `$${formatted}` : `${formatted} ${suffix}`;
}

export function formatPct(value: number, digits = 1) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatDateAr(date: Date) {
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
