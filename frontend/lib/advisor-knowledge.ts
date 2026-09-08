import { formatMoney } from "./format";
import type { Locale } from "./i18n";
import type { AnalysisResult, CurrencyCode } from "@/lib/types";

export type KnowledgeTopic = "shop" | "books" | "trade" | "profit" | "purchase";

function prepare(q: string) {
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

function has(q: string, words: string[]) {
  return words.some((word) => q.includes(word));
}

const TEACH = [
  "معلومات",
  "مفهوم",
  "اساسيات",
  "مبادئ",
  "علمني",
  "علميني",
  "اشرح",
  "ما هو",
  "ما هي",
  "شو يعني",
  "يعني ايش",
  "نصائح",
  "قواعد",
  "كيفيه",
  "كيف",
  "learn",
  "explain",
  "what is",
  "what's",
  "whats",
  "basics",
  "advice",
  "tips",
  "teach me",
  "help me understand",
  "how does",
  "how do",
];

export function isTeachingQuestion(question: string) {
  return has(prepare(question), TEACH);
}

export function detectKnowledgeTopic(question: string): KnowledgeTopic | null {
  const q = prepare(question);
  const scores: Partial<Record<KnowledgeTopic, number>> = {};
  const add = (topic: KnowledgeTopic, n: number) => {
    scores[topic] = (scores[topic] ?? 0) + n;
  };

  if (has(q, ["كتاب", "كتب", "اقرا", "اقرأ", "قراءه", "book", "books", "read about", "recommend a book", "reading list"])) add("books", 8);
  if (has(q, ["تسوق", "زبون", "زبائن", "عملاء", "عميل", "تجربة العميل", "customer", "shopper", "shopping", "merchandis", "retail tips", "store tips"])) {
    add("shop", 6);
  }
  if (has(q, ["تجاره", "تجارة", "تاجر", "تجاري", "بياعه", "commerce", "retail", "trade", "merchant", "how to run a shop", "business basics"])) add("trade", 6);
  if (has(q, ["مشتريات", "مورد", "موردين", "توريد", "purchasing", "procurement", "supplier", "كيف اشتري", "قرار الشراء", "how to buy", "buying rules"])) {
    add("purchase", 6);
  }
  if (isTeachingQuestion(q) && has(q, ["ربح", "ارباح", "هامش", "profit", "margin", "make money"])) add("profit", 7);
  if (has(q, ["ربح حقيقي", "ربح وهمي", "phantom profit", "real profit", "انواع الربح", "types of profit"])) add("profit", 8);

  const ranked = (Object.entries(scores) as [KnowledgeTopic, number][]).sort((a, b) => b[1] - a[1]);
  return ranked[0] && ranked[0][1] >= 6 ? ranked[0][0] : null;
}

function fileNote(result: AnalysisResult | null | undefined, currency: CurrencyCode, en: boolean) {
  if (!result) return "";
  const { kpis, fileName } = result;
  return en
    ? `\n\nOn your open file «${fileName}»: net profit ${formatMoney(kpis.netProfit, currency)} • margin ${kpis.profitMargin.toFixed(1)}%. Ask a product or month if you want the numbers, not the lesson.`
    : `\n\nعلى ملفك المفتوح «${fileName}»: صافي الربح ${formatMoney(kpis.netProfit, currency)} • الهامش ${kpis.profitMargin.toFixed(1)}%. إذا بدك الأرقام مش الدرس، اسألي عن منتج أو شهر.`;
}

const LESSONS: Record<KnowledgeTopic, { ar: string; en: string }> = {
  shop: {
    ar: `التسوّق من زاوية التاجر مو «اعرض كل شيء». الزبون يشتري قراراً سريعاً، وأنتِ تربحين من وضوح العرض.

قواعد عملية:
1) منتج بطل واحد في الواجهة — الأعلى ربحاً أو الأسرع دوراً، مش الأغلى فقط.
2) لا تعلني عن صنف راكد بإعلان مدفوع. صفّيه أو أوقفِ طلبه.
3) الخصم على الهامش الضعيف يأكل الربح. إذا بدك عرضاً، اجمعي باقة: رابح + بطيء، والخصم على البطيء.
4) الرف/الستوري يحكي قصة: مشكلة الزبون → المنتج → السعر الواضح.
5) راقبي «تكلفة جلب الزبون» مقابل الربح من أول عملية. إذا الإعلان أغلى من الربح، التسويق خاسر حتى لو زادت المبيعات.

هذا ما يربطه Smart Profits بملفك: روّجي الرابحة، لا تدفعي على الخاسرة.`,
    en: `Shopping, from the merchant’s side, is not “show everything”. A customer buys a fast decision; you earn from a clear offer.

Practical rules:
1) One hero product in the front — highest profit or fastest turn, not only the highest price.
2) Do not run paid ads on a stagnant item. Clear it quietly or stop reordering.
3) Discounting a weak margin eats profit. If you need an offer, bundle a winner with a slow item and discount the slow one.
4) The shelf or story should read: customer problem → product → clear price.
5) Watch customer-acquisition cost against first-sale profit. If ads cost more than the profit, marketing is losing even when sales rise.

Smart Profits ties this to your file: push winners, do not pay to promote losers.`,
  },
  trade: {
    ar: `التجارة للتاجر الصغير ثلاث حلقات: تشتري بحكمة، تبيعين بوضوح، وتبقي نقداً في الصندوق.

1) المبيعات رقم فخم إذا التكلفة والمصروف ثابت (إيجار، رواتب، فواتير) أكبر منها. لذلك نفصل الربح الحقيقي عن الوهمي.
2) دورة البضاعة: كل يوم يجلس الصنف على الرف هو فلوس محبوسة. السرعة أهم من تكديس الكمية.
3) لا تكبري التشكيلة قبل ما تثبتي هامش 3–5 أصناف رابحة.
4) السعر قرار، مش تقليد المنافس. إذا المنافس أرخص لأنه يخسر، لا تجاريه.
5) السجل (الملف) أهم من الإحساس. بدون تاريخ وكمية وتكلفة، القرار تخمين.

Smart Profits يقرأ ملفك بهالمنطق: إيراد − تكلفة البضاعة − تشغيل = صافي، وبعدها خطة 30 يوماً.`,
    en: `Small-merchant trade is three loops: buy with care, sell with clarity, keep cash in the till.

1) Sales look impressive if cost plus fixed opex (rent, payroll, bills) is larger. That is why we split real profit from phantom profit.
2) Inventory days are cash sitting on a shelf. Turn speed beats stacking quantity.
3) Do not widen the assortment before 3–5 SKUs hold a solid margin.
4) Price is a decision, not copying a competitor. If they are cheaper because they lose money, do not follow.
5) The ledger (your file) beats gut feel. Without date, quantity, and cost, every decision is a guess.

Smart Profits reads your file that way: revenue − COGS − operating cost = net, then a 30-day plan.`,
  },
  profit: {
    ar: `الربح مو «كم دخل الصندوق». في ثلاثة أوجه لازم تفرّقيهم:

• إجمالي الربح = المبيعات − تكلفة البضاعة (الخامات/الشراء).
• الربح التشغيلي = الإجمالي − المصاريف (إيجار، رواتب، فواتير، تسويق، شحن).
• الربح الحقيقي عندنا = صافي بعد التشغيل. الربح الوهمي = ما يظهر إذا تجاهلتي الإيجار والرواتب وقرأتي ملف المبيعات لوحده.

هامش الربح = (الصافي ÷ المبيعات) × 100. متجر يبيع كثير بهامش 5% أضعف من متجر يبيع أقل بهامش 25%، إذا المصروف ثابت عالٍ.

علامات خطر: المصروف ينمو أسرع من المبيعات، أصناف تنباع بخسارة، مخزون راكد يحجز نقداً.

اسألي «مين أعلى منتج ربح؟» لملفك، أو «خطة تسويقية» لربط الدرس بالأصناف.`,
    en: `Profit is not “how much cash came in”. Split three views:

• Gross profit = sales − cost of goods.
• Operating profit = gross − opex (rent, payroll, utilities, marketing, shipping).
• Real profit here = net after opex. Phantom profit is what you see if you ignore rent and salaries and read the sales file alone.

Margin = (net ÷ sales) × 100. A busy shop at 5% margin is weaker than a quieter shop at 25% if fixed costs are high.

Warning signs: expenses growing faster than sales, items sold at a loss, stagnant stock locking cash.

Ask “highest profit product?” for your file, or “marketing plan” to tie the lesson to SKUs.`,
  },
  purchase: {
    ar: `الشراء قرار مخزون، مش عادة أسبوعية. اشتري ما يتحرك بربح، لا ما يعطيك المورد عليه «عرض كمية».

قواعد:
1) ابدئي من سرعة البيع لا من الحد الأدنى للطلب. إذا الصنف ما انباع، الكمية الكبيرة خصم وهمي.
2) لا تعيدي طلب الخاسر أو الراكد. صفّيه أولاً.
3) زوّدي الرابحة بحذر (مثلاً +20% من وتيرة الشهر) مش مضاعفة عشوائية.
4) سعر الشراء جزء من الهامش. إذا المورد رفع التكلفة وما قدرتِ ترفعي البيع، الهامش ينضغط — راجعي السعر قبل الطلب.
5) نوّعي المورد إذا صنف واحد يوقف المحل، بس لا تكثري أصنافاً جديدة قبل ما يثبت الربح.

من الملف نقدر نقول «اشتري هذا / لا تشتري ذاك» حسب الدوران والربح. اسألي: شو أشتري أول؟`,
    en: `Purchasing is an inventory decision, not a weekly habit. Buy what turns at a profit, not what the supplier discounts in bulk.

Rules:
1) Start from sell-through, not the supplier’s minimum order. If it does not sell, a big quantity is a fake discount.
2) Do not reorder losers or stagnant items. Clear them first.
3) Restock winners carefully (for example +20% of last month’s pace), not a random doubling.
4) Purchase price is part of margin. If cost rises and you cannot raise the sell price, margin squeezes — review price before you order.
5) Diversify a supplier if one SKU can stop the shop, but do not add new SKUs before profit is proven.

From the file we can say “buy this / do not buy that” by turn and profit. Ask: what should I buy first?`,
  },
  books: {
    ar: `كتب مفيدة لتاجر يعتمد على ملف مبيعات ومصروف (مو روايات تحفيز فارغة):

1) Profit First — مايك ميكالوفيتش
   يعلّمك تفصلي الربح من الصندوق قبل ما يختفي في المصروف. قريب جداً من فكرة الربح الحقيقي مقابل الوهمي.

2) The E-Myth Revisited — مايكل غيربر
   ليش المحل يتعلق فيكِ شخصياً، وكيف تخليه نظام (سعر، مخزون، سجل) مش بطولة يومية.

3) Influence — روبرت سيالديني
   أدوات الإقناع في العرض والبيع: ندرة، إثبات اجتماعي، التزام — بلا لفّ تسويقي فاضي.

4) Contagious — جوناه بيرغر
   ليش منتج ينتشر بالكلام والستوري، وكيف تختاري «البطل» اللي يستحق الإعلان.

5) Building a StoryBrand — دونالد ميلر
   الزبون هو البطل، المنتج أداة. يفيد صياغة العرض على الرف وفي الإعلان.

6) أب غني أب فقير — روبرت كيوساكي
   مدخل بسيط للفرق بين الأصل الذي يدرّ نقداً والمصروف الذي يلبسه المحل. ليس كتاب محاسبة، لكنه يوضح ليش التكديس مش ثروة.

ابدئي بـ Profit First ثم E-Myth. الباقي للتسويق والعرض.
اسألي بعدها: بدي خطة تسويقية — ونربط الكتب بأصناف ملفك.`,
    en: `Useful books for a merchant who runs on a sales-and-cost file (not empty motivational novels):

1) Profit First — Mike Michalowicz
   Take profit out of the till before expenses swallow it. Closest to real vs phantom profit.

2) The E-Myth Revisited — Michael Gerber
   Why the shop depends on you personally, and how to turn price, stock, and the ledger into a system.

3) Influence — Robert Cialdini
   How offers actually persuade: scarcity, social proof, commitment — without fluffy marketing.

4) Contagious — Jonah Berger
   Why an item spreads by word of mouth or stories, and how to pick a hero SKU worth advertising.

5) Building a StoryBrand — Donald Miller
   The customer is the hero; the product is the tool. Helps shelf copy and ads.

6) Rich Dad Poor Dad — Robert Kiyosaki
   A simple split between an asset that throws off cash and an expense the shop wears. Not accounting, but it explains why stacking stock is not wealth.

Start with Profit First, then E-Myth. The rest is offer and marketing.
Then ask for a marketing plan so we tie the books to your SKUs.`,
  },
};

export function answerKnowledge(
  topic: KnowledgeTopic,
  locale: Locale,
  result?: AnalysisResult | null,
  currency: CurrencyCode = "SAR",
): string {
  const en = locale === "en";
  const body = LESSONS[topic][en ? "en" : "ar"];
  return `${body}${fileNote(result, currency, en)}`;
}
