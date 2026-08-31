import type { Locale } from "./i18n";

function hasArabic(text: string) {
  return /[\u0600-\u06FF]/.test(text);
}

function splitBilingual(text: string): { en: string; ar: string } | null {
  const idx = text.indexOf(" / ");
  if (idx < 0) return null;
  const left = text.slice(0, idx).trim();
  const right = text.slice(idx + 3).trim();
  if (!left || !right) return null;
  const leftAr = hasArabic(left);
  const rightAr = hasArabic(right);
  if (leftAr === rightAr) return null;
  return leftAr ? { ar: left, en: right } : { en: left, ar: right };
}

const EXACT_EN: Record<string, string> = {
  "سعر البيع والتكلفة في الملف هما إجمالي السطر وليس سعر الوحدة، فتمت التسوية تلقائياً قبل الحساب.":
    "Selling price and cost in the file are line totals, not unit prices. They were normalized before calculation.",
  "هذه بيانات تجريبية للعرض. ارفع ملف Excel أو CSV أو PDF لرؤية أرقام متجرك.":
    "This is demo data. Upload an Excel, CSV, or PDF file to see your store numbers.",
  "تم قراءة الصورة واستخراج الأعمدة عبر التعرف البصري (OCR).":
    "The image was read and columns were extracted with OCR.",
};

const DYNAMIC: Array<{ re: RegExp; en: (m: RegExpMatchArray) => string }> = [
  {
    re: /^تم تجاهل (\d+) صفوف فارغة أو غير صالحة\.$/,
    en: (m) => `Skipped ${m[1]} empty or invalid rows.`,
  },
  {
    re: /^تم حذف (\d+) سجلات مكررة\.$/,
    en: (m) => `Removed ${m[1]} duplicate records.`,
  },
  {
    re: /^حُذف (\d+) سجلاً مكرراً بعد دمج الأوراق\.$/,
    en: (m) => `Removed ${m[1]} duplicates after merging worksheets.`,
  },
  {
    re: /^تم مسح (\d+) ورقة عمل بالكامل\. استُخدمت: (.+)\.$/,
    en: (m) => `Scanned ${m[1]} worksheets. Used: ${m[2]}.`,
  },
  {
    re: /^تم تجاهل ورقة الملخص \((.+)\) لأنها تكرر أرقام الأشهر\/الأيام التفصيلية\.$/,
    en: (m) => `Ignored summary sheet (${m[1]}) because it duplicates monthly/daily totals.`,
  },
  {
    re: /^تم استخراج جدول من PDF \((\d+) صفحة\) ثم ربط الأعمدة تلقائياً\.$/,
    en: (m) => `Extracted a table from the PDF (${m[1]} pages) and mapped columns automatically.`,
  },
  {
    re: /^تم قراءة الملف كصورة عبر التعرف البصري واستخراج الأعمدة \((\d+) صفحة\)\.$/,
    en: (m) => `Read the file as an image with OCR and extracted columns (${m[1]} pages).`,
  },
  {
    re: /^تم استخراج النص من PDF \((\d+) صفحة\) وتحويله إلى جدول\. راجع الأعمدة المكتشفة\.$/,
    en: (m) => `Extracted text from the PDF (${m[1]} pages) and turned it into a table. Review the detected columns.`,
  },
];

export function localizeWarning(text: string, locale: Locale): string {
  const split = splitBilingual(text);
  if (split) return locale === "en" ? split.en : split.ar;
  if (locale === "ar") return text;
  if (EXACT_EN[text]) return EXACT_EN[text];
  for (const rule of DYNAMIC) {
    const match = text.match(rule.re);
    if (match) return rule.en(match);
  }
  return text;
}

export function localizeSheetReason(reason: string | undefined, locale: Locale): string {
  if (!reason) return "";
  if (locale === "ar") return reason;
  const map: Record<string, string> = {
    "ورقة فارغة": "Empty sheet",
    "ورقة غير موجودة": "Sheet missing",
    "لا توجد صفوف مالية واضحة في هذه الورقة": "No clear financial rows in this sheet",
    "تجاهلناها لأنها تكرر أرقام الأوراق التفصيلية": "Skipped — it duplicates the detail sheets",
    "ورقة ملخص — اعتمدنا التفصيل لتجنب مضاعفة الحساب": "Summary sheet — detail sheets were used to avoid double counting",
  };
  return map[reason] ?? localizeWarning(reason, locale);
}
