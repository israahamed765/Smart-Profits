import { round2, safeDivide } from "@/shared/constants/math";
import type {
  AdvisorReport,
  AppSettings,
  FindingTone,
  FinancialKPIs,
  ForecastResult,
  HealthFinding,
  InventoryAdvice,
  MonthlyPoint,
  PriceAdvice,
  ProductHighlights,
  ProductPerformance,
  ProfitLeak,
  RiskAxis,
  StagnantItem,
  StoreHealth,
  TodayAction,
  Transaction,
  WhatIfResult,
} from "../types";

function spanDays(transactions: Transaction[]) {
  const dates = transactions.map((tx) => tx.date).filter((d): d is Date => d instanceof Date);
  if (dates.length < 2) return 30;
  const min = dates.reduce((a, b) => (a < b ? a : b));
  const max = dates.reduce((a, b) => (a > b ? a : b));
  return Math.max(1, Math.round((max.getTime() - min.getTime()) / 86400000) + 1);
}

function toneFromScore(score: number): FindingTone {
  if (score >= 75) return "good";
  if (score >= 50) return "warn";
  return "bad";
}

function unitPrice(item: ProductPerformance) {
  return item.quantity > 0 ? item.revenue / item.quantity : item.revenue;
}

function unitCost(item: ProductPerformance) {
  return item.quantity > 0 ? item.cogs / item.quantity : item.cogs;
}

export function simulateWhatIf(item: ProductPerformance, newPrice: number, days: number): WhatIfResult {
  const currentPrice = round2(unitPrice(item));
  const cost = unitCost(item);
  const currentUnitProfit = round2(currentPrice - cost);
  const newUnitProfit = round2(newPrice - cost);
  const monthlyQty = round2(item.quantity * (30 / Math.max(1, days)));
  const currentMonthlyProfit = round2(currentUnitProfit * monthlyQty);
  const newMonthlyProfit = round2(newUnitProfit * monthlyQty);
  const delta = round2(newMonthlyProfit - currentMonthlyProfit);
  const margin = safeDivide(newUnitProfit, newPrice) * 100;
  let verdictKey: WhatIfResult["verdictKey"] = "sim.v.ok";
  let verdict = "التعديل يحسّن الربح دون أن يحوّل المنتج إلى خسارة.";
  if (newPrice <= cost) {
    verdictKey = "sim.v.belowCost";
    verdict = "السعر الجديد أقل من التكلفة. هذا الخصم سيأكل هامش الربح.";
  } else if (margin < 15) {
    verdictKey = "sim.v.thin";
    verdict = "الهامش أصبح ضعيفاً. الخصم أو السعر الجديد قد لا يستحق الحجم الإضافي.";
  } else if (delta < 0) {
    verdictKey = "sim.v.down";
    verdict = "الربح الشهري المتوقع ينخفض. لا تنفّذ هذا التعديل إلا إذا زاد الطلب بقوة.";
  } else if (newPrice > currentPrice * 1.12) {
    verdictKey = "sim.v.raise";
    verdict = "الرفع كبير. راقب الطلب؛ لا ترفع أكثر إذا بدأ الحجم بالانخفاض.";
  }

  return {
    product: item.name,
    currentPrice,
    newPrice: round2(newPrice),
    currentUnitProfit,
    newUnitProfit,
    monthlyQty: round2(monthlyQty),
    currentMonthlyProfit,
    newMonthlyProfit,
    delta,
    verdict,
    verdictKey,
  };
}

function buildHealth(
  kpis: FinancialKPIs,
  catalog: ProductPerformance[],
  monthly: MonthlyPoint[],
  forecast: ForecastResult,
): StoreHealth {
  const findings: HealthFinding[] = [];
  const totalProfit = catalog.reduce((sum, item) => sum + Math.max(0, item.profit), 0);
  const top2 = [...catalog].sort((a, b) => b.profit - a.profit).slice(0, 2);
  const concentration = safeDivide(
    top2.reduce((sum, item) => sum + Math.max(0, item.profit), 0),
    totalProfit,
  ) * 100;
  const profitable = catalog.filter((item) => item.profit > 0).length;
  const lossCount = catalog.filter((item) => item.isLoss).length;

  if (kpis.revenueChangePct >= 0) {
    findings.push({
      id: "sales-ok",
      tone: "good",
      title: "المبيعات جيدة",
      detail: `المبيعات ${kpis.revenueChangePct >= 0 ? "مستقرة أو صاعدة" : "متراجعة"} بنسبة ${kpis.revenueChangePct.toFixed(0)}% عن الفترة السابقة.`,
    });
  } else {
    findings.push({
      id: "sales-down",
      tone: "bad",
      title: "المبيعات تتراجع",
      detail: `انخفضت المبيعات بنسبة ${Math.abs(kpis.revenueChangePct).toFixed(0)}% مقارنة بالفترة السابقة.`,
    });
  }

  if (profitable >= Math.max(2, catalog.length * 0.5)) {
    findings.push({
      id: "profit-mix",
      tone: "good",
      title: "عدد المنتجات المربحة جيد",
      detail: `${profitable} منتج يحقق ربحاً من أصل ${catalog.length}.`,
    });
  } else if (catalog.length) {
    findings.push({
      id: "profit-mix-weak",
      tone: "warn",
      title: "قلة المنتجات المربحة",
      detail: `فقط ${profitable} منتج مربح من ${catalog.length}.`,
    });
  }

  if (kpis.expenseChangePct > kpis.revenueChangePct + 5) {
    findings.push({
      id: "cogs-up",
      tone: "bad",
      title: "تكلفة البضاعة ترتفع بسرعة",
      detail: `المصاريف نمت ${kpis.expenseChangePct.toFixed(0)}% بينما المبيعات ${kpis.revenueChangePct.toFixed(0)}%.`,
    });
  }

  if (concentration >= 35 && top2.length >= 2) {
    findings.push({
      id: "concentration",
      tone: "warn",
      title: `${concentration.toFixed(0)}% من أرباحك تعتمد على منتجين فقط`,
      detail: `${top2.map((item) => item.name).join(" و ")} يحملان معظم الربح. أي تراجع فيهما يضرب المتجر.`,
    });
  }

  if (lossCount > 0) {
    findings.push({
      id: "loss-skus",
      tone: "bad",
      title: "منتجات خطرة",
      detail: `${lossCount} منتج يبيع دون ربح كافٍ أو بخسارة.`,
    });
  }

  const dailyProfit = kpis.netProfit / 30;
  let daysUntilProblem: number | null = null;
  if (forecast.willLoseNextMonth) {
    daysUntilProblem = Math.max(7, Math.min(30, Math.round(30 * safeDivide(Math.max(0, kpis.netProfit), Math.abs(forecast.nextMonthProfit) + Math.max(0, kpis.netProfit)))));
  } else if (kpis.profitChangePct < -8 && dailyProfit > 0) {
    const dropPerDay = Math.abs(kpis.netProfit * (kpis.profitChangePct / 100)) / 30;
    daysUntilProblem = dropPerDay > 0 ? Math.round(kpis.netProfit / dropPerDay) : null;
    if (daysUntilProblem != null) daysUntilProblem = Math.max(8, Math.min(90, daysUntilProblem));
  } else if (kpis.netProfit < 0) {
    daysUntilProblem = 0;
  }

  findings.sort((a, b) => {
    const rank = { bad: 0, warn: 1, good: 2 };
    return rank[a.tone] - rank[b.tone];
  });

  const headline =
    daysUntilProblem === 0
      ? "المتجر في خسارة الآن. القرار اليوم أهم من الرسم البياني."
      : daysUntilProblem != null
        ? `لو استمريت بنفس طريقة البيع، عندك مشكلة بعد ${daysUntilProblem} يوماً.`
        : "الوضع مستقر حالياً، لكن راقب التكلفة وتركيز الربح على منتجين.";

  const score = kpis.healthScore;
  return {
    score,
    label: kpis.healthLabel,
    tone: toneFromScore(score),
    headline,
    daysUntilProblem,
    findings: findings.slice(0, 3),
  };
}

function buildLeaks(catalog: ProductPerformance[], days: number): ProfitLeak[] {
  const leaks: ProfitLeak[] = [];
  const monthlyFactor = 30 / Math.max(1, days);

  for (const item of catalog) {
    const price = unitPrice(item);
    const cost = unitCost(item);
    const margin = item.margin;
    if (item.revenue >= 1 && margin < 18 && item.profit >= 0) {
      const bump = 3;
      const extra = round2(bump * item.quantity * monthlyFactor);
      leaks.push({
        id: `thin-${item.name}`,
        product: item.name,
        revenue: item.revenue,
        profit: item.profit,
        issue: `مبيعات عالية لكن هامش الربح ضئيل (${margin.toFixed(0)}%) بسبب ارتفاع التكلفة أو مصاريف الشحن/الإعلانات.`,
        suggestion: `إذا رفعت السعر ${bump.toFixed(0)} فقط، الربح المتوقع يزيد حوالي ${Math.round(extra)} شهرياً.`,
        extraProfitIfFixed: extra,
      });
    } else if (item.isLoss) {
      leaks.push({
        id: `loss-${item.name}`,
        product: item.name,
        revenue: item.revenue,
        profit: item.profit,
        issue: "يبيع تحت التكلفة أو بهامش سالب.",
        suggestion: `راجع سعر البيع مقابل تكلفة ${round2(cost)}. لا تطلب كمية جديدة قبل تصحيح السعر.`,
        extraProfitIfFixed: round2(Math.abs(item.profit) * monthlyFactor),
      });
    } else if (price > 0 && cost / price > 0.75) {
      leaks.push({
        id: `cost-${item.name}`,
        product: item.name,
        revenue: item.revenue,
        profit: item.profit,
        issue: "التكلفة مرتفعة جداً نسبة إلى سعر البيع.",
        suggestion: "فاوض المورد أو ارفع السعر قبل أن يتحول المنتج إلى تسريب دائم.",
        extraProfitIfFixed: round2(item.quantity * price * 0.05 * monthlyFactor),
      });
    }
  }

  return leaks.sort((a, b) => b.revenue - a.revenue).slice(0, 6);
}

function buildInventory(
  catalog: ProductPerformance[],
  stagnant: StagnantItem[],
  days: number,
): InventoryAdvice[] {
  const stagnantNames = new Set(stagnant.map((item) => item.name));
  return catalog.slice(0, 12).map((item) => {
    const dailyVelocity = round2(item.quantity / Math.max(1, days));
    const estimatedStock = Math.max(1, Math.round((item.quantity / Math.max(1, item.saleCount)) * 2));
    const daysUntilStockout = dailyVelocity > 0 ? Math.round(estimatedStock / dailyVelocity) : null;
    const unitProfit = round2(safeDivide(item.profit, item.quantity || 1));
    const slow = stagnantNames.has(item.name) || dailyVelocity < 0.05;
    let decision: InventoryAdvice["decision"] = "watch";
    let reason = "الحركة متوسطة. راقب المبيعات قبل طلب كمية كبيرة.";
    if (slow || unitProfit <= 0) {
      decision = "dont_buy";
      reason = slow
        ? `مبيعات منخفضة. المخزون التقديري يكفي ${daysUntilStockout ?? "فترة طويلة"}. لا تشترِ الآن.`
        : "الربح للقطعة ضعيف أو سالب. أوقف الشراء حتى تصحيح السعر.";
    } else if (daysUntilStockout != null && daysUntilStockout <= 10 && unitProfit > 0 && dailyVelocity >= 0.15) {
      decision = "order_now";
      reason = `يباع بمعدل ${dailyVelocity.toFixed(1)} قطعة يومياً وقد ينفد خلال ${daysUntilStockout} أيام.`;
    }
    return {
      product: item.name,
      estimatedStock,
      dailyVelocity,
      daysUntilStockout,
      unitProfit,
      decision,
      reason,
    };
  });
}

function buildPricing(catalog: ProductPerformance[]): PriceAdvice[] {
  return [...catalog]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8)
    .map((item) => {
      const currentPrice = round2(unitPrice(item));
      const cost = round2(unitCost(item));
      const margin = item.margin;
      const target = Math.max(cost * 1.35, currentPrice * 1.05);
      const suggestedMin = round2(Math.max(cost * 1.25, currentPrice));
      const suggestedMax = round2(target * 1.08);
      const caution =
          margin >= 40
            ? "الهامش مريح. لا ترفع السعر إذا كان الطلب بدأ ينخفض."
            : "لا ترفع السعر دفعة واحدة إذا كان معدل الطلب ينخفض.";
      return { product: item.name, currentPrice, cost, margin, suggestedMin, suggestedMax, caution };
    });
}

function buildActions(
  inventory: InventoryAdvice[],
  leaks: ProfitLeak[],
  stagnant: StagnantItem[],
  catalog: ProductPerformance[],
): TodayAction[] {
  const actions: TodayAction[] = [];
  const stopBuy = inventory.find((item) => item.decision === "dont_buy");
  const order = inventory.find((item) => item.decision === "order_now");
  const leak = leaks[0];
  const winner = [...catalog].sort((a, b) => b.profit - a.profit)[0];

  if (stopBuy) {
    actions.push({
      id: "stop-buy",
      priority: "high",
      title: `أوقف شراء «${stopBuy.product}» مؤقتاً`,
      reason: stopBuy.reason,
      href: "/dashboard",
    });
  } else if (stagnant[0]) {
    actions.push({
      id: "stagnant",
      priority: "high",
      title: `راجع «${stagnant[0].name}» الراكد`,
      reason: `لم يتحرك منذ ${stagnant[0].daysStagnant} يوماً. لا تطلب كمية جديدة.`,
      href: "/dashboard",
    });
  }

  if (leak) {
    actions.push({
      id: "price-leak",
      priority: "medium",
      title: `راجع سعر «${leak.product}»`,
      reason: leak.issue,
      href: "/simulator",
    });
  }

  if (order) {
    actions.push({
      id: "restock",
      priority: "low",
      title: `زِد مخزون «${order.product}»`,
      reason: order.reason,
      href: "/dashboard",
    });
  } else if (winner) {
    actions.push({
      id: "push-winner",
      priority: "low",
      title: `ادفع مبيعات «${winner.name}»`,
      reason: `أعلى ربح حالياً (${Math.round(winner.profit)}). وفّر الكمية ولا تقطع عرضه.`,
      href: "/simulator",
    });
  }

  return actions.slice(0, 3);
}

function buildRisks(
  kpis: FinancialKPIs,
  forecast: ForecastResult,
  catalog: ProductPerformance[],
  cleaningReview: number,
): RiskAxis[] {
  const profitLevel = forecast.willLoseNextMonth || kpis.netProfit < 0 ? "high" : kpis.profitMargin < 18 ? "medium" : "good";
  const expenseLevel = kpis.expenseChangePct > kpis.revenueChangePct + 8 ? "high" : kpis.expenseChangePct > 5 ? "medium" : "low";
  const salesLevel = kpis.revenueChangePct <= -8 ? "high" : kpis.revenueChangePct < 0 ? "medium" : "good";
  const productLevel = catalog.filter((item) => item.isLoss).length >= 2 ? "high" : catalog.filter((item) => item.margin < 15).length ? "medium" : "low";
  const inventoryLevel = catalog.some((item) => item.saleCount <= 1) ? "medium" : "low";
  const dataLevel = cleaningReview >= 5 ? "medium" : "good";

  return [
    { id: "profit", label: "خطر الربح", level: profitLevel, reason: forecast.willLoseNextMonth ? "التوقع يشير إلى ضغط أو خسارة قريبة." : "هامش الربح ضمن النطاق الحالي." },
    { id: "inventory", label: "خطر المخزون", level: inventoryLevel, reason: "التقدير مبني على سرعة البيع، وليس جرداً فعلياً." },
    { id: "expense", label: "خطر المصاريف", level: expenseLevel, reason: `تغير المصاريف ${kpis.expenseChangePct.toFixed(0)}% مقابل المبيعات ${kpis.revenueChangePct.toFixed(0)}%.` },
    { id: "sales", label: "خطر المبيعات", level: salesLevel, reason: `تغير المبيعات ${kpis.revenueChangePct.toFixed(0)}%.` },
    { id: "product", label: "خطر المنتجات", level: productLevel, reason: `${catalog.filter((item) => item.isLoss).length} منتج خاسر أو ضعيف الهامش.` },
    { id: "data", label: "جودة البيانات", level: dataLevel, reason: cleaningReview > 0 ? `${cleaningReview} سجلات تحتاج مراجعة.` : "الملف مفهوم والأعمدة مربوطة." },
  ];
}

function buildPlan(actions: TodayAction[], leaks: ProfitLeak[], inventory: InventoryAdvice[]): AdvisorReport["plan"] {
  const priceTasks = leaks.slice(0, 3).map((leak) => `تعديل سعر «${leak.product}»`);
  const stopTasks = inventory.filter((item) => item.decision === "dont_buy").slice(0, 2).map((item) => `إيقاف شراء «${item.product}»`);
  const restock = inventory.filter((item) => item.decision === "order_now").slice(0, 2).map((item) => `زيادة مخزون «${item.product}»`);
  return [
    {
      week: 1,
      title: "تصحيح السعر والشراء",
      tasks: [...(priceTasks.length ? priceTasks : ["راجع أسعار المنتجات ضعيفة الهامش"]), ...(stopTasks.length ? stopTasks : ["لا تطلب الأصناف البطيئة"])],
    },
    {
      week: 2,
      title: "تعزيز الرابحة",
      tasks: restock.length ? restock : ["زوّد المنتجات الأسرع ربحاً بحذر"],
    },
    {
      week: 3,
      title: "ضغط المصروف",
      tasks: ["راجع أي مصروف تشغيل لا يرتبط بالمبيعات", actions[0] ? actions[0].title : "نفّذ أول قرار من قائمة اليوم"],
    },
    {
      week: 4,
      title: "قياس النتيجة",
      tasks: ["ارفع ملف الشهر بعد التنفيذ", "قارن الربح قبل وبعد داخل لوحة القيادة"],
    },
  ];
}

export function buildAdvisorReport(input: {
  transactions: Transaction[];
  kpis: FinancialKPIs;
  monthly: MonthlyPoint[];
  forecast: ForecastResult;
  highlights: ProductHighlights;
  stagnant: StagnantItem[];
  settings: AppSettings;
  reviewNeeded: number;
}): AdvisorReport {
  const days = spanDays(input.transactions);
  const catalog = input.highlights.catalog;
  const health = buildHealth(input.kpis, catalog, input.monthly, input.forecast);
  const leaks = buildLeaks(catalog, days);
  const inventory = buildInventory(catalog, input.stagnant, days);
  const pricing = buildPricing(catalog);
  const todayActions = buildActions(inventory, leaks, input.stagnant, catalog);
  const expectedRevenue = input.forecast.nextMonthRevenue;
  const expectedProfit = input.forecast.nextMonthProfit;
  const opexShare = expectedRevenue - expectedProfit;
  const scenarios = {
    worst: { revenue: round2(expectedRevenue * 0.85), profit: round2(expectedRevenue * 0.85 - opexShare) },
    expected: { revenue: round2(expectedRevenue), profit: round2(expectedProfit) },
    best: { revenue: round2(expectedRevenue * 1.15), profit: round2(expectedRevenue * 1.15 - opexShare) },
  };
  const risks = buildRisks(input.kpis, input.forecast, catalog, input.reviewNeeded);
  const plan = buildPlan(todayActions, leaks, inventory);
  return { health, todayActions, leaks, inventory, pricing, scenarios, risks, plan };
}

export function dataSpanDays(transactions: Transaction[]) {
  return spanDays(transactions);
}
