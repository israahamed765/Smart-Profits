import type { CurrencyCode } from "@/lib/types";
import { ARABIC_MONTHS, monthKey, monthLabel } from "@/shared/constants/calendar";
import type { Locale } from "./i18n";

export { ARABIC_MONTHS, monthKey, monthLabel };

const SAR_PER_UNIT: Record<CurrencyCode, number> = {
  SAR: 1,
  USD: 3.75,
  AED: 1.02,
  JOD: 5.29,
  ILS: 1.03,
};

const MONEY_SUFFIX: Record<Locale, Record<CurrencyCode, string>> = {
  ar: {
    SAR: "ر.س",
    USD: "$",
    AED: "د.إ",
    JOD: "د.أ",
    ILS: "₪",
  },
  en: {
    SAR: "SAR",
    USD: "$",
    AED: "AED",
    JOD: "JOD",
    ILS: "ILS",
  },
};

/** Prefer explicit locale; otherwise follow `document.documentElement.lang` set by AppearanceProvider. */
export function resolveMoneyLocale(locale?: Locale): Locale {
  if (locale === "en" || locale === "ar") return locale;
  if (typeof document !== "undefined") {
    const lang = document.documentElement.lang || "";
    if (lang === "en" || lang.startsWith("en-")) return "en";
  }
  return "ar";
}

export function currencySuffix(currency: CurrencyCode, locale?: Locale) {
  return MONEY_SUFFIX[resolveMoneyLocale(locale)][currency];
}

export function convertAmount(amountSar: number, currency: CurrencyCode) {
  return amountSar / SAR_PER_UNIT[currency];
}

export function formatMoney(
  amountSar: number,
  currency: CurrencyCode,
  options?: { compact?: boolean; locale?: Locale },
) {
  const value = convertAmount(amountSar, currency);
  const abs = Math.abs(value);
  const suffix = currencySuffix(currency, options?.locale);

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

export function formatDateLocale(date: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
