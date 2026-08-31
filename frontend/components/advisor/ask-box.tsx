"use client";

import { useState } from "react";
import { Bot, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { runFinancialAgent, type AgentToolCall } from "@/frontend/lib/financial-agent";

const HINTS = {
  ar: [
    "معلومات عن الربح",
    "كتب للتجارة",
    "نصائح تسوّق",
    "قواعد الشراء",
    "مين أعلى منتج ربح؟",
    "بدي خطة تسويقية",
    "أطلع لي الخسائر فقط",
    "المنتج الأكثر مبيعاً؟",
    "كميات البيع للمنتجات اللي عرضتها؟",
    "شو أشتري أول؟",
    "وين تسريب الربح؟",
    "شو أعمل اليوم؟",
    "مبيعات شهر يناير؟",
    "حلّل منتج سماعات لاسلكية",
  ],
  en: [
    "How does profit work?",
    "Books for merchants",
    "Shopping tips",
    "Purchasing rules",
    "What is the highest profit product?",
    "Give me a marketing plan",
    "Show me the losses only",
    "What is the best seller?",
    "Sales quantities for those products?",
    "What should I buy first?",
    "Where is the profit leak?",
    "What should I do today?",
    "January sales?",
    "Analyze wireless headphones",
  ],
} as const;

interface ChatTurn {
  id: string;
  q: string;
  a: string;
  tools: AgentToolCall[];
  status: "calling" | "done";
}

export function AdvisorAskBox({ chat = false }: { chat?: boolean }) {
  const { result, currency, parseResult, settings, taxonomy, scope, setScope } = useAnalysis();
  const { t, locale } = useAppearance();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const hints = HINTS[locale];

  function ask(next = question) {
    const text = next.trim();
    if (!text) return;
    const lastDone = [...turns].reverse().find((turn) => turn.status === "done");
    const agent = runFinancialAgent({
      question: text,
      result,
      parseResult,
      settings,
      taxonomy,
      scope,
      locale,
      currency,
      previousQuestion: lastDone?.q,
      previousAnswer: lastDone?.a,
      needFileMessage: t("advisor.chat.needFile"),
    });
    if (agent.scopeChanged) setScope(agent.nextScope);

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setTurns((prev) => [...prev, { id, q: text, a: "", tools: agent.tools, status: "calling" }]);
    setQuestion("");

    window.setTimeout(() => {
      setTurns((prev) =>
        prev.map((turn) => (turn.id === id ? { ...turn, a: agent.answer, status: "done" } : turn)),
      );
    }, 280);
  }

  return (
    <Card className={chat ? "flex min-h-[min(28rem,70dvh)] flex-col lg:min-h-[520px]" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          {t("advisor.chat.title")}
        </CardTitle>
        {result?.fileName && (
          <p className="text-xs text-muted">
            {t("advisor.chat.from")}: {result.fileName}
          </p>
        )}
      </CardHeader>
      <CardContent className={chat ? "flex flex-1 flex-col gap-3" : "space-y-3"}>
        <div className="flex flex-wrap gap-2">
          {hints.map((hint) => (
            <button
              key={hint}
              type="button"
              className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
              onClick={() => ask(hint)}
            >
              {hint}
            </button>
          ))}
        </div>

        <div className={chat ? "min-h-0 flex-1 space-y-3 overflow-y-auto" : "space-y-3"}>
          {turns.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm leading-7 text-muted">
              {t("advisor.chat.empty")}
            </p>
          )}
          {turns.map((turn) => (
            <div key={turn.id} className="space-y-2">
              <p className="rounded-2xl bg-primary/15 px-4 py-2 text-sm text-foreground whitespace-pre-wrap">{turn.q}</p>
              <div className="space-y-2 rounded-2xl border border-border bg-black/[0.03] px-4 py-3 dark:bg-white/3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  {turn.status === "calling" ? t("advisor.chat.calling") : t("advisor.chat.used")}
                </p>
                <ul className="space-y-1">
                  {turn.tools.map((tool) => (
                    <li key={tool.id} className="text-xs leading-6 text-muted">
                      {locale === "en" ? tool.labelEn : tool.labelAr}
                    </li>
                  ))}
                </ul>
                {turn.status === "done" && (
                  <p className="text-sm leading-7 text-foreground whitespace-pre-wrap">{turn.a}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t("advisor.chat.placeholder")}
            onKeyDown={(event) => {
              if (event.key === "Enter") ask();
            }}
          />
          <Button className="w-full sm:w-auto" onClick={() => ask()}>
            <Send className="h-4 w-4" />
            {t("advisor.chat.send")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
