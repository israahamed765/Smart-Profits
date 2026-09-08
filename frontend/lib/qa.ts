import { formatMoney } from "./format";
import { t as translate, type Locale } from "./i18n";
import { runFullAnalysis } from "@/lib/analytics";
import { answerKnowledge, detectKnowledgeTopic, isTeachingQuestion } from "./advisor-knowledge";
import {
  healthHeadline,
  localizeAction,
  localizeFinding,
  localizeInventoryReason,
  localizeLeak,
  localizePlanTask,
  localizePricingCaution,
} from "./localize-advisor";
import { detectMonthKeyFromText, detectProductFromText, filterTransactions, uniqueProducts, type AnalysisScope } from "@/lib/scope";
import type { AnalysisResult, AppSettings, CurrencyCode, ParseResult, ProductPerformance, TaxonomyMap } from "@/lib/types";

function norm(q: string) {
  return q
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[؟?!,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isEnglishQuestion(q: string) {
  const latin = (q.match(/[a-z]/gi) ?? []).length;
  const arabic = (q.match(/[\u0600-\u06FF]/g) ?? []).length;
  return latin > arabic;
}

/** UI locale wins; only fall back to question script when locale is unset. */
function resolveLocale(question: string, options?: { locale?: Locale }): Locale {
  if (options?.locale === "en" || options?.locale === "ar") return options.locale;
  return isEnglishQuestion(question) ? "en" : "ar";
}

function money(value: number, currency: CurrencyCode) {
  return formatMoney(value, currency);
}

function has(q: string, words: string[]) {
  return words.some((word) => q.includes(word));
}

function healthLabelFor(score: number, locale: Locale) {
  const key =
    score >= 85
      ? "health.label.excellent"
      : score >= 70
        ? "health.label.veryGood"
        : score >= 50
          ? "health.label.fair"
          : score >= 30
            ? "health.label.weak"
            : "health.label.critical";
  return translate(locale, key);
}

const STOP = new Set([
  "بدي", "ابي", "ابغى", "اريد", "عطيني", "اعطيني", "يعطيني", "تعطيني", "احكيلي", "قلي", "قولي",
  "شو", "ما", "في", "من", "على", "عن", "الى", "هذا", "هذه", "هاي", "يلي", "اللي",
  "كم", "قديش", "لو", "سمحت", "ممكن", "سؤال", "الاسئله", "المنتج", "المنتجات",
  "صنف", "ملف", "افتح", "مفتوح", "the", "a", "an", "for", "and", "of", "to", "me",
  "please", "give", "show", "tell", "what", "which", "want", "those", "these",
  "هذول", "هدول", "هؤلاء", "هاذول", "نفس", "كمان", "ايضا", "بعدين", "هلا",
]);

type Intent =
  | "qty"
  | "sales"
  | "profit"
  | "margin"
  | "rank_top"
  | "rank_worst"
  | "list"
  | "why"
  | "buy"
  | "leak"
  | "health"
  | "today"
  | "ship"
  | "forecast"
  | "totals"
  | "expenses"
  | "how"
  | "plan";

/** Named tools the financial agent calls. Answers still come from this file, not an LLM. */
export type AdvisorToolId =
  | "need_file"
  | "lessons"
  | "file_scope"
  | "file_leaks"
  | "file_rank"
  | "file_qty"
  | "file_expenses"
  | "file_totals"
  | "file_health"
  | "file_today"
  | "file_inventory"
  | "file_forecast"
  | "file_shipping"
  | "file_how"
  | "file_why"
  | "marketing_plan"
  | "file_overview";

export type AdvisorAgentTurn = {
  answer: string;
  tools: AdvisorToolId[];
};

function scoreIntents(q: string): Partial<Record<Intent, number>> {
  const s: Partial<Record<Intent, number>> = {};
  const add = (intent: Intent, n: number) => {
    s[intent] = (s[intent] ?? 0) + n;
  };

  if (has(q, ["كميه", "كميات", "قطعه", "قطع", "انباع", "انبعات", "نباعت", "quantity", "quantities", "units", "unit sold", "units sold", "كم قطعه", "عدد القطع", "how many sold", "how many units"])) {
    add("qty", 4);
  }
  if (has(q, ["مبيع", "مبيعات", "ايراد", "ايرادات", "بعنا", "sales", "revenue", "sold", "بيعات", "turnover", "how much did i sell", "total revenue"])) add("sales", 3);
  if (has(q, ["ربح", "ارباح", "مكسب", "صافي", "profit", "earnings", "net income", "how much did i make", "made money"]) && !isTeachingQuestion(q)) add("profit", 3);
  if (has(q, ["هامش", "margin", "markup"])) add("margin", 3);
  if (has(q, ["اعلى", "اعلا", "اعلي", "اكثر", "افضل", "احسن", "اكبر", "top", "most", "highest", "best", "biggest", "best seller", "bestseller", "hero product", "winning product"])) {
    add("rank_top", 3);
  }
  if (has(q, ["اقل", "اسوا", "خس", "خاسر", "ضعيف", "worst", "least", "lowest", "loss", "losing", "losers", "underperform"])) add("rank_worst", 4);
  if (has(q, ["قائمه", "قائمة", "كل المنتجات", "جميع المنتجات", "اعرض المنتجات", "catalog", "list products", "all products", "show products", "product list", "sku list"])) {
    add("list", 4);
  }
  if (has(q, ["ليش", "لماذا", "سبب", "why", "نزل", "هبط", "drop", "went down", "declined", "falling"])) add("why", 3);
  if (has(q, ["اشتري", "اطلب", "مخزون", "ينفد", "نفاد", "inventory", "stock", "reorder", "buy", "what should i buy", "restock", "order more"]) && !isTeachingQuestion(q) && !has(q, ["مشتريات", "مورد", "purchasing"])) {
    add("buy", 4);
  }
  if (has(q, ["تسريب", "leak", "leaks", "هامش ضعيف", "profit leak", "bleeding"])) add("leak", 4);
  if (has(q, ["صحه", "تشخيص", "health", "كيف المتجر", "حال المتجر", "store health", "how is my store", "business health", "overview", "summary", "dashboard"])) add("health", 4);
  if (has(q, ["اليوم", "ماذا افعل", "شو اعمل", "قرار اليوم", "today", "what should i do", "next step", "recommendation", "recommend", "action item"])) add("today", 3);
  if (has(q, ["شحن", "توصيل", "shipping", "delivery", "freight"])) add("ship", 4);
  if (has(q, ["توقع", "شهر جاي", "القادم", "forecast", "next month", "prediction", "outlook"])) add("forecast", 4);
  if (has(q, ["مصروف", "مصاريف", "expense", "expenses", "opex", "تكاليف", "تكلفه", "costs", "cost of goods", "cogs"])) add("expenses", 3);
  if (has(q, ["كيف يحسب", "كيف تم حساب", "how is", "how do you calculate", "calculated", "يعني شو", "اشرح", "explain net", "what is net profit"])) add("how", 3);
  if (has(q, [
    "خطه", "خطه تسويق", "تسويقيه", "اعلان", "اعلانات", "ترويج", "سوقي",
    "حملات", "حمله", "marketing", "campaign", "promote", "promotion", "ads", "advertis", "go to market",
  ])) {
    add("plan", 6);
  }
  if (has(q, ["تسويق", "تسويقي", "marketing tips"]) && !has(q, ["خطه", "campaign", "اعلان", "plan"])) {
    if (isTeachingQuestion(q)) add("plan", 1);
  }
  if (has(q, ["صافي الربح", "net profit", "bottom line"])) add("profit", 2);
  if (has(q, ["كم بعنا", "اجمالي المبيعات", "total sales", "overall sales", "grand total"])) add("totals", 3);
  if (has(q, ["ملخص", "اختصر", "summar", "recap", "brief me", "tell me everything", "full picture"])) {
    add("health", 2);
    add("totals", 2);
    add("rank_top", 1);
  }

  if ((s.rank_top ?? 0) > 0 && (s.profit ?? 0) === 0 && (s.sales ?? 0) === 0) {
    if (has(q, ["مبيع", "بيع"])) add("sales", 2);
    else if (has(q, ["ربح"])) add("profit", 2);
    else add("sales", 1);
  }
  if (has(q, ["كم "]) || q.startsWith("كم") || has(q, ["قديش", "how much", "how many"])) {
    if ((s.qty ?? 0) === 0 && (s.profit ?? 0) === 0 && (s.sales ?? 0) === 0) add("qty", 2);
  }
  return s;
}

function topIntents(scores: Partial<Record<Intent, number>>, min = 2) {
  return (Object.entries(scores) as [Intent, number][])
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([intent]) => intent);
}

function contentTokens(q: string) {
  return q.split(" ").filter((token) => token.length >= 2 && !STOP.has(token));
}

function isFollowUp(q: string) {
  if (
    has(q, [
      "هذول", "هدول", "هؤلاء", "هاذول", "هاي المنتجات", "هذه المنتجات",
      "يلي عرض", "اللي عرض", "اللي ذكر", "يلي ذكر", "نفس المنتجات", "نفسهم",
      "عرضتها", "ذكرت", "them", "these", "those", "the ones",
    ])
  ) {
    return true;
  }
  return has(q, ["كمان", "وكمان", "ايضا", "بعدين", "as well", "too", "also"]) && contentTokens(q).length <= 1;
}

function productLine(item: ProductPerformance, currency: CurrencyCode, en: boolean) {
  if (en) {
    return `«${item.name}» — profit ${money(item.profit, currency)}, margin ${item.margin.toFixed(0)}%, sales ${money(item.revenue, currency)}, qty ${item.quantity}`;
  }
  return `«${item.name}» — ربح ${money(item.profit, currency)}، هامش ${item.margin.toFixed(0)}%، مبيعات ${money(item.revenue, currency)}، كمية ${item.quantity} قطعة`;
}

function quantityLine(item: ProductPerformance, currency: CurrencyCode, en: boolean) {
  if (en) {
    return `«${item.name}» — ${item.quantity} units sold (${item.saleCount} sales) • ${money(item.revenue, currency)}`;
  }
  return `«${item.name}» — الكمية المباعة ${item.quantity} قطعة (${item.saleCount} عملية) • مبيعات ${money(item.revenue, currency)}`;
}

function fullCard(item: ProductPerformance, currency: CurrencyCode, en: boolean) {
  if (en) {
    return `«${item.name}»: qty ${item.quantity} • sales ${money(item.revenue, currency)} • profit ${money(item.profit, currency)} • margin ${item.margin.toFixed(0)}% • ${item.saleCount} rows`;
  }
  return `«${item.name}»: الكمية ${item.quantity} قطعة • المبيعات ${money(item.revenue, currency)} • الربح ${money(item.profit, currency)} • الهامش ${item.margin.toFixed(0)}% • ${item.saleCount} عملية`;
}

function productsFromText(text: string, catalog: ProductPerformance[]) {
  const quoted = [...text.matchAll(/[«"]([^»"]+)[»"]/g)].map((match) => norm(match[1]));
  const numbered = [...text.matchAll(/(?:^|\n)\s*\d+\)\s*([^\n—\-:]+)/g)].map((match) => norm(match[1]));
  const names = [...quoted, ...numbered].filter(Boolean);
  if (!names.length) return [];
  return catalog.filter((item) => {
    const name = norm(item.name);
    return names.some((piece) => piece === name || piece.includes(name) || name.includes(piece));
  });
}

function findProducts(q: string, catalog: ProductPerformance[]) {
  const sorted = [...catalog].sort((a, b) => b.name.length - a.name.length);
  const exact = sorted.filter((item) => {
    const name = norm(item.name);
    return name.length >= 3 && q.includes(name);
  });
  if (exact.length) return exact.slice(0, 5);

  const tokens = q.split(" ").filter((token) => token.length >= 3 && !STOP.has(token));
  if (!tokens.length) return [];
  const scored = catalog
    .map((item) => {
      const name = norm(item.name);
      const nameTokens = name.split(" ").filter((token) => token.length >= 3 && !STOP.has(token));
      const hits = nameTokens.filter((token) => tokens.some((piece) => piece === token || piece.includes(token) || token.includes(piece))).length;
      return { item, hits, parts: nameTokens.length };
    })
    .filter((row) => row.hits > 0 && (row.hits >= 2 || (row.parts > 0 && row.hits / row.parts >= 0.5) || (row.hits === 1 && row.parts <= 2)));
  return scored.sort((a, b) => b.hits - a.hits).slice(0, 5).map((row) => row.item);
}

function topN(q: string) {
  const match = q.match(/\b(\d{1,2})\b/) || q.match(/(?:اول|أول|top)\s*(\d{1,2})/);
  if (!match) return 3;
  return Math.min(10, Math.max(1, Number(match[1]) || 3));
}

export function resultForQuestion(
  question: string,
  parsed: ParseResult | null | undefined,
  settings: AppSettings,
  taxonomy: TaxonomyMap | undefined,
  fallback: AnalysisResult | null,
  currentScope?: AnalysisScope,
): AnalysisResult | null {
  if (!parsed || !fallback) return fallback ?? null;
  const monthFromQ = detectMonthKeyFromText(question, parsed.transactions);
  const productFromQ = detectProductFromText(question, uniqueProducts(parsed.transactions));
  if (!monthFromQ && !productFromQ && !currentScope) return fallback;

  const month = monthFromQ ?? currentScope?.monthKey ?? null;
  const product = productFromQ ?? (monthFromQ ? null : currentScope?.product ?? null);
  const sheet = monthFromQ || productFromQ ? null : currentScope?.sheet ?? null;
  if (!month && !product && !sheet) return fallback;

  const transactions = filterTransactions(parsed.transactions, {
    monthKey: month,
    product,
    sheet,
  });
  if (!transactions.length) return fallback;
  const scopedSettings = product
    ? { ...settings, rent: 0, salaries: 0, utilities: 0, otherOpex: 0, opexIncludedInFile: true }
    : settings;
  return runFullAnalysis(
    { ...parsed, transactions, rowCount: transactions.length },
    scopedSettings,
    taxonomy,
  );
}

function lineFor(item: ProductPerformance, intents: Intent[], currency: CurrencyCode, en: boolean) {
  if (intents.includes("qty") && !intents.includes("profit") && !intents.includes("margin")) {
    return quantityLine(item, currency, en);
  }
  if (intents.includes("qty") || intents.includes("sales") || intents.includes("profit") || intents.includes("margin")) {
    return fullCard(item, currency, en);
  }
  return productLine(item, currency, en);
}

function marketingPlan(result: AnalysisResult, currency: CurrencyCode, locale: Locale) {
  const en = locale === "en";
  const t = (key: string) => translate(locale, key);
  const { advisor, productHighlights, kpis, fileName } = result;
  const winners = [...productHighlights.catalog].sort((a, b) => b.profit - a.profit).slice(0, 3);
  const slow = productHighlights.lowestSales;
  const loss = productHighlights.lossMakers[0];
  const leak = advisor.leaks[0];
  const leakL = leak ? localizeLeak(leak, t) : null;
  const price = advisor.pricing[0];
  const priceCaution = price ? localizePricingCaution(price.margin, t) : "";
  const weeks = advisor.plan.slice(0, 4);
  const weekTitles = ["plan.w1", "plan.w2", "plan.w3", "plan.w4"] as const;

  if (en) {
    const push = winners
      .map((item, i) => `${i + 1}) «${item.name}» — profit ${money(item.profit, currency)}, ${item.quantity} sold. Feature this; do not waste ad budget on the whole menu.`)
      .join("\n");
    const avoid = [
      slow ? `Do not advertise «${slow.name}» (${slow.saleCount} sales). Use a quiet clearance, not paid ads.` : "",
      loss ? `Stop promoting «${loss.name}» — it is dragging profit (${money(loss.profit, currency)}).` : "",
      leak && leakL ? `Leak to fix first: «${leak.product}». ${leakL.suggestion}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const offer = price
      ? `This week's offer: keep «${price.product}» between ${money(price.suggestedMin, currency)} and ${money(price.suggestedMax, currency)}. ${priceCaution}`
      : winners[1]
        ? `This week's offer: bundle «${winners[0].name}» with «${winners[1].name}» and keep the discount off the high-margin item.`
        : "This week's offer: one featured item only — the top-profit product.";
    const calendar = weeks
      .map((week, i) => {
        const title = t(weekTitles[i] ?? "plan.w1");
        const tasks = week.tasks.map((task) => localizePlanTask(task, t)).join("; ");
        return `Week ${week.week} — ${title}: ${tasks}`;
      })
      .join("\n");
    return [
      `Marketing plan from «${fileName}» (not a generic template). Margin now ${kpis.profitMargin.toFixed(1)}%.`,
      "",
      "1) Push the winners",
      push || "Not enough product rows to pick a hero item.",
      "",
      "2) Do not spend ads on weak items",
      avoid || "No clear weak item in this file.",
      "",
      "3) One offer this week",
      offer,
      "",
      "4) Four-week calendar",
      calendar,
    ].join("\n");
  }

  const push = winners
    .map(
      (item, i) =>
        `${i + 1}) «${item.name}» — ربح ${money(item.profit, currency)}، انباع ${item.quantity} قطعة. خلّيه ظاهر في الواجهة/الستوري، وما توزّعي الميزانية على كل الأصناف.`,
    )
    .join("\n");
  const avoid = [
    slow
      ? `لا تعلني عن «${slow.name}» (${slow.saleCount} عمليات). صفّيه بهدوء أو أوقفي طلبه، الإعلان المدفوع عليه خسارة.`
      : "",
    loss ? `لا تروّجي «${loss.name}» — يسحب الربح (${money(loss.profit, currency)}).` : "",
    leak && leakL ? `أول تسريب تصلحيه: «${leak.product}». ${leakL.suggestion}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const offer = price
    ? `عرض هذا الأسبوع: ثبّتي «${price.product}» بين ${money(price.suggestedMin, currency)} و${money(price.suggestedMax, currency)}. ${priceCaution}`
    : winners[1]
      ? `عرض هذا الأسبوع: اجمعي «${winners[0].name}» مع «${winners[1].name}» في باقة، والخصم يكون على الصنف الأضعف هامشاً مش على الرابحة.`
      : "عرض هذا الأسبوع: منتج واحد فقط في الواجهة — الأعلى ربحاً.";
  const calendar = weeks
    .map((week, i) => {
      const title = t(weekTitles[i] ?? "plan.w1");
      const tasks = week.tasks.map((task) => localizePlanTask(task, t)).join("؛ ");
      return `الأسبوع ${week.week} — ${title}: ${tasks}`;
    })
    .join("\n");
  return [
    `خطة تسويق من ملفك «${fileName}» (مو قالب عام). هامش الربح الحالي ${kpis.profitMargin.toFixed(1)}%.`,
    "",
    "1) روّجي الرابحة فقط",
    push || "ما في أصناف كافية لاختيار منتج بطاقة.",
    "",
    "2) لا تدفعي إعلان على الضعيف",
    avoid || "ما ظهر صنف ضعيف واضح في هذا الملف.",
    "",
    "3) عرض واحد هذا الأسبوع",
    offer,
    "",
    "4) جدول 4 أسابيع",
    calendar,
  ].join("\n");
}

export function runAdvisorAgent(
  question: string,
  result: AnalysisResult,
  options?: {
    locale?: Locale;
    currency?: CurrencyCode;
    previousQuestion?: string;
    previousAnswer?: string;
  },
): AdvisorAgentTurn {
  const q = norm(question);
  const prevQ = norm(options?.previousQuestion ?? "");
  const currency = options?.currency ?? "SAR";
  const locale = resolveLocale(question, options);
  const en = locale === "en";
  const t = (key: string) => translate(locale, key);
  const { kpis, advisor, productHighlights, forecast, fileName, monthlySeries } = result;
  const monthNote = monthlySeries.length === 1 ? monthlySeries[0].label : "";
  const catalog = productHighlights.catalog;
  const leak = advisor.leaks[0];
  const leakL = leak ? localizeLeak(leak, t) : null;
  const health = advisor.health;
  const healthFinding = health.findings[0]
    ? localizeFinding(health.findings[0], kpis, catalog, t)
    : null;
  const action = advisor.todayActions[0];
  const actionL = action ? localizeAction(action, advisor, t) : null;
  const topProfit = productHighlights.mostProfitable;
  const topSales = productHighlights.highestSales;
  const n = topN(q);
  const done = (tool: AdvisorToolId, answer: string): AdvisorAgentTurn => ({ answer, tools: [tool] });

  if (!q) {
    return done(
      "file_overview",
      en ? "Ask about the open file, for example: highest profit product." : "اكتب سؤالك، مثلاً: مين أعلى منتج ربح؟",
    );
  }

  const knowledge = detectKnowledgeTopic(q);
  if (knowledge) {
    return done("lessons", answerKnowledge(knowledge, locale, result, currency));
  }

  let scores = scoreIntents(q);
  const ownStrong = topIntents(scores, 3).length > 0;
  const followUp =
    Boolean(prevQ) &&
    (isFollowUp(q) || (!ownStrong && contentTokens(q).length <= 1));
  if (followUp && prevQ && !ownStrong) {
    const inherited = scoreIntents(prevQ);
    for (const [intent, value] of Object.entries(inherited) as [Intent, number][]) {
      if (intent === "plan") continue;
      if ((scores[intent] ?? 0) < value) scores[intent] = Math.max(scores[intent] ?? 0, Math.round(value * 0.85));
    }
  }

  let intents = topIntents(scores, 2);
  const named = findProducts(q, catalog);
  const shown = productsFromText(`${options?.previousAnswer ?? ""}\n${options?.previousQuestion ?? ""}`, catalog);
  const focus =
    named.length && !followUp
      ? named
      : followUp && shown.length
        ? shown
        : named.length
          ? named
          : [];

  const header = en
    ? `From the open file «${fileName}»${monthNote ? ` (${monthNote})` : ""}:`
    : `من الملف المفتوح «${fileName}»${monthNote ? ` — ${monthNote}` : ""}:`;

  if (intents.includes("plan")) {
    return done("marketing_plan", marketingPlan(result, currency, locale));
  }

  if (intents.includes("how") && (intents.includes("profit") || has(q, ["صافي", "net profit", "كيف يحسب", "how is net", "how do you calculate", "calculate profit", "what is net"]))) {
    return done(
      "file_how",
      en
        ? `Net profit = sales − (cost of goods + operating costs like rent, salaries, shipping). Current margin ${kpis.profitMargin.toFixed(1)}%. In «${fileName}» net profit is ${money(kpis.netProfit, currency)}.`
        : `صافي الربح = المبيعات − (تكلفة البضاعة + المصاريف التشغيلية مثل الإيجار والرواتب والشحن). حالياً الهامش ${kpis.profitMargin.toFixed(1)}%. في «${fileName}» صافي الربح ${money(kpis.netProfit, currency)}.`,
    );
  }

  if (intents.includes("why") && (intents.includes("profit") || intents.includes("sales") || has(q, ["خس", "loss", "drop"]))) {
    const costNote =
      kpis.expenseChangePct > kpis.revenueChangePct
        ? en
          ? `The main reason is costs/expenses up ${kpis.expenseChangePct.toFixed(0)}%, while sales ${kpis.revenueChangePct >= 0 ? "rose" : "fell"} ${Math.abs(kpis.revenueChangePct).toFixed(0)}%.`
          : `السبب الرئيسي هو ارتفاع التكلفة/المصاريف بنسبة ${kpis.expenseChangePct.toFixed(0)}%، بينما المبيعات ${kpis.revenueChangePct >= 0 ? "زادت" : "نزلت"} ${Math.abs(kpis.revenueChangePct).toFixed(0)}% فقط.`
        : en
          ? `Profit margin is now ${kpis.profitMargin.toFixed(1)}%. Check low-margin products first.`
          : `هامش الربح حالياً ${kpis.profitMargin.toFixed(1)}%. راجع المنتجات ضعيفة الهامش أولاً.`;
    const leakNote = leak && leakL
      ? en
        ? ` Biggest leak: «${leak.product}» — ${leakL.issue}`
        : ` وأكبر تسريب ظاهر: «${leak.product}» — ${leakL.issue}`
      : "";
    return done("file_why", `${costNote}${leakNote}`);
  }

  if (intents.includes("buy")) {
    const order = advisor.inventory.find((item) => item.decision === "order_now");
    const stop = advisor.inventory.find((item) => item.decision === "dont_buy");
    if (order) {
      const reason = localizeInventoryReason(order, t);
      return done("file_inventory", en ? `Buy first: «${order.product}». ${reason}` : `الأولوية للشراء: «${order.product}». ${reason}`);
    }
    if (stop) {
      const reason = localizeInventoryReason(stop, t);
      return done("file_inventory", en ? `Do not buy «${stop.product}» now. ${reason}` : `لا تشترِ «${stop.product}» الآن. ${reason}`);
    }
    return done(
      "file_inventory",
      en
        ? "No urgent stock-out signal in this file. Focus on the fastest-profit products."
        : "ما في إشارة نفاد وشيكة من الملف. ركّز على المنتجات الأسرع ربحاً فقط.",
    );
  }

  if (intents.includes("leak")) {
    if (!leak || !leakL) return done("file_leaks", en ? "No clear profit leak in this file." : "ما ظهر تسريب واضح في الربح من هذا الملف.");
    return done(
      "file_leaks",
      en
        ? `Leak in «${leak.product}»: sales ${money(leak.revenue, currency)} vs profit ${money(leak.profit, currency)}. ${leakL.suggestion}`
        : `وجدنا تسريباً في «${leak.product}»: مبيعات ${money(leak.revenue, currency)} مقابل ربح ${money(leak.profit, currency)}. ${leakL.suggestion}`,
    );
  }

  if (intents.includes("health")) {
    const headline = healthHeadline(health.daysUntilProblem, t);
    const label = healthLabelFor(health.score, locale);
    const detail = healthFinding?.detail ?? "";
    return done(
      "file_health",
      en
        ? `Store health ${health.score}/100 (${label}). ${headline} ${detail}`
        : `صحة المتجر ${health.score}/100 (${label}). ${headline} ${detail}`,
    );
  }

  if (intents.includes("today")) {
    if (!action || !actionL) {
      return done("file_today", en ? "Upload a clearer file so I can suggest today's action." : "ارفع ملفاً أوضح حتى نقترح قرار اليوم.");
    }
    return done("file_today", en ? `Today's action: ${actionL.title}. ${actionL.reason}` : `قرار اليوم: ${actionL.title}. ${actionL.reason}`);
  }

  if (intents.includes("ship")) {
    const shipping = result.expenseBreakdown.find((item) => /شحن|توصيل|shipping|delivery/i.test(item.name));
    if (shipping) {
      return done(
        "file_shipping",
        en
          ? `Shipping/delivery from the file is ${money(shipping.value, currency)}. It is treated as operating cost and subtracted from sales for net profit.`
          : `تكلفة الشحن/التوصيل ظهرت من الملف (${money(shipping.value, currency)}). تُضاف إلى مصاريف التشغيل وتُطرح من المبيعات عند حساب صافي الربح.`,
      );
    }
    return done("file_shipping", en ? "No clear shipping line in the open file." : "ما ظهر بند شحن واضح في الملف.");
  }

  if (intents.includes("forecast")) {
    const s = advisor.scenarios;
    return done(
      "file_forecast",
      en
        ? `Next month — worst ${money(s.worst.profit, currency)}, expected ${money(s.expected.profit, currency)}, best ${money(s.best.profit, currency)}.`
        : `الشهر القادم — أسوأ حالة ربح ${money(s.worst.profit, currency)}، المتوقع ${money(s.expected.profit, currency)}، وأفضل حالة ${money(s.best.profit, currency)}.`,
    );
  }

  if (intents.includes("expenses") && !focus.length && !intents.includes("rank_top") && !intents.includes("qty")) {
    const lines = result.expenseBreakdown.slice(0, 5).map((item) => `• ${item.name}: ${money(item.value, currency)}`);
    return done(
      "file_expenses",
      en
        ? `Expenses in «${fileName}»: total ${money(kpis.totalExpenses, currency)} (opex ${money(kpis.totalOpex, currency)}).\n${lines.join("\n")}`
        : `المصاريف في «${fileName}»: الإجمالي ${money(kpis.totalExpenses, currency)} (تشغيل ${money(kpis.totalOpex, currency)}).\n${lines.join("\n")}`,
    );
  }

  if (intents.includes("totals") && !focus.length && !intents.includes("rank_top") && !intents.includes("qty")) {
    return done(
      "file_totals",
      en
        ? `In «${fileName}»: sales ${money(kpis.totalRevenue, currency)}, COGS ${money(kpis.totalCogs, currency)}, opex ${money(kpis.totalOpex, currency)}, net profit ${money(kpis.netProfit, currency)} (${kpis.profitMargin.toFixed(1)}%).`
        : `في «${fileName}»: المبيعات ${money(kpis.totalRevenue, currency)}، تكلفة البضاعة ${money(kpis.totalCogs, currency)}، التشغيل ${money(kpis.totalOpex, currency)}، صافي الربح ${money(kpis.netProfit, currency)} (هامش ${kpis.profitMargin.toFixed(1)}%).`,
    );
  }

  let items: ProductPerformance[] = focus;
  if (!items.length && (intents.includes("rank_top") || intents.includes("list") || intents.includes("qty") || intents.includes("sales") || intents.includes("profit"))) {
    const bySales = intents.includes("sales") || intents.includes("qty") || (scores.sales ?? 0) >= (scores.profit ?? 0);
    items = [...catalog]
      .sort((a, b) => (bySales || intents.includes("qty") ? b.revenue - a.revenue : b.profit - a.profit))
      .slice(0, intents.includes("list") ? Math.min(8, Math.max(3, n)) : n);
  }

  if (intents.includes("rank_worst") && !focus.length) {
    const losers = [...catalog].sort((a, b) => a.profit - b.profit).slice(0, n);
    if (!losers.length) {
      return done("file_leaks", en ? "No losing products showed up in this file." : "ما ظهر منتج خاسر واضح في هذا الملف.");
    }
    return done(
      "file_leaks",
      `${header}\n${en ? "Weakest products" : "أضعف المنتجات"}:\n${losers.map((item, i) => `${i + 1}) ${lineFor(item, intents, currency, en)}`).join("\n")}`,
    );
  }

  if (items.length) {
    const title = intents.includes("qty")
      ? en
        ? "Sales quantities"
        : "كميات البيع"
      : intents.includes("rank_top") && (intents.includes("sales") || intents.includes("qty"))
        ? en
          ? "Best sellers"
          : "الأعلى مبيعاً"
        : intents.includes("rank_top") && intents.includes("profit")
          ? en
            ? "Highest profit"
            : "الأعلى ربحاً"
          : en
            ? "Here is what the file shows"
            : "هذا ما يظهره الملف";
    const tool: AdvisorToolId = intents.includes("qty") && !intents.includes("profit") && !intents.includes("rank_top") ? "file_qty" : "file_rank";
    return done(
      tool,
      `${header}\n${title}:\n${items.map((item, i) => `${i + 1}) ${lineFor(item, intents.length ? intents : ["qty", "sales", "profit"], currency, en)}`).join("\n")}`,
    );
  }

  if (topSales && (has(q, ["مبيع", "بيع", "sales"]) || intents.includes("sales"))) {
    const extra = [...catalog].sort((a, b) => b.revenue - a.revenue).slice(0, n);
    return done(
      "file_rank",
      `${header}\n${en ? "Best sellers" : "الأعلى مبيعاً"}:\n${extra.map((item, i) => `${i + 1}) ${quantityLine(item, currency, en)}`).join("\n")}`,
    );
  }

  if (topProfit && (has(q, ["ربح", "profit"]) || intents.includes("profit"))) {
    const extra = [...catalog].sort((a, b) => b.profit - a.profit).slice(0, n);
    return done(
      "file_rank",
      `${header}\n${en ? "Highest profit" : "الأعلى ربحاً"}:\n${extra.map((item, i) => `${i + 1}) ${productLine(item, currency, en)}`).join("\n")}`,
    );
  }

  const extra = [...catalog].sort((a, b) => b.profit - a.profit).slice(0, 3);
  const today = actionL ? (en ? `Today: ${actionL.title}. ${actionL.reason}` : `اليوم: ${actionL.title}. ${actionL.reason}`) : "";
  const leakLine =
    leak && leakL
      ? en
        ? `Watch leak: «${leak.product}» — ${leakL.issue}`
        : `راقبي التسريب: «${leak.product}» — ${leakL.issue}`
      : "";
  return done(
    "file_overview",
    [
      header,
      en
        ? `Sales ${money(kpis.totalRevenue, currency)} • net profit ${money(kpis.netProfit, currency)} • health ${health.score}/100 (${healthLabelFor(health.score, locale)}).`
        : `المبيعات ${money(kpis.totalRevenue, currency)} • صافي الربح ${money(kpis.netProfit, currency)} • الصحة ${health.score}/100 (${healthLabelFor(health.score, locale)}).`,
      today,
      leakLine,
      extra.length
        ? `${en ? "Highest profit products" : "الأعلى ربحاً"}:\n${extra.map((item, i) => `${i + 1}) ${fullCard(item, currency, en)}`).join("\n")}`
        : "",
      forecast.willLoseNextMonth ? (en ? "Warning: next month may close at a loss." : "تنبيه: الشهر القادم قد يُغلق بخسارة.") : "",
      en
        ? "Try asking: highest profit product, show losses, expenses, what should I buy, marketing plan, January sales, or store health."
        : "جرّبي: أعلى منتج ربح، الخسائر، المصاريف، شو أشتري، خطة تسويق، مبيعات يناير، أو صحة المتجر.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

export function answerMerchantQuestion(
  question: string,
  result: AnalysisResult,
  options?: {
    locale?: Locale;
    currency?: CurrencyCode;
    previousQuestion?: string;
    previousAnswer?: string;
  },
): string {
  return runAdvisorAgent(question, result, options).answer;
}
