import { buildAdvisorReport } from "./advisor";
import { bucketTotals, buildClassificationPrompts, classifyAll, isExcludedFromProductRankings } from "./classify";
import { isUnspecifiedProduct } from "./mapping";
import { monthKey, monthLabel } from "@/shared/constants/calendar";
import { isPlausibleBusinessDate } from "./dates";
import { predictFuturePerformance } from "./forecast";
import { monthlyOpexFromSettings } from "./opex";
import { dateFromSheetName } from "./sheets";
import { clamp, round2, safeDivide } from "@/shared/constants/math";
import { sanitizeParseResult } from "./financial-integrity";
import type {
  AnalysisResult,
  AppSettings,
  ExpenseSlice,
  FinancialKPIs,
  MonthlyPoint,
  ParseResult,
  ProductStat,
  StagnantItem,
  Transaction,
  ProductHighlights,
  ProductPerformance,
  TaxonomyMap,
} from "../types";

const SLICE_COLORS = ["#4FD1C5", "#E8C56B", "#64748B", "#67E8F9", "#F59E0B", "#EF4444"];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function monthOf(date: Date) {
  return { year: date.getFullYear(), month: date.getMonth() };
}

function transactionMonthDate(tx: Transaction): Date {
  if (isPlausibleBusinessDate(tx.date)) return tx.date;
  if (tx.sourceSheet) {
    const fromSheet = dateFromSheetName(tx.sourceSheet);
    if (fromSheet) return fromSheet;
  }
  return new Date();
}

export { monthlyOpexFromSettings };

export function buildMonthlySeries(
  transactions: Transaction[],
  settings: AppSettings,
): MonthlyPoint[] {
  const buckets = new Map<string, MonthlyPoint>();
  const dated = transactions.filter((t) => isPlausibleBusinessDate(t.date));

  const source = dated.length ? dated : transactions;

  for (const tx of source) {
    if (tx.needsReview) continue;
    const date = isPlausibleBusinessDate(tx.date) ? tx.date : transactionMonthDate(tx);
    const { year, month } = monthOf(date);
    const key = monthKey(year, month);
    const current = buckets.get(key) ?? {
      key,
      label: monthLabel(year, month),
      year,
      month,
      revenue: 0,
      cogs: 0,
      opex: 0,
      salaries: 0,
      waste: 0,
      expenses: 0,
      netProfit: 0,
    };

    const qty = tx.quantity || 1;
    const bucket = tx.bucket ?? "revenue";
    if (bucket === "revenue") {
      current.revenue += tx.revenue;
      current.cogs += tx.costPrice * qty;
    } else if (bucket === "cogs") {
      current.cogs += tx.costPrice * qty || tx.expense;
    } else if (bucket === "salaries") {
      current.salaries += tx.expense;
    } else if (bucket === "waste") {
      current.waste += tx.expense;
    } else {
      current.opex += tx.expense;
    }
    buckets.set(key, current);
  }

  const monthlyFixed = monthlyOpexFromSettings(settings);
  const points = Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));

  for (const point of points) {
    point.opex += monthlyFixed;
    point.expenses = point.cogs + point.opex + point.salaries + point.waste;
    point.netProfit = point.revenue - point.expenses;
  }

  return points;
}

function latestTwo(points: MonthlyPoint[]) {
  if (points.length === 0) return { current: null as MonthlyPoint | null, previous: null as MonthlyPoint | null };
  if (points.length === 1) return { current: points[0], previous: null };
  return { current: points[points.length - 1], previous: points[points.length - 2] };
}

function changePct(current: number, previous: number | undefined) {
  if (previous == null || previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function computeHealthScore(input: {
  profitMargin: number;
  revenueChangePct: number;
  expenseChangePct: number;
  predictedProfit: number;
  currentProfit: number;
}) {
  const marginScore = clamp((input.profitMargin / 35) * 40, 0, 40);
  const trendScore =
    input.revenueChangePct >= 8 ? 25 : input.revenueChangePct >= 0 ? 18 : clamp(12 + input.revenueChangePct, 0, 12);
  const expenseControl =
    input.expenseChangePct <= input.revenueChangePct ? 20 : clamp(20 - (input.expenseChangePct - input.revenueChangePct), 0, 20);
  const forecastScore = input.predictedProfit > 0 ? 15 : input.currentProfit > 0 ? 6 : 0;
  const score = Math.round(clamp(marginScore + trendScore + expenseControl + forecastScore, 0, 100));

  const healthLabel =
    score >= 85 ? "ممتاز" : score >= 70 ? "جيد جداً" : score >= 50 ? "متوسط" : score >= 30 ? "ضعيف" : "حرج";

  return { healthScore: score, healthLabel };
}

export function computeKpis(
  monthly: MonthlyPoint[],
  predictedProfit: number,
): FinancialKPIs {
  const { current, previous } = latestTwo(monthly);
  const totalRevenue = monthly.reduce((sum, point) => sum + point.revenue, 0);
  const totalCogs = monthly.reduce((sum, point) => sum + point.cogs, 0);
  const totalOpex = monthly.reduce((sum, point) => sum + point.opex, 0);
  const totalSalaries = monthly.reduce((sum, point) => sum + point.salaries, 0);
  const totalWaste = monthly.reduce((sum, point) => sum + point.waste, 0);
  const totalExpenses = monthly.reduce((sum, point) => sum + point.expenses, 0);
  const netProfit = monthly.reduce((sum, point) => sum + point.netProfit, 0);
  const profitMargin = safeDivide(netProfit, totalRevenue) * 100;
  const revenueChangePct = changePct(totalRevenue, previous?.revenue);
  const expenseChangePct = changePct(totalExpenses, previous?.expenses);
  const profitChangePct = changePct(netProfit, previous?.netProfit);
  const { healthScore, healthLabel } = computeHealthScore({
    profitMargin,
    revenueChangePct,
    expenseChangePct,
    predictedProfit,
    currentProfit: netProfit,
  });

  return {
    totalRevenue: round2(totalRevenue),
    totalCogs: round2(totalCogs),
    totalOpex: round2(totalOpex),
    totalSalaries: round2(totalSalaries),
    totalWaste: round2(totalWaste),
    totalExpenses: round2(totalExpenses),
    netProfit: round2(netProfit),
    profitMargin: round2(profitMargin),
    healthScore,
    healthLabel,
    revenueChangePct: round2(revenueChangePct),
    expenseChangePct: round2(expenseChangePct),
    profitChangePct: round2(profitChangePct),
  };
}

export function expenseBreakdown(
  monthly: MonthlyPoint[],
  settings: AppSettings,
): ExpenseSlice[] {
  if (!monthly.length) return [];
  const months = monthly.length;
  const fixed = monthlyOpexFromSettings(settings);
  const cogs = monthly.reduce((sum, point) => sum + point.cogs, 0);
  const salaries = monthly.reduce((sum, point) => sum + point.salaries, 0);
  const waste = monthly.reduce((sum, point) => sum + point.waste, 0);
  const fileOpex = monthly.reduce((sum, point) => sum + Math.max(0, point.opex - fixed), 0);
  const slices: ExpenseSlice[] = [
    { name: "تكلفة المبيعات / خامات", value: cogs, color: SLICE_COLORS[0] },
    { name: "الإيجار", value: settings.opexIncludedInFile ? 0 : settings.rent * months, color: SLICE_COLORS[1] },
    { name: "الرواتب", value: (settings.opexIncludedInFile ? 0 : settings.salaries * months) + salaries, color: SLICE_COLORS[2] },
    { name: "فواتير وخدمات", value: settings.opexIncludedInFile ? 0 : (settings.utilities || 0) * months, color: SLICE_COLORS[4] },
    { name: "تسويق وتشغيل", value: (settings.opexIncludedInFile ? 0 : settings.otherOpex * months) + fileOpex, color: SLICE_COLORS[3] },
    { name: "تالف وهالك", value: waste, color: SLICE_COLORS[5] },
  ].filter((s) => s.value > 0);

  if (!slices.length) {
    const leftover = monthly.reduce((sum, point) => sum + point.expenses, 0);
    if (leftover > 0) {
      slices.push({ name: "مصروفات غير مصنّفة", value: leftover, color: SLICE_COLORS[0] });
    }
  }

  return slices.map((slice, index) => ({ ...slice, color: SLICE_COLORS[index % SLICE_COLORS.length] }));
}

function productStatus(recent: number, older: number): ProductStat["status"] {
  if (older === 0) return recent > 0 ? "rising" : "stable";
  const change = (recent - older) / Math.abs(older);
  if (change >= 0.08) return "rising";
  if (change <= -0.08) return "declining";
  return "stable";
}

export function computeProductStats(transactions: Transaction[]): ProductStat[] {
  const map = new Map<
    string,
    { revenue: number; quantity: number; lastSale: Date | null; recent: number; older: number }
  >();

  const dated = transactions.filter((t) => t.date).sort((a, b) => a.date!.getTime() - b.date!.getTime());
  const maxTime = dated.length ? dated[dated.length - 1].date!.getTime() : Date.now();
  const split = maxTime - 30 * 86400000;

  for (const tx of transactions) {
    if (isExcludedFromProductRankings(tx) || !tx.product || isUnspecifiedProduct(tx.product)) continue;
    const current = map.get(tx.product) ?? {
      revenue: 0,
      quantity: 0,
      lastSale: null as Date | null,
      recent: 0,
      older: 0,
    };
    current.revenue += tx.revenue;
    current.quantity += tx.quantity || 0;
    if (tx.date && (!current.lastSale || tx.date > current.lastSale)) current.lastSale = tx.date;
    if (tx.date && tx.date.getTime() >= split) current.recent += tx.revenue;
    else current.older += tx.revenue;
    map.set(tx.product, current);
  }

  return Array.from(map.entries())
    .map(([name, value]) => ({
      name,
      revenue: round2(value.revenue),
      quantity: value.quantity,
      lastSale: value.lastSale ? value.lastSale.toISOString() : null,
      status: productStatus(value.recent, value.older),
      changePct: round2(changePct(value.recent, value.older)),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);
}

export function computeStagnantInventory(transactions: Transaction[]): StagnantItem[] {
  const map = new Map<string, { lastSale: Date | null; revenue: number }>();
  let maxDate: Date | null = null;

  for (const tx of transactions) {
    if (isExcludedFromProductRankings(tx) || !tx.product || isUnspecifiedProduct(tx.product)) continue;
    const current = map.get(tx.product) ?? { lastSale: null as Date | null, revenue: 0 };
    current.revenue += tx.revenue;
    if (tx.date && (!current.lastSale || tx.date > current.lastSale)) current.lastSale = tx.date;
    if (tx.date && (!maxDate || tx.date > maxDate)) maxDate = tx.date;
    map.set(tx.product, current);
  }

  const reference = maxDate ?? new Date();
  return Array.from(map.entries())
    .map(([name, value]) => {
      const last = value.lastSale ? startOfDay(value.lastSale) : startOfDay(new Date(0));
      const daysStagnant = Math.max(
        0,
        Math.round((startOfDay(reference).getTime() - last.getTime()) / 86400000),
      );
      return {
        name,
        daysStagnant,
        lastRevenue: round2(value.revenue),
        suggestedAction:
          daysStagnant >= 90 ? ("liquidate" as const) : daysStagnant >= 60 ? ("discount20" as const) : ("review" as const),
      };
    })
    .filter((item) => item.daysStagnant >= 45)
    .sort((a, b) => b.daysStagnant - a.daysStagnant)
    .slice(0, 6);
}

export function computeProductHighlights(transactions: Transaction[]): ProductHighlights {
  const map = new Map<
    string,
    { saleCount: number; quantity: number; revenue: number; cogs: number }
  >();

  for (const tx of transactions) {
    if (isExcludedFromProductRankings(tx) || !tx.product || isUnspecifiedProduct(tx.product)) continue;
    const current = map.get(tx.product) ?? { saleCount: 0, quantity: 0, revenue: 0, cogs: 0 };
    current.saleCount += 1;
    current.quantity += tx.quantity || 0;
    current.revenue += tx.revenue;
    current.cogs += tx.costPrice * (tx.quantity || 1);
    map.set(tx.product, current);
  }

  const catalog: ProductPerformance[] = Array.from(map.entries())
    .map(([name, value]) => {
      const profit = round2(value.revenue - value.cogs);
      return {
        name,
        saleCount: value.saleCount,
        quantity: value.quantity,
        revenue: round2(value.revenue),
        cogs: round2(value.cogs),
        profit,
        margin: round2(safeDivide(profit, value.revenue) * 100),
        isLoss: profit < 0,
      };
    })
    .sort((a, b) => b.quantity - a.quantity || b.saleCount - a.saleCount);

  const highestSales = catalog[0] ?? null;
  const lowestSales =
    catalog.length > 0
      ? [...catalog].sort((a, b) => a.saleCount - b.saleCount || a.quantity - b.quantity)[0]
      : null;
  const mostProfitable =
    catalog.length > 0 ? [...catalog].sort((a, b) => b.profit - a.profit)[0] : null;
  const minSales = lowestSales?.saleCount ?? 1;
  const lossMakers = catalog
    .filter((item) => item.isLoss || (item.saleCount <= Math.max(1, minSales) && item.profit <= 0))
    .sort((a, b) => a.profit - b.profit);

  return { catalog, highestSales, lowestSales, mostProfitable, lossMakers };
}

export function runFullAnalysis(parsed: ParseResult, settings: AppSettings, taxonomy?: TaxonomyMap): AnalysisResult {
  const safeParsed = sanitizeParseResult(parsed);
  const transactions = classifyAll(safeParsed.transactions, taxonomy);
  const monthlySeries = buildMonthlySeries(transactions, settings);
  const forecast = predictFuturePerformance(monthlySeries);
  const kpis = computeKpis(monthlySeries, forecast.nextMonthProfit);
  const totals = bucketTotals(transactions);
  const sheetMetrics = buildSheetMetrics(transactions, safeParsed.sheets);

  const productHighlights = computeProductHighlights(transactions);
  const stagnantInventory = computeStagnantInventory(transactions);
  const extraInsight = buildShippingInsight(transactions);
  if (extraInsight) {
    forecast.alerts = [extraInsight, ...forecast.alerts.filter((a) => a.id !== extraInsight.id)];
  }

  const advisor = buildAdvisorReport({
    transactions,
    kpis,
    monthly: monthlySeries,
    forecast,
    highlights: productHighlights,
    stagnant: stagnantInventory,
    settings,
    reviewNeeded: safeParsed.cleaning?.reviewNeeded ?? 0,
  });

  const classifiedCount = transactions.filter((tx) => tx.bucket && tx.bucket !== "revenue").length;
  const extraWarnings: string[] = [];
  if (classifiedCount > 0) {
    extraWarnings.push(
      `Classified ${classifiedCount} non-sales rows so they are not counted as revenue. / صُنّفت ${classifiedCount} بنود غير بيعية حتى لا تدخل ضمن المبيعات.`,
    );
  }
  const hasExpenseRows = transactions.some((tx) => tx.bucket && tx.bucket !== "revenue");
  const hasCostColumn = Boolean(safeParsed.mapping.mapping.costPrice);
  if (hasExpenseRows && !hasCostColumn) {
    extraWarnings.push(
      "Cost columns are missing, but expense rows were found. Net profit is revenue minus those rows. / لا يوجد عمود تكلفة، لكن وُجدت بنود مصروف. صافي الربح = المبيعات − هذه البنود.",
    );
  }
  const pendingClassifications = buildClassificationPrompts(transactions);
  if (pendingClassifications.length) {
    extraWarnings.push(
      `${pendingClassifications.length} ambiguous items need your classification. They are held out until you answer. / ${pendingClassifications.length} بنود غامضة بانتظار تصنيفك ولن تدخل المبيعات أو المصروف حتى تجيبي.`,
    );
  }

  return {
    kpis,
    monthlySeries,
    bucketTotals: {
      ...totals,
      expenses: kpis.totalExpenses,
      netProfit: kpis.netProfit,
    },
    sheetMetrics,
    expenseBreakdown: expenseBreakdown(monthlySeries, settings),
    topProducts: computeProductStats(transactions),
    stagnantInventory,
    productHighlights,
    forecast,
    advisor,
    mapping: safeParsed.mapping,
    warnings: [...extraWarnings, ...safeParsed.warnings, ...safeParsed.mapping.warnings.filter((w, i, arr) => arr.indexOf(w) === i)].filter(
      (warning, index, arr) => {
        if (arr.indexOf(warning) !== index) return false;
        const hasDates = transactions.some((tx) => tx.date);
        if (hasDates && warning.includes("عمود تاريخ")) return false;
        return true;
      },
    ),
    fileName: safeParsed.fileName,
    rowCount: safeParsed.rowCount,
    analyzedAt: new Date().toISOString(),
    pendingClassifications,
  };
}

function buildSheetMetrics(transactions: Transaction[], scans?: ParseResult["sheets"]) {
  const bySheet = new Map<string, { revenue: number; expenses: number }>();
  for (const tx of transactions) {
    if (tx.needsReview) continue;
    const name = tx.sourceSheet || "ملف واحد";
    const current = bySheet.get(name) ?? { revenue: 0, expenses: 0 };
    if ((tx.bucket ?? "revenue") === "revenue") {
      current.revenue += tx.revenue;
      current.expenses += tx.costPrice * (tx.quantity || 1);
    } else if (tx.bucket === "cogs") {
      current.expenses += tx.costPrice * (tx.quantity || 1) || tx.expense;
    } else {
      current.expenses += tx.expense;
    }
    bySheet.set(name, current);
  }

  if (scans?.length) {
    return scans.map((scan) => {
      const totals = bySheet.get(scan.name);
      if (!totals) return scan;
      return {
        ...scan,
        revenue: round2(totals.revenue),
        expenses: round2(totals.expenses),
        netProfit: round2(totals.revenue - totals.expenses),
      };
    });
  }

  return Array.from(bySheet.entries()).map(([name, totals]) => ({
    name,
    role: "detail" as const,
    rows: transactions.filter((tx) => (tx.sourceSheet || "ملف واحد") === name).length,
    validRows: transactions.filter((tx) => (tx.sourceSheet || "ملف واحد") === name).length,
    revenue: round2(totals.revenue),
    expenses: round2(totals.expenses),
    netProfit: round2(totals.revenue - totals.expenses),
  }));
}

function buildShippingInsight(transactions: Transaction[]) {
  const shipping = transactions.filter((t) =>
    /شحن|shipping|توصيل|delivery/i.test(`${t.category} ${t.expenseType} ${t.product}`),
  );
  if (shipping.length === 0) return null;

  const byMonth = new Map<string, number>();
  for (const tx of shipping) {
    if (!tx.date) continue;
    const key = monthKey(tx.date.getFullYear(), tx.date.getMonth());
    byMonth.set(key, (byMonth.get(key) ?? 0) + (tx.expense || tx.revenue));
  }
  const keys = Array.from(byMonth.keys()).sort();
  if (keys.length < 2) return null;
  const prev = byMonth.get(keys[keys.length - 2]) ?? 0;
  const curr = byMonth.get(keys[keys.length - 1]) ?? 0;
  if (prev === 0) return null;
  const change = ((curr - prev) / prev) * 100;
  if (change < 10) return null;

  return {
    id: "shipping-spike",
    severity: "medium" as const,
    title: "محلل النظام الاصطناعي",
    message: `لاحظنا ارتفاع تكاليف الشحن بنسبة ${change.toFixed(0)}% مقارنة بالفترة السابقة. نوصي بمراجعة عقود المورّدين للحفاظ على هامش الربح.`,
    recommendation: "قارن أسعار 3 مزودي شحن وأعد التفاوض على الشرائح الحجمية.",
  };
}
