import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFullAnalysis } from "@/lib/analytics";
import { EMPTY_SCOPE } from "@/lib/scope";
import { answerMerchantQuestion } from "@/frontend/lib/qa";
import { runFinancialAgent } from "@/frontend/lib/financial-agent";
import { parseResultFromTx, saleTx, zeroOpexSettings } from "./helpers";

const parsed = parseResultFromTx([
  saleTx({ date: new Date("2026-01-12"), product: "Chair", quantity: 10, sellingPrice: 200, costPrice: 80 }),
  saleTx({ date: new Date("2026-01-18"), product: "Lamp", quantity: 4, sellingPrice: 50, costPrice: 60 }),
  saleTx({ date: new Date("2026-02-08"), product: "Chair", quantity: 3, sellingPrice: 200, costPrice: 80 }),
]);
const result = runFullAnalysis(parsed, zeroOpexSettings);

function ask(question: string, extras?: { result?: typeof result | null; previousQuestion?: string; previousAnswer?: string }) {
  return runFinancialAgent({
    question,
    result: extras && "result" in extras ? extras.result ?? null : result,
    parseResult: parsed,
    settings: zeroOpexSettings,
    taxonomy: {},
    scope: EMPTY_SCOPE,
    locale: "ar",
    currency: "SAR",
    previousQuestion: extras?.previousQuestion,
    previousAnswer: extras?.previousAnswer,
    needFileMessage: "ارفع ملفاً أولاً.",
  });
}

describe("financial agent (local tools, no LLM)", () => {
  it("keeps the same numbers as the file Q&A engine", () => {
    const question = "مين أعلى منتج ربح؟";
    const turn = ask(question);
    assert.equal(turn.answer, answerMerchantQuestion(question, result, { locale: "ar", currency: "SAR" }));
    assert.match(turn.answer, /Chair/);
  });

  it("calls the ranking tool for highest-profit questions", () => {
    const turn = ask("مين أعلى منتج ربح؟");
    assert.deepEqual(
      turn.tools.map((tool) => tool.id),
      ["file_rank"],
    );
    assert.match(turn.tools[0].labelAr, /ترتيب الأصناف/);
  });

  it("calls the loss tool for losses and leaks", () => {
    const losses = ask("أطلع لي الخسائر فقط");
    assert.ok(losses.tools.some((tool) => tool.id === "file_leaks"));
    assert.match(losses.tools.find((tool) => tool.id === "file_leaks")!.labelAr, /الخسائر والتسريب/);

    const leak = ask("وين تسريب الربح؟");
    assert.ok(leak.tools.some((tool) => tool.id === "file_leaks"));
  });

  it("scopes January then ranks from that month's rows", () => {
    const turn = ask("مبيعات شهر يناير؟");
    assert.equal(turn.scopeChanged, true);
    assert.ok(turn.nextScope.monthKey);
    assert.ok(turn.tools.map((tool) => tool.id).includes("file_scope"));
    assert.match(turn.tools[0].labelAr, /فرز أرقام الملف/);
  });

  it("grounds marketing advice in the open file tool", () => {
    const turn = ask("بدي خطة تسويقية");
    assert.deepEqual(
      turn.tools.map((tool) => tool.id),
      ["marketing_plan"],
    );
    assert.match(turn.answer, /Chair|Lamp|الملف/);
  });

  it("calls the lesson tool for general commerce advice without inventing SKUs", () => {
    const turn = ask("نصائح تسوّق", { result: null });
    assert.deepEqual(
      turn.tools.map((tool) => tool.id),
      ["lessons"],
    );
    assert.doesNotMatch(turn.answer, /Chair/);
  });

  it("answers in English when UI locale is en (no Arabic engine strings)", () => {
    const turn = runFinancialAgent({
      question: "Where is the profit leak?",
      result,
      parseResult: parsed,
      settings: zeroOpexSettings,
      taxonomy: {},
      scope: EMPTY_SCOPE,
      locale: "en",
      currency: "SAR",
      needFileMessage: "Upload a file first.",
    });
    assert.ok(turn.tools.some((tool) => tool.id === "file_leaks"));
    assert.match(turn.answer, /Leak|No clear profit leak|thin margin|below cost|Cost is far/i);
    assert.doesNotMatch(turn.answer, /تسريب|مبيعات عالية لكن|يبيع تحت التكلفة|التكلفة مرتفعة/);
  });

  it("keeps English for health when locale is en", () => {
    const turn = runFinancialAgent({
      question: "How is my store health?",
      result,
      parseResult: parsed,
      settings: zeroOpexSettings,
      taxonomy: {},
      scope: EMPTY_SCOPE,
      locale: "en",
      currency: "SAR",
      needFileMessage: "Upload a file first.",
    });
    assert.ok(turn.tools.some((tool) => tool.id === "file_health"));
    assert.match(turn.answer, /Store health/i);
    assert.doesNotMatch(turn.answer, /صحة المتجر|المبيعات جيدة|ممتاز|جيد جداً/);
  });
});
