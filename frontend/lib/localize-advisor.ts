import type {
  AdvisorReport,
  FinancialKPIs,
  HealthFinding,
  InventoryAdvice,
  ProductPerformance,
  ProfitLeak,
  RiskAlert,
  RiskAxis,
  TodayAction,
} from "@/lib/types";

type T = (key: string) => string;

export function fill(template: string, vars: Record<string, string | number>) {
  return Object.entries(vars).reduce((acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)), template);
}

function quoted(text: string) {
  return text.match(/«([^»]+)»/)?.[1] ?? text.match(/"([^"]+)"/)?.[1] ?? "";
}

export function healthHeadline(daysUntilProblem: number | null, t: T) {
  if (daysUntilProblem === 0) return t("health.h.loss");
  if (daysUntilProblem != null) return fill(t("health.h.window"), { n: daysUntilProblem });
  return t("health.h.ok");
}

export function localizeFinding(
  finding: HealthFinding,
  kpis: FinancialKPIs,
  catalog: ProductPerformance[],
  t: T,
) {
  const profitable = catalog.filter((item) => item.profit > 0).length;
  const lossCount = catalog.filter((item) => item.isLoss).length;
  const top2 = [...catalog].sort((a, b) => b.profit - a.profit).slice(0, 2);
  const totalProfit = catalog.reduce((sum, item) => sum + Math.max(0, item.profit), 0);
  const concentration = totalProfit > 0
    ? Math.round((top2.reduce((sum, item) => sum + Math.max(0, item.profit), 0) / totalProfit) * 100)
    : 0;

  switch (finding.id) {
    case "sales-ok":
      return {
        title: t("health.f.salesOk"),
        detail: fill(t("health.d.salesOk"), { n: kpis.revenueChangePct.toFixed(0) }),
      };
    case "sales-down":
      return {
        title: t("health.f.salesDown"),
        detail: fill(t("health.d.salesDown"), { n: Math.abs(kpis.revenueChangePct).toFixed(0) }),
      };
    case "profit-mix":
      return {
        title: t("health.f.profitMix"),
        detail: fill(t("health.d.profitMix"), { n: profitable, total: catalog.length }),
      };
    case "profit-mix-weak":
      return {
        title: t("health.f.profitWeak"),
        detail: fill(t("health.d.profitWeak"), { n: profitable, total: catalog.length }),
      };
    case "cogs-up":
      return {
        title: t("health.f.cogs"),
        detail: fill(t("health.d.cogs"), {
          e: kpis.expenseChangePct.toFixed(0),
          s: kpis.revenueChangePct.toFixed(0),
        }),
      };
    case "concentration":
      return {
        title: fill(t("health.f.conc"), { n: concentration }),
        detail: fill(t("health.d.conc"), { names: top2.map((item) => item.name).join(t("ui.and")) }),
      };
    case "loss-skus":
      return {
        title: t("health.f.lossSkus"),
        detail: fill(t("health.d.lossSkus"), { n: lossCount }),
      };
    default:
      return { title: finding.title, detail: finding.detail };
  }
}

export function localizeLeak(leak: ProfitLeak, t: T) {
  if (leak.id.startsWith("thin-")) {
    const margin = leak.revenue ? Math.round((leak.profit / leak.revenue) * 100) : 0;
    return {
      issue: fill(t("leak.thin.issue"), { n: margin }),
      suggestion: fill(t("leak.thin.sug"), { bump: 3, n: Math.round(leak.extraProfitIfFixed) }),
    };
  }
  if (leak.id.startsWith("loss-")) {
    return { issue: t("leak.loss.issue"), suggestion: t("leak.loss.sug") };
  }
  return { issue: t("leak.cost.issue"), suggestion: t("leak.cost.sug") };
}

export function localizeInventoryReason(row: InventoryAdvice, t: T) {
  if (row.decision === "order_now") {
    return fill(t("inv.order"), {
      v: row.dailyVelocity.toFixed(1),
      n: row.daysUntilStockout ?? "—",
    });
  }
  if (row.decision === "dont_buy") {
    if (row.unitProfit <= 0) return t("inv.dont.margin");
    return fill(t("inv.dont.slow"), { n: row.daysUntilStockout ?? t("inv.long") });
  }
  return t("inv.watch");
}

export function localizePricingCaution(margin: number, t: T) {
  return margin >= 40 ? t("price.caution.ok") : t("price.caution.raise");
}

export function localizeAction(action: TodayAction, advisor: AdvisorReport, t: T) {
  const product = quoted(action.title);
  if (action.id === "stop-buy") {
    const item = advisor.inventory.find((row) => row.decision === "dont_buy");
    return {
      title: fill(t("act.stop"), { p: item?.product ?? product }),
      reason: item ? localizeInventoryReason(item, t) : action.reason,
    };
  }
  if (action.id === "stagnant") {
    const days = action.reason.match(/(\d+)/)?.[1] ?? "—";
    return {
      title: fill(t("act.stagnant"), { p: product }),
      reason: fill(t("act.stagnant.r"), { n: days }),
    };
  }
  if (action.id === "price-leak") {
    const leak = advisor.leaks[0];
    return {
      title: fill(t("act.price"), { p: leak?.product ?? product }),
      reason: leak ? localizeLeak(leak, t).issue : action.reason,
    };
  }
  if (action.id === "restock") {
    const item = advisor.inventory.find((row) => row.decision === "order_now");
    return {
      title: fill(t("act.restock"), { p: item?.product ?? product }),
      reason: item ? localizeInventoryReason(item, t) : action.reason,
    };
  }
  if (action.id === "push-winner") {
    return {
      title: fill(t("act.push"), { p: product }),
      reason: fill(t("act.push.r"), { n: action.reason.match(/(-?\d+)/)?.[1] ?? "" }),
    };
  }
  return { title: action.title, reason: action.reason };
}

export function localizeRisk(
  risk: RiskAxis,
  kpis: FinancialKPIs,
  catalog: ProductPerformance[],
  t: T,
  willLoseNextMonth: boolean,
) {
  const labelKey = `ui.risk.${risk.id}`;
  const label = t(labelKey) === labelKey ? risk.label : t(labelKey);
  const level = t(`ui.risk.${risk.level}`);
  if (risk.id === "profit") {
    const bad = willLoseNextMonth || kpis.netProfit < 0;
    return { label, level, reason: bad ? t("ui.risk.r.profit.bad") : t("ui.risk.r.profit.ok") };
  }
  if (risk.id === "inventory") return { label, level, reason: t("ui.risk.r.inventory") };
  if (risk.id === "expense") {
    return {
      label,
      level,
      reason: fill(t("ui.risk.r.expense"), {
        e: kpis.expenseChangePct.toFixed(0),
        s: kpis.revenueChangePct.toFixed(0),
      }),
    };
  }
  if (risk.id === "sales") {
    return { label, level, reason: fill(t("ui.risk.r.sales"), { n: kpis.revenueChangePct.toFixed(0) }) };
  }
  if (risk.id === "product") {
    const n = catalog.filter((item) => item.isLoss).length;
    return { label, level, reason: fill(t("ui.risk.r.product"), { n }) };
  }
  const reviewCount = Number.parseInt(risk.reason, 10);
  if (Number.isFinite(reviewCount) && risk.reason.match(/^\d/)) {
    return { label, level, reason: fill(t("ui.risk.r.data.review"), { n: reviewCount }) };
  }
  return { label, level, reason: t("ui.risk.r.data.ok") };
}

export function localizePlanTask(task: string, t: T) {
  const product = quoted(task);
  if (task.startsWith("تعديل سعر") && product) return fill(t("plan.t.price"), { p: product });
  if (task.startsWith("إيقاف شراء") && product) return fill(t("plan.t.stop"), { p: product });
  if (task.startsWith("زيادة مخزون") && product) return fill(t("plan.t.stock"), { p: product });
  const exact: Record<string, string> = {
    "راجع أسعار المنتجات ضعيفة الهامش": "plan.t.reviewPrices",
    "لا تطلب الأصناف البطيئة": "plan.t.dontOrderSlow",
    "زوّد المنتجات الأسرع ربحاً بحذر": "plan.t.boost",
    "راجع أي مصروف تشغيل لا يرتبط بالمبيعات": "plan.t.reviewOpex",
    "نفّذ أول قرار من قائمة اليوم": "plan.t.doFirst",
    "ارفع ملف الشهر بعد التنفيذ": "plan.t.uploadNext",
    "قارن الربح قبل وبعد داخل لوحة القيادة": "plan.t.compare",
  };
  if (exact[task]) return t(exact[task]);
  if (product) {
    if (task.startsWith("أوقف")) return fill(t("act.stop"), { p: product });
    if (task.includes("الراكد")) return fill(t("act.stagnant"), { p: product });
    if (task.startsWith("راجع سعر")) return fill(t("act.price"), { p: product });
    if (task.startsWith("زِد مخزون") || task.startsWith("زد مخزون")) return fill(t("act.restock"), { p: product });
    if (task.startsWith("ادفع مبيعات")) return fill(t("act.push"), { p: product });
  }
  return task;
}

export function localizeAlert(alert: RiskAlert, amountLabel: string, t: T) {
  const titleKey = `alert.${alert.id}`;
  const title = t(titleKey) === titleKey ? alert.title : t(titleKey);
  const drop = alert.value ?? Number(alert.message.match(/([\d.]+)%/)?.[1] ?? "");
  const loss = alert.value ?? Number(alert.message.replace(/[^\d.]/g, ""));
  const shippingPct =
    alert.value ?? Number(alert.message.match(/([\d.]+)\s*%/)?.[1] ?? "");
  const messages: Record<string, string> = {
    "loss-next-month": fill(t("alert.loss-next-month.msg"), { n: amountLabel || String(Math.round(loss)) }),
    "sales-drop": fill(t("alert.sales-drop.msg"), { n: Number.isFinite(drop) ? drop : alert.value ?? "" }),
    "opex-faster": t("alert.opex-faster.msg"),
    "margin-squeeze": t("alert.margin-squeeze.msg"),
    "healthy-trend": t("alert.healthy-trend.msg"),
    "shipping-spike": fill(t("alert.shipping-spike.msg"), {
      n: Number.isFinite(shippingPct) ? Math.round(shippingPct) : "",
    }),
  };
  const recs: Record<string, string> = {
    "loss-next-month": t("alert.loss-next-month.rec"),
    "sales-drop": t("alert.sales-drop.rec"),
    "opex-faster": t("alert.opex-faster.rec"),
    "margin-squeeze": t("alert.margin-squeeze.rec"),
    "healthy-trend": t("alert.healthy-trend.rec"),
    "shipping-spike": t("alert.shipping-spike.rec"),
  };
  return {
    title,
    message: messages[alert.id] ?? alert.message,
    recommendation: recs[alert.id] ?? alert.recommendation,
  };
}

export function localizeRecommendation(id: string, margin: number, t: T) {
  const titleKey = `rec.${id}`;
  const bodyKey = `rec.${id}.body`;
  const actKey = `rec.${id}.act`;
  return {
    title: t(titleKey) === titleKey ? id : t(titleKey),
    body: id === "protect-margin" ? fill(t(bodyKey), { n: margin.toFixed(1) }) : t(bodyKey),
    actionLabel: t(actKey),
  };
}
