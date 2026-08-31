import type {
  CleaningReport,
  MappingResult,
  ParseResult,
  SheetScan,
  Transaction,
} from "../types";
import { round2 } from "@/shared/constants/math";

/** Prevent Infinity / NaN totals without changing ordinary merchant files. */
export const MAX_ABS_AMOUNT = 1e12;
export const MAX_ABS_QTY = 1e9;
export const MAX_WORKSPACE_TRANSACTIONS = 50_000;

const EMPTY_MAPPING: MappingResult = {
  mapping: {},
  scores: {},
  headers: [],
  unmappedHeaders: [],
  warnings: [],
};

const EMPTY_CLEANING: CleaningReport = {
  sourceRows: 0,
  validRows: 0,
  skippedRows: 0,
  columnsDetected: 0,
  columnsMapped: 0,
  valuesFixed: 0,
  duplicatesRemoved: 0,
  reviewNeeded: 0,
};

export function finiteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function clampAbs(value: number, maxAbs: number): number {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(value) > maxAbs) return Math.sign(value) * maxAbs;
  return value;
}

function coerceDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

/**
 * Authoritative line revenue from the parser formula in lib/parser.ts:
 *   revenue column if no unit price, else sellingPrice * (quantity || 1)
 * No discount/tax term exists in ingest.
 */
export function canonicalLineRevenue(input: {
  sellingPrice: number;
  quantity: number;
  sourceRevenue: number;
}): number {
  const sellingPrice = clampAbs(finiteNumber(input.sellingPrice), MAX_ABS_AMOUNT);
  const quantity = clampAbs(finiteNumber(input.quantity), MAX_ABS_QTY);
  const sourceRevenue = clampAbs(finiteNumber(input.sourceRevenue), MAX_ABS_AMOUNT);
  if (sellingPrice !== 0) {
    const line = sellingPrice * (quantity || 1);
    return Number.isFinite(line) ? line : 0;
  }
  return sourceRevenue;
}

export function canonicalizeTransaction(raw: unknown): Transaction {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const quantity = clampAbs(finiteNumber(row.quantity, 1), MAX_ABS_QTY);
  const sellingPrice = clampAbs(finiteNumber(row.sellingPrice), MAX_ABS_AMOUNT);
  const costPrice = clampAbs(finiteNumber(row.costPrice), MAX_ABS_AMOUNT);
  const sourceRevenue = clampAbs(finiteNumber(row.revenue), MAX_ABS_AMOUNT);
  const expense = clampAbs(finiteNumber(row.expense), MAX_ABS_AMOUNT);

  const isExpenseLine = expense !== 0 && sellingPrice === 0 && sourceRevenue === 0;
  const revenue = isExpenseLine ? 0 : canonicalLineRevenue({ sellingPrice, quantity, sourceRevenue });

  const bucket =
    row.bucket === "revenue" ||
    row.bucket === "opex" ||
    row.bucket === "salaries" ||
    row.bucket === "cogs" ||
    row.bucket === "waste"
      ? row.bucket
      : undefined;

  return {
    date: coerceDate(row.date),
    product: typeof row.product === "string" ? row.product : "",
    sku: typeof row.sku === "string" ? row.sku : "",
    quantity,
    sellingPrice,
    costPrice,
    revenue,
    sourceRevenue,
    expense: isExpenseLine ? expense : sellingPrice !== 0 ? 0 : expense,
    category: typeof row.category === "string" ? row.category : "",
    expenseType: typeof row.expenseType === "string" ? row.expenseType : "",
    notes: typeof row.notes === "string" ? row.notes : "",
    sourceSheet: typeof row.sourceSheet === "string" ? row.sourceSheet : undefined,
    bucket,
    confidence: typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : undefined,
    needsReview: typeof row.needsReview === "boolean" ? row.needsReview : undefined,
    classifyTerm: typeof row.classifyTerm === "string" ? row.classifyTerm : undefined,
    classifyTermKey: typeof row.classifyTermKey === "string" ? row.classifyTermKey : undefined,
  };
}

function sanitizeMapping(raw: unknown): MappingResult {
  if (!raw || typeof raw !== "object") return EMPTY_MAPPING;
  const row = raw as Partial<MappingResult>;
  return {
    mapping: row.mapping && typeof row.mapping === "object" ? row.mapping : {},
    scores: row.scores && typeof row.scores === "object" ? row.scores : {},
    headers: Array.isArray(row.headers) ? row.headers.map((h) => String(h)) : [],
    unmappedHeaders: Array.isArray(row.unmappedHeaders) ? row.unmappedHeaders.map((h) => String(h)) : [],
    warnings: Array.isArray(row.warnings) ? row.warnings.map((w) => String(w)) : [],
  };
}

function sanitizeCleaning(raw: unknown, fallbackRows: number): CleaningReport {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_CLEANING, sourceRows: fallbackRows, validRows: fallbackRows };
  }
  const row = raw as Record<string, unknown>;
  return {
    sourceRows: Math.max(0, Math.floor(finiteNumber(row.sourceRows, fallbackRows))),
    validRows: Math.max(0, Math.floor(finiteNumber(row.validRows, fallbackRows))),
    skippedRows: Math.max(0, Math.floor(finiteNumber(row.skippedRows))),
    columnsDetected: Math.max(0, Math.floor(finiteNumber(row.columnsDetected))),
    columnsMapped: Math.max(0, Math.floor(finiteNumber(row.columnsMapped))),
    valuesFixed: Math.max(0, Math.floor(finiteNumber(row.valuesFixed))),
    duplicatesRemoved: Math.max(0, Math.floor(finiteNumber(row.duplicatesRemoved))),
    reviewNeeded: Math.max(0, Math.floor(finiteNumber(row.reviewNeeded))),
  };
}

function sanitizeSheets(raw: unknown, transactions: Transaction[]): SheetScan[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const name = typeof row.name === "string" ? row.name : "sheet";
    const role =
      row.role === "detail" || row.role === "summary" || row.role === "empty" || row.role === "skipped"
        ? row.role
        : "detail";
    const related = transactions.filter((tx) => (tx.sourceSheet || name) === name);
    const revenue = related.reduce((sum, tx) => sum + ((tx.bucket ?? "revenue") === "revenue" ? tx.revenue : 0), 0);
    const expenses = related.reduce((sum, tx) => {
      if ((tx.bucket ?? "revenue") === "revenue") return sum + tx.costPrice * (tx.quantity || 1);
      return sum + tx.expense + tx.costPrice * (tx.quantity || 1);
    }, 0);
    return {
      name,
      role,
      rows: Math.max(0, Math.floor(finiteNumber(row.rows, related.length))),
      validRows: Math.max(0, Math.floor(finiteNumber(row.validRows, related.length))),
      reason: typeof row.reason === "string" ? row.reason : undefined,
      revenue: round2(revenue),
      expenses: round2(expenses),
      netProfit: round2(revenue - expenses),
    };
  });
}

export function sanitizeParseResult(raw: unknown): ParseResult {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const incoming = Array.isArray(obj.transactions) ? obj.transactions : [];
  const transactions = incoming.slice(0, MAX_WORKSPACE_TRANSACTIONS).map(canonicalizeTransaction);
  return {
    transactions,
    mapping: sanitizeMapping(obj.mapping),
    fileName: typeof obj.fileName === "string" && obj.fileName.trim() ? obj.fileName.slice(0, 260) : "file",
    sheetName: typeof obj.sheetName === "string" ? obj.sheetName : undefined,
    sheets: sanitizeSheets(obj.sheets, transactions),
    rowCount: transactions.length,
    skippedRows: Math.max(0, Math.floor(finiteNumber(obj.skippedRows))),
    warnings: Array.isArray(obj.warnings) ? obj.warnings.map((w) => String(w)).slice(0, 200) : [],
    cleaning: sanitizeCleaning(obj.cleaning, transactions.length),
  };
}
