import { answerKnowledge, detectKnowledgeTopic } from "@/frontend/lib/advisor-knowledge";
import {
  resultForQuestion,
  runAdvisorAgent,
  type AdvisorToolId,
} from "@/frontend/lib/qa";
import type { Locale } from "@/frontend/lib/i18n";
import { scopeFromQuestion, type AnalysisScope } from "@/lib/scope";
import type { AnalysisResult, AppSettings, CurrencyCode, ParseResult, TaxonomyMap } from "@/lib/types";

export type { AdvisorToolId };

export type AgentToolCall = {
  id: AdvisorToolId;
  labelAr: string;
  labelEn: string;
};

export type FinancialAgentInput = {
  question: string;
  result: AnalysisResult | null;
  parseResult: ParseResult | null | undefined;
  settings: AppSettings;
  taxonomy: TaxonomyMap | undefined;
  scope: AnalysisScope;
  locale: Locale;
  currency: CurrencyCode;
  previousQuestion?: string;
  previousAnswer?: string;
  needFileMessage: string;
};

export type FinancialAgentTurn = {
  answer: string;
  tools: AgentToolCall[];
  nextScope: AnalysisScope;
  scopeChanged: boolean;
};

const TOOL_LABELS: Record<AdvisorToolId, { ar: string; en: string }> = {
  need_file: {
    ar: "الوكيل يحتاج ملفاً مفتوحاً قبل تحليل الأرقام",
    en: "The agent needs an open file before analyzing numbers",
  },
  lessons: {
    ar: "استدعاء قاعدة الدروس وخطط التجارة والتسويق",
    en: "Calling merchant lessons and marketing playbooks",
  },
  file_scope: {
    ar: "فرز أرقام الملف حسب الشهر أو الصنف المطلوب",
    en: "Scoping the workbook by the requested month or product",
  },
  file_leaks: {
    ar: "تحليل الخسائر والتسريب من ملف المبيعات",
    en: "Analyzing losses and leaks from the sales file",
  },
  file_rank: {
    ar: "ترتيب الأصناف من الملف المفتوح",
    en: "Ranking products from the open file",
  },
  file_qty: {
    ar: "استخراج كميات البيع من الملف المفتوح",
    en: "Reading sales quantities from the open file",
  },
  file_expenses: {
    ar: "قراءة بنود المصاريف من الملف",
    en: "Reading expense lines from the file",
  },
  file_totals: {
    ar: "حساب الإجماليات من محرك أرقام الملف",
    en: "Computing totals from the file engine",
  },
  file_health: {
    ar: "تشخيص صحة المتجر من الملف المفتوح",
    en: "Diagnosing store health from the open file",
  },
  file_today: {
    ar: "استخراج قرار اليوم من تحليل الملف",
    en: "Reading today's action from the file analysis",
  },
  file_inventory: {
    ar: "قرار الشراء من دوران أصناف الملف",
    en: "Buy / don't-buy from this file's stock signals",
  },
  file_forecast: {
    ar: "توقعات الربح من سلسلة الملف",
    en: "Profit forecast from this file's series",
  },
  file_shipping: {
    ar: "قراءة بند الشحن من الملف",
    en: "Reading the shipping line from the file",
  },
  file_how: {
    ar: "شرح معادلة صافي الربح بأرقام الملف",
    en: "Explaining net profit with this file's figures",
  },
  file_why: {
    ar: "تفسير تغيّر الربح من أرقام الملف",
    en: "Explaining the profit change from this file",
  },
  marketing_plan: {
    ar: "ربط خطة التسويق بأصناف الملف المفتوح",
    en: "Grounding the marketing plan in this file's SKUs",
  },
  file_overview: {
    ar: "نظرة عامة من محرك أرقام الملف",
    en: "File-engine overview of the open workbook",
  },
};

export function describeAgentTool(id: AdvisorToolId): AgentToolCall {
  const labels = TOOL_LABELS[id];
  return { id, labelAr: labels.ar, labelEn: labels.en };
}

function named(ids: AdvisorToolId[]): AgentToolCall[] {
  const seen = new Set<AdvisorToolId>();
  const tools: AgentToolCall[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    tools.push(describeAgentTool(id));
  }
  return tools;
}

/**
 * Local financial agent: pick tools, then answer from the existing file engine.
 * No LLM. Numbers cannot be invented.
 */
export function runFinancialAgent(input: FinancialAgentInput): FinancialAgentTurn {
  const question = input.question.trim();
  const nextScope = input.parseResult
    ? scopeFromQuestion(question, input.parseResult.transactions, input.scope)
    : input.scope;
  const scopeChanged =
    nextScope.monthKey !== input.scope.monthKey ||
    nextScope.product !== input.scope.product ||
    nextScope.sheet !== input.scope.sheet;

  if (!input.result) {
    const topic = detectKnowledgeTopic(question);
    if (topic) {
      return {
        answer: answerKnowledge(topic, input.locale),
        tools: named(["lessons"]),
        nextScope,
        scopeChanged: false,
      };
    }
    return {
      answer: input.needFileMessage,
      tools: named(["need_file"]),
      nextScope,
      scopeChanged: false,
    };
  }

  const scoped =
    resultForQuestion(question, input.parseResult, input.settings, input.taxonomy, input.result, nextScope) ??
    input.result;
  const inner = runAdvisorAgent(question, scoped, {
    locale: input.locale,
    currency: input.currency,
    previousQuestion: input.previousQuestion,
    previousAnswer: input.previousAnswer,
  });
  const toolIds: AdvisorToolId[] = scopeChanged ? ["file_scope", ...inner.tools] : inner.tools;

  return {
    answer: inner.answer,
    tools: named(toolIds),
    nextScope,
    scopeChanged,
  };
}
