import { z } from "zod";
import { detectColumns, isUnspecifiedProduct } from "@/lib/financial-engine/core/mapping";
import { applyFinancialClassification } from "@/lib/financial-engine/core/classify";
import type { ParseResult, SheetScan, Transaction } from "@/lib/financial-engine/types";
import { FileParseError } from "@/lib/financial-engine/types";
import { isPlausibleBusinessDate } from "@/lib/financial-engine/core/dates";
import { classifySheetName, dateFromSheetName } from "@/lib/financial-engine/core/sheets";
import { objectsFromSheet } from "./sheet-objects";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

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

function toAsciiDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
}

export function parseNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || value === "") return 0;

  let text = toAsciiDigits(String(value).trim());
  if (!text) return 0;

  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  text = text.replace(/[()]/g, "");
  text = text.replace(
    /ر\.?\s*س\.?|د\.?\s*ا\.?|د\.?\s*أ\.?|sar|usd|aed|egp|kwd|qar|\$|€|£|٪|%/gi,
    "",
  );
  text = text.replace(/,/g, "").replace(/\s+/g, "");

  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -Math.abs(parsed) : parsed;
}

function dateFromNumber(value: number): Date | null {
  if (value >= 36526 && value <= 73050) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + value * 86400000);
  }
  if (value >= 946684800000 && value <= 4102444800000) return new Date(value);
  if (value >= 946684800 && value <= 4102444800) return new Date(value * 1000);
  if (value >= 20000101 && value <= 21001231) {
    const text = String(Math.trunc(value));
    if (text.length === 8) {
      const year = Number(text.slice(0, 4));
      const month = Number(text.slice(4, 6)) - 1;
      const day = Number(text.slice(6, 8));
      const date = new Date(year, month, day);
      if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
        return date;
      }
    }
  }
  return null;
}

export function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return isPlausibleBusinessDate(value) ? value : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const fromNumber = dateFromNumber(value);
    return isPlausibleBusinessDate(fromNumber) ? fromNumber : null;
  }

  if (typeof value !== "string") return null;
  const raw = toAsciiDigits(value.trim());
  if (!raw) return null;

  const asNumber = Number(raw);
  if (raw !== "" && Number.isFinite(asNumber) && /^-?\d+(\.\d+)?$/.test(raw)) {
    const fromNumber = dateFromNumber(asNumber);
    if (isPlausibleBusinessDate(fromNumber)) return fromNumber;
  }

  const iso = new Date(raw);
  if (!Number.isNaN(iso.getTime()) && /\d{4}/.test(raw) && isPlausibleBusinessDate(iso)) {
    return iso;
  }

  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const first = Number(dmy[1]);
    const second = Number(dmy[2]);
    const yearRaw = Number(dmy[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const day = second > 12 ? second : first;
    const month = (second > 12 ? first : first > 12 ? second : second) - 1;
    const date = new Date(year, month, day);
    if (
      !Number.isNaN(date.getTime()) &&
      date.getMonth() === month &&
      date.getDate() === day &&
      isPlausibleBusinessDate(date)
    ) {
      return date;
    }
  }

  const lower = raw.toLowerCase();
  for (const [name, month] of Object.entries(ARABIC_MONTHS)) {
    if (raw.includes(name)) {
      const yearMatch = raw.match(/\d{4}/);
      const dayMatch = raw.match(/\b(\d{1,2})\b/);
      const year = yearMatch ? Number(yearMatch[0]) : new Date().getFullYear();
      const day = dayMatch ? Number(dayMatch[1]) : 1;
      const date = new Date(year, month, day);
      return isPlausibleBusinessDate(date) ? date : null;
    }
  }
  for (const [name, month] of Object.entries(ENGLISH_MONTHS)) {
    if (new RegExp(`(?:^|\\b)${name}(?:\\b|$)`, "i").test(lower)) {
      const yearMatch = raw.match(/\d{4}/);
      const dayMatch = raw.match(/\b(\d{1,2})\b/);
      const year = yearMatch ? Number(yearMatch[0]) : new Date().getFullYear();
      const day = dayMatch ? Number(dayMatch[1]) : 1;
      const date = new Date(year, month, day);
      return isPlausibleBusinessDate(date) ? date : null;
    }
  }

  return null;
}

const TransactionSchema = z.object({
  date: z.date().nullable(),
  product: z.string(),
  sku: z.string(),
  quantity: z.number(),
  sellingPrice: z.number(),
  costPrice: z.number(),
  revenue: z.number(),
  expense: z.number(),
  category: z.string(),
  expenseType: z.string(),
  notes: z.string(),
  sourceSheet: z.string().optional(),
  bucket: z.enum(["revenue", "opex", "salaries", "cogs", "waste"]).optional(),
  originalAmount: z.number().optional(),
  confidence: z.number().optional(),
  needsReview: z.boolean().optional(),
  classifyTerm: z.string().optional(),
  classifyTermKey: z.string().optional(),
});

function isEmptyRow(row: Record<string, unknown>) {
  return Object.values(row).every(
    (value) => value == null || String(value).trim() === "",
  );
}

function looksLikeLineTotals(transactions: Transaction[]) {
  const sales = transactions.filter((tx) => (tx.bucket ?? "revenue") === "revenue");
  const byProduct = new Map<string, Transaction[]>();
  for (const tx of sales) {
    if (!tx.product || tx.quantity <= 0) continue;
    const list = byProduct.get(tx.product) ?? [];
    list.push(tx);
    byProduct.set(tx.product, list);
  }

  let evidence = 0;
  let checks = 0;
  for (const txs of byProduct.values()) {
    const singles = txs.filter((t) => t.quantity === 1 && t.sellingPrice > 0);
    const multiples = txs.filter((t) => t.quantity > 1 && t.sellingPrice > 0);
    if (!singles.length || !multiples.length) continue;
    const unitSell = singles.reduce((sum, t) => sum + t.sellingPrice, 0) / singles.length;
    const unitCost = singles.reduce((sum, t) => sum + t.costPrice, 0) / singles.length;
    for (const row of multiples) {
      checks += 1;
      const expectedSell = unitSell * row.quantity;
      const expectedCost = unitCost * row.quantity;
      const sellOk = Math.abs(row.sellingPrice - expectedSell) <= Math.max(2, expectedSell * 0.1);
      const costOk =
        unitCost === 0 || Math.abs(row.costPrice - expectedCost) <= Math.max(2, expectedCost * 0.1);
      if (sellOk && costOk) evidence += 1;
    }
  }

  return checks >= 1 && evidence / checks >= 0.6;
}

function normalizeLineTotals(transactions: Transaction[], warnings: string[]) {
  if (!looksLikeLineTotals(transactions)) return;
  for (const tx of transactions) {
    tx.revenue = tx.sellingPrice;
    if (tx.quantity > 1) {
      tx.sellingPrice = tx.sellingPrice / tx.quantity;
      tx.costPrice = tx.costPrice / tx.quantity;
    }
  }
  warnings.push(
    "سعر البيع والتكلفة في الملف هما إجمالي السطر وليس سعر الوحدة، فتمت التسوية تلقائياً قبل الحساب.",
  );
}

function emptyParse(fileName: string): ParseResult {
  return {
    transactions: [],
    mapping: { mapping: {}, scores: {}, headers: [], unmappedHeaders: [], warnings: [] },
    fileName,
    rowCount: 0,
    skippedRows: 0,
    warnings: [],
    cleaning: {
      sourceRows: 0,
      validRows: 0,
      skippedRows: 0,
      columnsDetected: 0,
      columnsMapped: 0,
      valuesFixed: 0,
      duplicatesRemoved: 0,
      reviewNeeded: 0,
    },
  };
}

function rowsFromObjects(
  rows: Record<string, unknown>[],
  fileName: string,
  options?: { allowEmpty?: boolean; dateOverride?: Date | null; sourceSheet?: string },
): ParseResult {
  if (rows.length === 0) {
    if (options?.allowEmpty) {
      return emptyParse(fileName);
    }
    throw new FileParseError("الملف فارغ أو لا يحتوي على صفوف بيانات.");
  }

  const headers = Object.keys(rows[0] ?? {});
  if (headers.length === 0) {
    if (options?.allowEmpty) return emptyParse(fileName);
    throw new FileParseError("تعذر قراءة عناوين الأعمدة من الملف.");
  }

  const mappingResult = detectColumns(headers);
  const { mapping } = mappingResult;
  const warnings = [...mappingResult.warnings];
  if (options?.dateOverride) {
    const idx = warnings.findIndex((warning) => warning.includes("عمود تاريخ"));
    if (idx >= 0) warnings.splice(idx, 1);
  }
  const latinHeaders = headers.filter((h) => /[a-z]/i.test(h)).length;
  const arabicHeaders = headers.filter((h) => /[\u0600-\u06FF]/.test(h)).length;
  const unspecified = latinHeaders > arabicHeaders ? "Unspecified" : "غير محدد";
  const generalCat = latinHeaders > arabicHeaders ? "General" : "عام";
  const transactions: Transaction[] = [];
  let skippedRows = 0;
  let valuesFixed = 0;
  let duplicatesRemoved = 0;
  let reviewNeeded = 0;
  const seen = new Set<string>();

  function trackedNumber(value: unknown) {
    if (typeof value === "string" && /[,٪%$]|ر\.?\s*س|د\.?\s*ا/.test(value) && parseNumber(value) !== 0) {
      valuesFixed += 1;
    }
    return parseNumber(value);
  }

  for (const row of rows) {
    if (isEmptyRow(row)) {
      skippedRows += 1;
      continue;
    }

    const quantityRaw = mapping.quantity ? trackedNumber(row[mapping.quantity]) : 1;
    const quantity = quantityRaw === 0 && !mapping.quantity ? 1 : quantityRaw;
    const sellingPrice = mapping.sellingPrice ? trackedNumber(row[mapping.sellingPrice]) : 0;
    const costPrice = mapping.costPrice ? trackedNumber(row[mapping.costPrice]) : 0;
    let revenue = mapping.revenue ? trackedNumber(row[mapping.revenue]) : 0;
    if (!revenue && sellingPrice) revenue = sellingPrice * (quantity || 1);
    const expense = mapping.expense ? trackedNumber(row[mapping.expense]) : 0;

    if (revenue === 0 && expense === 0 && costPrice === 0) {
      skippedRows += 1;
      continue;
    }

    const parsed = TransactionSchema.safeParse({
      date: (mapping.date ? parseDate(row[mapping.date]) : null) ?? options?.dateOverride ?? null,
      product: mapping.product ? String(row[mapping.product] ?? "").trim() || unspecified : unspecified,
      sku: mapping.sku ? String(row[mapping.sku] ?? "").trim() : "",
      quantity: Number.isFinite(quantity) ? quantity : 1,
      sellingPrice,
      costPrice,
      revenue,
      expense,
      category: mapping.category ? String(row[mapping.category] ?? "").trim() || generalCat : generalCat,
      expenseType: mapping.expenseType
        ? String(row[mapping.expenseType] ?? "").trim()
        : "",
      notes: mapping.notes
        ? String(row[mapping.notes] ?? "").trim()
        : String(row["الملاحظات"] ?? row["ملاحظات"] ?? row["Notes"] ?? row["notes"] ?? "").trim(),
      sourceSheet: options?.sourceSheet,
    });

    if (!parsed.success) {
      skippedRows += 1;
      continue;
    }

    const classified = applyFinancialClassification(parsed.data);
    if (classified.revenue === 0 && classified.expense === 0 && classified.costPrice === 0) {
      skippedRows += 1;
      continue;
    }

    const stamp = `${classified.date?.toISOString() ?? ""}|${classified.product}|${classified.quantity}|${classified.sellingPrice}|${classified.costPrice}|${classified.bucket ?? ""}`;
    if (seen.has(stamp)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(stamp);
    if (!classified.date || isUnspecifiedProduct(classified.product)) reviewNeeded += 1;

    transactions.push(classified);
  }

  if (transactions.length === 0) {
    if (options?.allowEmpty) {
      const empty = emptyParse(fileName);
      return { ...empty, skippedRows, warnings, cleaning: { ...empty.cleaning, sourceRows: rows.length, skippedRows } };
    }
    throw new FileParseError(
      "تعذر استخراج أي صف مالي صالح. تحقق من أسماء الأعمدة وأن الأرقام غير فارغة.",
    );
  }

  normalizeLineTotals(transactions, warnings);

  if (skippedRows > 0) {
    warnings.push(`تم تجاهل ${skippedRows} صفوف فارغة أو غير صالحة.`);
  }
  if (duplicatesRemoved > 0) {
    warnings.push(`تم حذف ${duplicatesRemoved} سجلات مكررة.`);
  }

  const mappedCount = Object.values(mapping).filter(Boolean).length;
  return {
    transactions,
    mapping: mappingResult,
    fileName,
    rowCount: transactions.length,
    skippedRows,
    warnings,
    cleaning: {
      sourceRows: rows.length,
      validRows: transactions.length,
      skippedRows,
      columnsDetected: headers.length,
      columnsMapped: mappedCount,
      valuesFixed,
      duplicatesRemoved,
      reviewNeeded,
    },
  };
}

async function parseCsv(text: string, fileName: string): Promise<ParseResult> {
  const Papa = (await import("papaparse")).default;
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  if (parsed.errors.length && !parsed.data.length) {
    throw new FileParseError(
      `تعذر قراءة ملف CSV: ${parsed.errors[0]?.message ?? "تنسيق غير معروف"}`,
    );
  }

  const rows = parsed.data.filter((row) => row && Object.keys(row).length > 0);
  const result = rowsFromObjects(rows, fileName);
  return {
    ...result,
    sheetName: fileName,
    sheets: [
      {
        name: fileName,
        role: "detail",
        rows: result.cleaning.sourceRows,
        validRows: result.rowCount,
      },
    ],
  };
}

async function parseExcel(buffer: ArrayBuffer, fileName: string): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  if (!workbook.SheetNames.length) {
    throw new FileParseError("ملف Excel لا يحتوي على أي ورقة عمل.");
  }

  const scans: SheetScan[] = [];
  const parsedSheets: { name: string; result: ParseResult; role: "detail" | "summary" }[] = [];

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) {
      scans.push({ name, role: "empty", rows: 0, validRows: 0, reason: "ورقة غير موجودة" });
      continue;
    }

    const objects = objectsFromSheet(XLSX, sheet);
    if (!objects.length) {
      scans.push({ name, role: "empty", rows: 0, validRows: 0, reason: "ورقة فارغة" });
      continue;
    }

    const result = rowsFromObjects(objects, fileName, {
      allowEmpty: true,
      dateOverride: dateFromSheetName(name),
      sourceSheet: name,
    });

    if (!result.transactions.length) {
      scans.push({
        name,
        role: "skipped",
        rows: objects.length,
        validRows: 0,
        reason: "لا توجد صفوف مالية واضحة في هذه الورقة",
      });
      continue;
    }

    const role = classifySheetName(name);
    parsedSheets.push({ name, result, role });
  }

  const detail = parsedSheets.filter((item) => item.role === "detail");
  const summary = parsedSheets.filter((item) => item.role === "summary");
  const detailRevenue = detail.reduce(
    (sum, item) => sum + item.result.transactions.reduce((inner, tx) => inner + tx.revenue, 0),
    0,
  );

  const used: typeof parsedSheets = [];
  const skippedSummary: string[] = [];

  if (detail.length) {
    used.push(...detail);
    for (const item of summary) {
      const revenue = item.result.transactions.reduce((sum, tx) => sum + tx.revenue, 0);
      const duplicatesDetail =
        detailRevenue > 0 && Math.abs(revenue - detailRevenue) / detailRevenue < 0.2;
      scans.push({
        name: item.name,
        role: "summary",
        rows: item.result.cleaning.sourceRows,
        validRows: item.result.transactions.length,
        reason: duplicatesDetail
          ? "تجاهلناها لأنها تكرر أرقام الأوراق التفصيلية"
          : "ورقة ملخص — اعتمدنا التفصيل لتجنب مضاعفة الحساب",
      });
      skippedSummary.push(item.name);
    }
  } else if (summary.length) {
    used.push(...summary);
  }

  if (!used.length) {
    throw new FileParseError(
      `تم فحص ${workbook.SheetNames.length} ورقة عمل ولم يُعثر على جدول مالي صالح في أي منها.`,
    );
  }

  for (const item of used) {
    if (scans.some((scan) => scan.name === item.name)) continue;
    scans.push({
      name: item.name,
      role: item.role,
      rows: item.result.cleaning.sourceRows,
      validRows: item.result.transactions.length,
    });
  }

  const seen = new Set<string>();
  const transactions: Transaction[] = [];
  let extraDupes = 0;
  const warnings: string[] = [];
  let sourceRows = 0;
  let skippedRows = 0;
  let valuesFixed = 0;
  let reviewNeeded = 0;
  let columnsDetected = 0;
  const headerUnion = new Set<string>();

  for (const item of used) {
    sourceRows += item.result.cleaning.sourceRows;
    skippedRows += item.result.skippedRows;
    valuesFixed += item.result.cleaning.valuesFixed;
    columnsDetected = Math.max(columnsDetected, item.result.cleaning.columnsDetected);
    item.result.mapping.headers.forEach((header) => headerUnion.add(header));
    warnings.push(...item.result.warnings);
    for (const tx of item.result.transactions) {
      const stamp = `${tx.date?.toISOString() ?? ""}|${tx.product}|${tx.quantity}|${tx.sellingPrice}|${tx.costPrice}|${tx.sourceSheet ?? ""}`;
      if (seen.has(stamp)) {
        extraDupes += 1;
        continue;
      }
      seen.add(stamp);
      if (!tx.date || isUnspecifiedProduct(tx.product)) reviewNeeded += 1;
      transactions.push(tx);
    }
  }

  if (!transactions.length) {
    throw new FileParseError("تعذر دمج أي صف مالي بعد مسح كل أوراق العمل.");
  }

  const richest = [...used].sort(
    (a, b) => Object.values(b.result.mapping.mapping).filter(Boolean).length - Object.values(a.result.mapping.mapping).filter(Boolean).length,
  )[0];
  const mapping = richest.result.mapping;
  mapping.headers = Array.from(headerUnion);
  mapping.warnings = mapping.warnings.filter((warning, index, arr) => arr.indexOf(warning) === index);

  const usedNames = used.map((item) => item.name);
  warnings.unshift(
    `تم مسح ${workbook.SheetNames.length} ورقة عمل بالكامل. استُخدمت: ${usedNames.join("، ")}.`,
  );
  if (skippedSummary.length) {
    warnings.unshift(
      `تم تجاهل ورقة الملخص (${skippedSummary.join("، ")}) لأنها تكرر أرقام الأشهر/الأيام التفصيلية.`,
    );
  }
  if (extraDupes) warnings.push(`حُذف ${extraDupes} سجلاً مكرراً بعد دمج الأوراق.`);

  const uniqueWarnings = warnings.filter((warning, index, arr) => arr.indexOf(warning) === index);
  const duplicatesRemoved = used.reduce((sum, item) => sum + item.result.cleaning.duplicatesRemoved, 0) + extraDupes;

  return {
    transactions,
    mapping,
    fileName,
    sheetName: usedNames.join(" + "),
    sheets: scans.sort((a, b) => workbook.SheetNames.indexOf(a.name) - workbook.SheetNames.indexOf(b.name)),
    rowCount: transactions.length,
    skippedRows,
    warnings: uniqueWarnings,
    cleaning: {
      sourceRows,
      validRows: transactions.length,
      skippedRows,
      columnsDetected,
      columnsMapped: Object.values(mapping.mapping).filter(Boolean).length,
      valuesFixed,
      duplicatesRemoved,
      reviewNeeded,
    },
  };
}

async function parsePdf(buffer: ArrayBuffer, fileName: string): Promise<ParseResult> {
  const { extractRowsFromPdf } = await import("./pdf-extract");
  const { rows, pageCount, method } = await extractRowsFromPdf(buffer);
  const result = rowsFromObjects(rows, fileName);
  const sourceNote =
    method === "table"
      ? `تم استخراج جدول من PDF (${pageCount} صفحة) ثم ربط الأعمدة تلقائياً.`
      : method === "ocr"
        ? `تم قراءة الملف كصورة عبر التعرف البصري واستخراج الأعمدة (${pageCount} صفحة).`
        : `تم استخراج النص من PDF (${pageCount} صفحة) وتحويله إلى جدول. راجع الأعمدة المكتشفة.`;
  return {
    ...result,
    warnings: [sourceNote, ...result.warnings],
  };
}

async function parseImage(file: File): Promise<ParseResult> {
  const { extractRowsFromImageSource } = await import("./ocr");
  const rows = await extractRowsFromImageSource(file);
  const result = rowsFromObjects(rows, file.name);
  return {
    ...result,
    warnings: ["تم قراءة الصورة واستخراج الأعمدة عبر التعرف البصري (OCR).", ...result.warnings],
  };
}

export async function parseFinancialFile(file: File): Promise<ParseResult> {
  if (file.size > MAX_FILE_BYTES) {
    throw new FileParseError("حجم الملف يتجاوز الحد الأقصى 50 ميجابايت.");
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  const imageExts = ["png", "jpg", "jpeg", "webp", "bmp"];
  if (!ext || !["csv", "xlsx", "xls", "pdf", ...imageExts].includes(ext)) {
    throw new FileParseError("صيغة غير مدعومة. ارفع Excel أو CSV أو PDF أو صورة (PNG/JPG) فيها أعمدة.");
  }

  try {
    if (ext === "csv") {
      const text = await file.text();
      return parseCsv(text, file.name);
    }
    if (imageExts.includes(ext)) {
      return parseImage(file);
    }

    const buffer = await file.arrayBuffer();
    const copy = buffer.slice(0);
    if (ext === "pdf") return parsePdf(copy, file.name);
    return parseExcel(copy, file.name);
  } catch (error) {
    if (error instanceof FileParseError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/detached|structuredClone|DataCloneError/i.test(message)) {
      throw new FileParseError("تعذر قراءة الملف في المتصفح. أعد المحاولة أو ارفع Excel/CSV.");
    }
    throw new FileParseError(
      "تعذر قراءة الملف. تأكد أنه يحتوي على أعمدة واضحة، أو ارفع Excel/CSV.",
    );
  }
}

export async function parseCsvText(text: string, fileName = "sample.csv") {
  return parseCsv(text, fileName);
}
