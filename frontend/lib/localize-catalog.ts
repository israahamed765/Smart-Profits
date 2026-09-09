import type { Locale } from "./i18n";

/**
 * Display-only map for built-in demo / engine Arabic labels.
 * Keep raw values in state for filtering; translate at render time when locale=en.
 */
const CATALOG_EN: Record<string, string> = {
  "بيانات تجريبية.csv": "demo-data.csv",
  "بيانات تجريبية": "Demo data",
  "متجر التاجر": "Merchant store",
  أحمد: "Ahmed",
  "سماعات لاسلكية": "Wireless headphones",
  "ساعة ذكية": "Smart watch",
  "شاحن سريع": "Fast charger",
  "كيبورد ميكانيكي": "Mechanical keyboard",
  "حامل لابتوب": "Laptop stand",
  "شحن وتوصيل": "Shipping & delivery",
  "حملة تسويق": "Marketing campaign",
  إلكترونيات: "Electronics",
  إكسسوارات: "Accessories",
  "إلكترونيات استهلاكية": "Consumer electronics",
  شحن: "Shipping",
  تسويق: "Marketing",
  "تكلفة المبيعات / خامات": "Cost of goods",
  الإيجار: "Rent",
  الرواتب: "Salaries",
  "فواتير وخدمات": "Utilities",
  "تسويق وتشغيل": "Marketing & opex",
  "تالف وهالك": "Waste & spoilage",
  "مصروفات غير مصنّفة": "Unclassified expenses",
};

export function localizeCatalogLabel(text: string, locale: Locale): string {
  if (!text || locale !== "en") return text;
  return CATALOG_EN[text] ?? text;
}

export function localizeFileName(fileName: string, locale: Locale, isDemo = false): string {
  if (locale !== "en") return fileName;
  if (isDemo || CATALOG_EN[fileName]) return CATALOG_EN[fileName] ?? fileName;
  return fileName;
}
