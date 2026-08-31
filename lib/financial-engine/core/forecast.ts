import { monthKey, monthLabel } from "@/shared/constants/calendar";
import type {
  AiRecommendation,
  AlertSeverity,
  ForecastPoint,
  ForecastResult,
  MonthlyPoint,
  RiskAlert,
} from "../types";

export function linearRegression(values: number[]) {
  const n = values.length;
  if (n === 0) return { m: 0, c: 0 };
  if (n === 1) return { m: 0, c: values[0] };

  const xs = values.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * values[i], 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { m: 0, c: sumY / n };

  const m = (n * sumXY - sumX * sumY) / denom;
  const c = (sumY - m * sumX) / n;
  return { m, c };
}

export function exponentialSmoothing(values: number[], alpha = 0.45) {
  if (values.length === 0) return 0;
  return values.reduce((prev, current, index) =>
    index === 0 ? current : alpha * current + (1 - alpha) * prev,
  );
}

function addMonths(year: number, month: number, offset: number) {
  const date = new Date(year, month + offset, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function growthRate(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function predictFuturePerformance(
  monthly: MonthlyPoint[],
  horizon = 6,
): ForecastResult {
  const history = monthly.slice(-6);
  const revenueValues = history.map((p) => p.revenue);
  const expenseValues = history.map((p) => p.expenses);
  const revReg = linearRegression(revenueValues);
  const expReg = linearRegression(expenseValues);

  const last = history[history.length - 1];
  const series: ForecastPoint[] = history.map((point) => ({
    key: point.key,
    label: point.label,
    actualRevenue: point.revenue,
    actualExpenses: point.expenses,
    actualProfit: point.netProfit,
    predictedRevenue: point.revenue,
    predictedExpenses: point.expenses,
    predictedProfit: point.netProfit,
    isForecast: false,
  }));

  const startIndex = history.length;
  for (let i = 0; i < horizon; i++) {
    const t = startIndex + i;
    const predictedRevenue = Math.max(0, revReg.m * t + revReg.c);
    const predictedExpenses = Math.max(0, expReg.m * t + expReg.c);
    const predictedProfit = predictedRevenue - predictedExpenses;
    const next = last
      ? addMonths(last.year, last.month, i + 1)
      : addMonths(new Date().getFullYear(), new Date().getMonth(), i + 1);

    series.push({
      key: monthKey(next.year, next.month),
      label: monthLabel(next.year, next.month),
      predictedRevenue,
      predictedExpenses,
      predictedProfit,
      isForecast: true,
    });
  }

  const nextMonth = series.find((p) => p.isForecast)!;
  const nextMonthRevenue = nextMonth.predictedRevenue ?? 0;
  const nextMonthExpenses = nextMonth.predictedExpenses ?? 0;
  const nextMonthProfit = nextMonth.predictedProfit ?? 0;
  const willLoseNextMonth = nextMonthProfit < 0;

  const alerts = buildAlerts(history, nextMonthProfit, revReg.m, expReg.m);
  const recommendations = buildRecommendations(history, nextMonthProfit, revReg.m, expReg.m);

  return {
    nextMonthRevenue,
    nextMonthExpenses,
    nextMonthProfit,
    revenueSlope: revReg.m,
    expenseSlope: expReg.m,
    willLoseNextMonth,
    series,
    alerts,
    recommendations,
  };
}

function buildAlerts(
  history: MonthlyPoint[],
  nextProfit: number,
  revenueSlope: number,
  expenseSlope: number,
): RiskAlert[] {
  const alerts: RiskAlert[] = [];

  if (nextProfit < 0) {
    alerts.push({
      id: "loss-next-month",
      severity: "high",
      title: "تنبيه عالي الأهمية",
      message: `إذا استمر النمط الحالي، سيدخل المتجر في خسارة متوقعة الشهر القادم بقيمة تقارب ${Math.abs(Math.round(nextProfit)).toLocaleString("en-US")} ر.س.`,
      recommendation:
        "راجع عقود الموردين وخفّض المصاريف المتغيرة فوراً، مع إعادة تسعير المنتجات ذات الهامش المنخفض.",
      value: Math.abs(Math.round(nextProfit)),
    });
  }

  if (history.length >= 3) {
    const last3 = history.slice(-3);
    const catDrop = growthRate(last3[2].revenue, last3[1].revenue);
    if (catDrop <= -8) {
      alerts.push({
        id: "sales-drop",
        severity: "high",
        title: "تراجع حاد في المبيعات",
        message: `انخفضت المبيعات بنسبة ${Math.abs(catDrop).toFixed(1)}% مقارنة بالشهر السابق. إن استمر التراجع فقد يظهر عجز في التدفق النقدي خلال 45 يوماً.`,
        recommendation: "قلّل طلبات المخزون للفئات المتراجعة وأطلق عرض تصفية مدروس للمنتجات الراكدة.",
        value: Math.abs(Number(catDrop.toFixed(1))),
      });
    }
  }

  if (history.length >= 3) {
    const a = history[history.length - 3];
    const b = history[history.length - 2];
    const c = history[history.length - 1];
    const expFaster1 = growthRate(b.expenses, a.expenses) > growthRate(b.revenue, a.revenue);
    const expFaster2 = growthRate(c.expenses, b.expenses) > growthRate(c.revenue, b.revenue);
    if (expFaster1 && expFaster2) {
      alerts.push({
        id: "opex-faster",
        severity: "high",
        title: "المصاريف تنمو أسرع من المبيعات",
        message:
          "لشهرين متتاليين، معدل نمو المصاريف أعلى من معدل نمو المبيعات. هذا يضغط هامش الربح وقد يحوّل الربح إلى خسارة.",
        recommendation: "راجع بنود الشحن والتسويق والإيجار، وأوقف أي مصروف لا يرتبط مباشرة بالإيراد.",
      });
    }
  }

  if (expenseSlope > revenueSlope && revenueSlope >= 0) {
    alerts.push({
      id: "margin-squeeze",
      severity: "medium",
      title: "ضغط على هامش الربح",
      message: "اتجاه المصاريف الصاعد أسرع من اتجاه المبيعات حتى مع نمو الإيرادات.",
      recommendation: "ارفع متوسط سعر البيع بنسبة صغيرة على المنتجات عالية الطلب أو تفاوض على تكلفة الشراء.",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "healthy-trend",
      severity: "positive" as AlertSeverity,
      title: "الأداء يسير بشكل إيجابي",
      message:
        "النموذج لا يتوقع خسارة في الشهر القادم. استمر في مراقبة المصاريف واستثمر في المنتجات الأسرع نمواً.",
      recommendation: "حافظ على نفس وتيرة التسعير وزوّد مخزون المنتجات الأعلى مبيعاً بحذر.",
    });
  }

  return alerts;
}

function buildRecommendations(
  history: MonthlyPoint[],
  nextProfit: number,
  revenueSlope: number,
  expenseSlope: number,
): AiRecommendation[] {
  const last = history[history.length - 1];
  const margin = last && last.revenue ? (last.netProfit / last.revenue) * 100 : 0;
  const recs: AiRecommendation[] = [];

  if (margin < 25) {
    recs.push({
      id: "raise-margin",
      title: "زيادة هامش الربح",
      body: "الطلب مرتفع على المنتجات الرائدة. نوصي بزيادة الهامش بنسبة 5% على المنتج الأعلى مبيعاً دون التأثير المتوقع على الحجم.",
      tone: "positive",
      actionLabel: "تطبيق التعديل",
      actionHref: "/dashboard",
    });
  } else {
    recs.push({
      id: "protect-margin",
      title: "حماية هامش الربح الحالي",
      body: `هامش الربح الحالي ${margin.toFixed(1)}%. حافظ عليه عبر تثبيت أسعار المنتجات سريعة الدوران ومراجعة الخصومات غير الضرورية.`,
      tone: "positive",
      actionLabel: "عرض المنتجات",
      actionHref: "/dashboard",
    });
  }

  if (expenseSlope > 0 || nextProfit < 0) {
    recs.push({
      id: "cut-inventory",
      title: "تقليل طلبات المخزون",
      body: "الاتجاه الهابط أو ارتفاع التكلفة يشير إلى احتمال تراكم المخزون. نوصي بخفض طلبات المنتجات الراكدة بنسبة 20%.",
      tone: "warning",
      actionLabel: "مراجعة المخزون",
      actionHref: "/dashboard",
    });
  } else {
    recs.push({
      id: "scale-winners",
      title: "تعزيز المنتجات الرابحة",
      body: "المبيعات في اتجاه صاعد. زد المخزون للمنتجات الأعلى نمواً بنسبة مدروسة وتجنب التوسع في الأصناف البطيئة.",
      tone: "warning",
      actionLabel: "عرض التوقعات",
      actionHref: "/simulator",
    });
  }

  return recs.slice(0, 2);
}

export function monthLabelFromKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  return monthLabel(year, month - 1);
}
