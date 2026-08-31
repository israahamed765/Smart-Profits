import type { ColumnMapping, ColumnRole, MappingResult } from "../types";

const ROLE_ALIASES: Record<ColumnRole, string[]> = {
  date: [
    "order date",
    "invoice date",
    "sale date",
    "sales date",
    "transaction date",
    "trans date",
    "created at",
    "created_at",
    "datetime",
    "timestamp",
    "date",
    "day",
    "month",
    "period",
    "التاريخ",
    "تاريخ",
    "تاريخ الحركه",
    "تاريخ الحركة",
    "تاريخ العمليه",
    "تاريخ العملية",
    "تاريخ البيع",
    "تاريخ الفاتوره",
    "تاريخ الفاتورة",
    "يوم",
    "شهر",
    "الشهر",
  ],
  product: [
    "product name",
    "item name",
    "item description",
    "product description",
    "product title",
    "merchandise",
    "description",
    "product",
    "item",
    "title",
    "name",
    "المنتج",
    "اسم المنتج",
    "الصنف",
    "اسم الصنف",
    "السلعه",
    "السلعة",
    "الوصف",
    "اسم السلعه",
    "اسم السلعة",
    "البيان",
    "اسم المصروف",
    "اسم العمليه",
    "اسم العملية",
    "البند",
  ],
  sku: [
    "product code",
    "item code",
    "part number",
    "barcode",
    "sku",
    "upc",
    "ean",
    "code",
    "الكود",
    "رمز",
    "كود المنتج",
    "الباركود",
  ],
  quantity: [
    "units sold",
    "qty sold",
    "quantity sold",
    "sold qty",
    "quantity",
    "qty",
    "units",
    "pcs",
    "count",
    "sold",
    "الكمية",
    "الكميه",
    "عدد",
    "الكميات",
    "قطعه",
    "قطعة",
    "العدد المباع",
  ],
  sellingPrice: [
    "selling price",
    "unit price",
    "sale price",
    "sales price",
    "retail price",
    "list price",
    "sell price",
    "unit sell",
    "price",
    "سعر البيع",
    "السعر",
    "سعر الوحده",
    "سعر الوحدة",
    "سعر",
  ],
  costPrice: [
    "cost price",
    "purchase price",
    "unit cost",
    "landed cost",
    "buy price",
    "wholesale",
    "cogs",
    "cost",
    "purchase",
    "التكلفه",
    "التكلفة",
    "سعر التكلفه",
    "سعر التكلفة",
    "سعر الشراء",
    "تكلفة الوحده",
    "تكلفة الوحدة",
    "المشتريات",
  ],
  revenue: [
    "net sales",
    "gross sales",
    "total sales",
    "sales amount",
    "line total",
    "line amount",
    "extended price",
    "subtotal",
    "turnover",
    "revenue",
    "sales",
    "sale",
    "amount",
    "total",
    "المبيعات",
    "الايراد",
    "الإيراد",
    "ايرادات",
    "إيرادات",
    "اجمالي",
    "إجمالي",
    "المبلغ",
    "اجمالي المبيعات",
    "إجمالي المبيعات",
    "صافي المبيعات",
  ],
  expense: [
    "operating expense",
    "operating cost",
    "expense amount",
    "expenses",
    "expense",
    "operating",
    "opex",
    "shipping cost",
    "delivery fee",
    "مصروف",
    "المصروف",
    "المصاريف",
    "مصاريف",
    "تكلفه تشغيليه",
    "تكلفة تشغيلية",
  ],
  category: [
    "category",
    "department",
    "section",
    "group",
    "class",
    "type",
    "transaction type",
    "الفئه",
    "الفئة",
    "تصنيف",
    "القسم",
    "التصنيف",
    "فئه العمليه",
    "فئة العملية",
    "نوع العمليه",
    "نوع العملية",
  ],
  expenseType: [
    "expense type",
    "expense_type",
    "cost type",
    "نوع المصروف",
    "نوع المصاريف",
  ],
  notes: [
    "notes",
    "note",
    "remark",
    "remarks",
    "comment",
    "comments",
    "الملاحظات",
    "ملاحظات",
    "ملاحظة",
    "التفاصيل",
    "تفاصيل",
  ],
};

const ROLE_PENALTIES: Partial<Record<ColumnRole, string[]>> = {
  product: ["customer", "client", "vendor", "supplier", "store", "buyer", "cashier", "user", "account"],
  sku: ["postal", "zip", "phone", "country"],
  date: ["due", "expiry", "expire", "birth", "delivery date"],
  quantity: ["available", "on hand", "remaining", "stock", "inventory", "reorder"],
  sellingPrice: ["cost", "purchase", "wholesale", "buy", "cogs"],
  costPrice: ["selling", "retail", "list", "sale price"],
  revenue: ["tax", "vat", "discount", "fee", "refund", "cogs", "cost", "shipping cost"],
  expense: ["cogs", "cost of goods"],
  expenseType: ["payment", "transaction", "order", "status", "invoice type"],
  category: ["payment", "status"],
  notes: ["product description", "item description"],
};

export function stripTashkeel(value: string) {
  return value.replace(/[\u064B-\u065F\u0670\u0640]/g, "");
}

export function normalizeHeader(header: string) {
  return stripTashkeel(header)
    .toLowerCase()
    .trim()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[_./\\-]+/g, " ")
    .replace(/\s+/g, " ");
}

function scoreAlias(header: string, alias: string, role: ColumnRole) {
  const h = normalizeHeader(header);
  const a = normalizeHeader(alias);
  if (!h || !a) return 0;
  const hWords = h.split(" ").filter(Boolean);
  const aWords = a.split(" ").filter(Boolean);

  let score = 0;
  if (h === a) score = 100;
  else if (h.includes(a) || a.includes(h)) {
    score = aWords.length > 1 ? 92 : 78;
    if (aWords.length === 1 && a.length <= 5 && hWords.length > 1) score = 58;
  } else {
    const overlap = aWords.filter((w) => hWords.includes(w)).length;
    if (overlap > 0) score = 55 + overlap * 10;
  }

  if (!score) return 0;

  for (const word of ROLE_PENALTIES[role] ?? []) {
    const n = normalizeHeader(word);
    if (h.includes(n) && !a.includes(n)) score -= 45;
  }

  return Math.max(0, score);
}

function bestScore(header: string, role: ColumnRole) {
  return Math.max(...ROLE_ALIASES[role].map((alias) => scoreAlias(header, alias, role)));
}

export function detectColumns(headers: string[]): MappingResult {
  const used = new Set<string>();
  const mapping: ColumnMapping = {};
  const scores: Partial<Record<ColumnRole, number>> = {};
  const warnings: string[] = [];

  const roles = Object.keys(ROLE_ALIASES) as ColumnRole[];
  const candidates = roles.flatMap((role) =>
    headers.map((header) => ({
      role,
      header,
      score: bestScore(header, role),
    })),
  );

  candidates
    .filter((c) => c.score >= 55)
    .sort((a, b) => b.score - a.score)
    .forEach((candidate) => {
      if (mapping[candidate.role] || used.has(candidate.header)) return;
      mapping[candidate.role] = candidate.header;
      scores[candidate.role] = candidate.score;
      used.add(candidate.header);
    });

  if (!mapping.date) {
    warnings.push(
      "No date column found. The file will be treated as one period. / لم يُعثر على عمود تاريخ. سيُعامل الملف كفترة واحدة.",
    );
  }
  if (!mapping.revenue && !mapping.sellingPrice) {
    warnings.push(
      "No sales or selling-price column found. Use headers like Sales, Price, Revenue. / لم يُعثر على عمود مبيعات أو سعر بيع. استخدمي عناوين مثل المبيعات أو سعر البيع.",
    );
  }
  if (!mapping.costPrice && !mapping.expense) {
    warnings.push(
      "No cost or expense column found. Operating costs will come from settings only. / لم يُعثر على عمود تكلفة أو مصروف. مصاريف التشغيل ستأتي من الإعدادات فقط.",
    );
  }

  const unmappedHeaders = headers.filter((header) => !used.has(header));

  return { mapping, scores, headers, unmappedHeaders, warnings };
}

export function isUnspecifiedProduct(name: string) {
  const n = name.trim().toLowerCase();
  return !n || ["غير محدد", "unspecified", "unknown", "n/a", "na", "none", "-", "null"].includes(n);
}

export function mappedRoleCount(headers: string[]) {
  return Object.keys(detectColumns(headers).mapping).length;
}

const EXTRA_SPLIT_LABELS = [
  "الملاحظات",
  "ملاحظات",
  "notes",
  "note",
  "البيان",
  "الوصف",
  "description",
];

export function stripKnownHeaders(text: string): string {
  const labels = [...Object.values(ROLE_ALIASES).flat(), ...EXTRA_SPLIT_LABELS]
    .filter((alias) => alias.length >= 3)
    .sort((a, b) => b.length - a.length);

  let result = text;
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "gi"), " ");
  }
  return result.replace(/\s+/g, " ").trim();
}

export function findHeaderTokens(text: string): string[] {
  const normalized = normalizeHeader(text);
  if (!normalized) return [];

  const labels = [
    ...Object.values(ROLE_ALIASES).flat(),
    ...EXTRA_SPLIT_LABELS,
  ]
    .map((alias) => ({ alias, norm: normalizeHeader(alias) }))
    .filter((item) => item.norm.length >= 3)
    .sort((a, b) => b.norm.length - a.norm.length);

  const taken = new Array(normalized.length).fill(false);
  const found: { start: number; alias: string }[] = [];

  for (const { alias, norm } of labels) {
    let from = 0;
    while (from <= normalized.length - norm.length) {
      const pos = normalized.indexOf(norm, from);
      if (pos < 0) break;
      const overlaps = taken.slice(pos, pos + norm.length).some(Boolean);
      if (!overlaps) {
        found.push({ start: pos, alias });
        for (let i = pos; i < pos + norm.length; i += 1) taken[i] = true;
        break;
      }
      from = pos + 1;
    }
  }

  return found.sort((a, b) => a.start - b.start).map((item) => item.alias);
}
