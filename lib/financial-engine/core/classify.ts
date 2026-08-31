import { normalizeHeader } from "./mapping";
import { isUnspecifiedProduct } from "./mapping";
import type { ClassificationPrompt, FinancialBucket, TaxonomyMap, Transaction } from "../types";

export const CLASSIFY_CONFIDENCE_THRESHOLD = 0.85;

const BUCKET_KEYWORDS: Record<FinancialBucket, string[]> = {
  waste: [
    "spoilage",
    "waste",
    "expired",
    "damaged",
    "loss",
    "losses",
    "write off",
    "writeoff",
    "shrinkage",
    "تالف",
    "هالك",
    "فساد",
    "منتهي الصلاحية",
    "منتهي الصلاحيه",
    "خسائر",
    "خسارة",
    "تلف",
  ],
  salaries: [
    "salary",
    "salaries",
    "wage",
    "wages",
    "payroll",
    "chef",
    "cashier",
    "bonus",
    "staff",
    "employee",
    "labor",
    "labour",
    "رواتب",
    "اجور",
    "أجور",
    "راتب",
    "الشيف",
    "شيف",
    "الكاشير",
    "كاشير",
    "مكافأة",
    "مكافاه",
    "عمال",
    "موظف",
    "موظفين",
  ],
  opex: [
    "rent",
    "electricity",
    "water",
    "gas",
    "utility",
    "utilities",
    "maintenance",
    "marketing",
    "advertising",
    "ads",
    "packaging",
    "supplies",
    "shipping",
    "delivery",
    "internet",
    "phone bill",
    "insurance",
    "إيجار",
    "ايجار",
    "كهرباء",
    "ماء",
    "مياه",
    "غاز",
    "صيانة",
    "صيانه",
    "تسويق",
    "اعلانات",
    "إعلانات",
    "تغليف",
    "اكياس",
    "أكياس",
    "ادوات",
    "أدوات",
    "شحن",
    "توصيل",
    "فواتير",
    "اشتراك",
  ],
  cogs: [
    "raw materials",
    "raw material",
    "ingredients",
    "ingredient",
    "wholesale",
    "inventory purchase",
    "purchases",
    "purchase",
    "cogs",
    "meat",
    "vegetables",
    "chicken",
    "خامات",
    "مواد خام",
    "لحوم",
    "خضار",
    "جملة",
    "جمله",
    "دجاج",
    "مشتريات",
    "تكلفة المبيعات",
    "تكلفه المبيعات",
  ],
  revenue: [
    "sales",
    "sale",
    "revenue",
    "meal",
    "drink",
    "order",
    "pizza",
    "burger",
    "shawarma",
    "مبيعات",
    "ايرادات",
    "إيرادات",
    "ايراد",
    "وجبة",
    "وجبه",
    "مشروبات",
    "طلبات",
    "بيتزا",
    "برجر",
    "شاورما",
  ],
};

const WEAK_REVENUE_TOKENS = new Set(["sale", "sales", "order", "revenue"]);
const EXPENSE_FAMILY: FinancialBucket[] = ["waste", "salaries", "opex", "cogs"];
const BUCKET_PRIORITY: FinancialBucket[] = ["waste", "salaries", "opex", "cogs", "revenue"];

export interface ClassificationDecision {
  bucket: FinancialBucket;
  confidence: number;
  needsReview: boolean;
  term: string;
  termKey: string;
  amount: number;
  salesScore: number;
  expenseScore: number;
}

function haystackOf(tx: Pick<Transaction, "category" | "product" | "expenseType" | "notes">) {
  return normalizeHeader(`${tx.category} ${tx.product} ${tx.expenseType} ${tx.notes}`);
}

function tokenHits(haystack: string, token: string) {
  const t = normalizeHeader(token);
  if (!t) return false;
  if (/^[a-z0-9 ]+$/.test(t)) {
    const escaped = t.replace(/\s+/g, "\\s+");
    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(haystack);
  }
  return haystack.includes(t);
}

function scoreBucket(haystack: string, bucket: FinancialBucket) {
  return BUCKET_KEYWORDS[bucket].reduce((sum, token) => {
    if (!tokenHits(haystack, token)) return sum;
    const weak = bucket === "revenue" && WEAK_REVENUE_TOKENS.has(normalizeHeader(token));
    return sum + (weak ? 0.35 : 1);
  }, 0);
}

export function classificationTerm(tx: Pick<Transaction, "product" | "category" | "notes">) {
  if (tx.product && !isUnspecifiedProduct(tx.product)) return tx.product.trim();
  if (tx.category && !["عام", "general"].includes(tx.category.trim().toLowerCase())) return tx.category.trim();
  if (tx.notes?.trim()) return tx.notes.trim().slice(0, 80);
  return tx.product?.trim() || tx.category?.trim() || "بند غير مسمى / Unnamed item";
}

export function classificationTermKey(tx: Pick<Transaction, "product" | "category" | "notes">) {
  return normalizeHeader(classificationTerm(tx));
}

export function lineAbsAmount(tx: Pick<Transaction, "revenue" | "expense" | "sellingPrice" | "costPrice" | "quantity" | "originalAmount">) {
  if (tx.originalAmount && tx.originalAmount > 0) return tx.originalAmount;
  const qty = tx.quantity || 1;
  return Math.max(
    Math.abs(tx.revenue),
    Math.abs(tx.expense),
    Math.abs(tx.sellingPrice * qty),
    Math.abs(tx.costPrice * qty),
  );
}

function looksLikeSalesLine(tx: Pick<Transaction, "quantity" | "sellingPrice" | "costPrice" | "revenue" | "expense">) {
  const qty = tx.quantity || 0;
  if (tx.expense > 0 && tx.revenue <= 0 && tx.sellingPrice <= 0) return false;
  if (tx.sellingPrice > 0 && qty > 1) return true;
  if (tx.sellingPrice > 0 && tx.costPrice > 0 && qty >= 1) return true;
  if (tx.revenue > 0 && tx.costPrice > 0 && qty >= 1 && tx.expense <= 0) return true;
  return false;
}

function lookupTaxonomy(termKey: string, taxonomy?: TaxonomyMap) {
  if (!taxonomy || !termKey) return null;
  return taxonomy[termKey] ?? null;
}

export function inspectClassification(
  tx: Pick<
    Transaction,
    "category" | "product" | "expenseType" | "notes" | "revenue" | "expense" | "costPrice" | "sellingPrice" | "quantity" | "originalAmount"
  >,
  taxonomy?: TaxonomyMap,
): ClassificationDecision {
  const term = classificationTerm(tx);
  const termKey = classificationTermKey(tx);
  const amount = lineAbsAmount(tx);
  const learned = lookupTaxonomy(termKey, taxonomy);

  if (learned) {
    return {
      bucket: learned.bucket,
      confidence: 1,
      needsReview: false,
      term,
      termKey,
      amount,
      salesScore: learned.side === "revenue" ? 1 : 0,
      expenseScore: learned.side === "opex" ? 1 : 0,
    };
  }

  const haystack = haystackOf(tx);
  const scores = Object.fromEntries(BUCKET_PRIORITY.map((bucket) => [bucket, scoreBucket(haystack, bucket)])) as Record<
    FinancialBucket,
    number
  >;
  const salesScore = scores.revenue;
  const expenseScore = EXPENSE_FAMILY.reduce((sum, bucket) => sum + scores[bucket], 0);

  let best: FinancialBucket = "revenue";
  let bestScore = -1;
  for (const bucket of BUCKET_PRIORITY) {
    if (scores[bucket] > bestScore) {
      best = bucket;
      bestScore = scores[bucket];
    }
  }

  if (salesScore > 0 && expenseScore > 0) {
    const ratio = Math.abs(salesScore - expenseScore) / (salesScore + expenseScore);
    const confidence = Number((0.48 + ratio * 0.42).toFixed(2));
    return {
      bucket: best,
      confidence,
      needsReview: confidence < CLASSIFY_CONFIDENCE_THRESHOLD,
      term,
      termKey,
      amount,
      salesScore,
      expenseScore,
    };
  }

  if (bestScore > 0 && (salesScore > 0 || expenseScore > 0)) {
    const confidence = Number(Math.min(0.99, 0.86 + 0.06 * (bestScore - 1)).toFixed(2));
    return {
      bucket: best,
      confidence,
      needsReview: confidence < CLASSIFY_CONFIDENCE_THRESHOLD,
      term,
      termKey,
      amount,
      salesScore,
      expenseScore,
    };
  }

  if (tx.expense > 0 && tx.revenue <= 0 && tx.sellingPrice <= 0) {
    return {
      bucket: "opex",
      confidence: 0.9,
      needsReview: false,
      term,
      termKey,
      amount,
      salesScore,
      expenseScore,
    };
  }

  if (looksLikeSalesLine(tx)) {
    return {
      bucket: "revenue",
      confidence: 0.9,
      needsReview: false,
      term,
      termKey,
      amount,
      salesScore,
      expenseScore,
    };
  }

  if (tx.costPrice > 0 && tx.revenue <= 0 && tx.sellingPrice <= 0) {
    return {
      bucket: "cogs",
      confidence: 0.88,
      needsReview: false,
      term,
      termKey,
      amount,
      salesScore,
      expenseScore,
    };
  }

  return {
    bucket: "revenue",
    confidence: 0.42,
    needsReview: true,
    term,
    termKey,
    amount,
    salesScore,
    expenseScore,
  };
}

export function classifyTransaction(
  tx: Pick<Transaction, "category" | "product" | "expenseType" | "notes" | "revenue" | "expense" | "costPrice" | "sellingPrice" | "quantity" | "originalAmount">,
  taxonomy?: TaxonomyMap,
): FinancialBucket {
  return inspectClassification(tx, taxonomy).bucket;
}

export function isSalesTransaction(tx: Pick<Transaction, "bucket" | "revenue" | "needsReview">) {
  return !tx.needsReview && (tx.bucket ?? "revenue") === "revenue" && tx.revenue > 0;
}

export function isExcludedFromProductRankings(tx: Transaction) {
  return tx.needsReview === true || !isSalesTransaction(tx);
}

function applyBucket(tx: Transaction, bucket: FinancialBucket, amount: number): Transaction {
  const qty = tx.quantity || 1;
  const next: Transaction = { ...tx, bucket, needsReview: false };

  if (bucket === "revenue") {
    next.expense = 0;
    next.revenue = amount;
    if (!next.sellingPrice) next.sellingPrice = qty ? amount / qty : amount;
    return next;
  }

  next.revenue = 0;
  next.sellingPrice = 0;

  if (bucket === "cogs") {
    next.expense = 0;
    next.costPrice = qty ? amount / qty : amount;
    return next;
  }

  next.costPrice = 0;
  next.expense = amount;
  return next;
}

export function applyFinancialClassification(tx: Transaction, taxonomy?: TaxonomyMap): Transaction {
  const decision = inspectClassification(tx, taxonomy);
  const amount = decision.amount;
  const next: Transaction = {
    ...tx,
    originalAmount: amount,
    confidence: decision.confidence,
    classifyTerm: decision.term,
    classifyTermKey: decision.termKey,
  };

  if (decision.needsReview) {
    return {
      ...next,
      bucket: undefined,
      needsReview: true,
      revenue: 0,
      expense: 0,
      sellingPrice: 0,
      costPrice: 0,
    };
  }

  return { ...applyBucket(next, decision.bucket, amount), confidence: decision.confidence, needsReview: false };
}

export function classifyAll(transactions: Transaction[], taxonomy?: TaxonomyMap) {
  return transactions.map((tx) => applyFinancialClassification(tx, taxonomy));
}

export function applyLearnedSide(tx: Transaction, side: "revenue" | "opex"): Transaction {
  const amount = lineAbsAmount(tx);
  const decision = inspectClassification({ ...tx, originalAmount: amount });
  const bucket: FinancialBucket =
    side === "revenue" ? "revenue" : EXPENSE_FAMILY.includes(decision.bucket) && decision.expenseScore > 0 ? decision.bucket : "opex";
  return {
    ...applyBucket({ ...tx, originalAmount: amount, classifyTerm: decision.term, classifyTermKey: decision.termKey }, bucket, amount),
    confidence: 1,
    needsReview: false,
  };
}

export function buildClassificationPrompts(transactions: Transaction[]): ClassificationPrompt[] {
  const groups = new Map<string, ClassificationPrompt>();
  for (const tx of transactions) {
    if (!tx.needsReview) continue;
    const key = tx.classifyTermKey || classificationTermKey(tx);
    const term = tx.classifyTerm || classificationTerm(tx);
    const current = groups.get(key) ?? {
      key,
      term,
      amount: 0,
      count: 0,
      confidence: tx.confidence ?? 0.42,
      sheet: tx.sourceSheet,
    };
    current.amount += lineAbsAmount(tx);
    current.count += 1;
    current.confidence = Math.min(current.confidence, tx.confidence ?? current.confidence);
    groups.set(key, current);
  }
  return Array.from(groups.values()).sort((a, b) => b.amount - a.amount);
}

export function bucketTotals(transactions: Transaction[]) {
  const totals = {
    revenue: 0,
    opex: 0,
    salaries: 0,
    cogs: 0,
    waste: 0,
    expenses: 0,
    netProfit: 0,
  };

  for (const tx of transactions) {
    if (tx.needsReview) continue;
    const row = tx.bucket ? tx : applyFinancialClassification(tx);
    if (row.needsReview) continue;
    const qty = row.quantity || 1;
    if (row.bucket === "revenue") {
      totals.revenue += row.revenue;
      totals.cogs += row.costPrice * qty;
    } else if (row.bucket === "cogs") {
      totals.cogs += row.costPrice * qty || row.expense;
    } else if (row.bucket === "salaries") {
      totals.salaries += row.expense;
    } else if (row.bucket === "waste") {
      totals.waste += row.expense;
    } else if (row.bucket === "opex") {
      totals.opex += row.expense;
    }
  }

  totals.expenses = totals.opex + totals.salaries + totals.cogs + totals.waste;
  totals.netProfit = totals.revenue - totals.expenses;
  return totals;
}
