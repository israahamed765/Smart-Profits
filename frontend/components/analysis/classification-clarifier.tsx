"use client";

import { HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import { Card } from "@/frontend/components/ui/card";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { formatMoney } from "@/frontend/lib/format";

function fill(template: string, vars: Record<string, string | number>) {
  return Object.entries(vars).reduce((text, [key, value]) => text.split(`{${key}}`).join(String(value)), template);
}

export function ClassificationClarifier() {
  const { result, currency, resolveClassification, isDemo } = useAnalysis();
  const { t } = useAppearance();
  const pending = result?.pendingClassifications ?? [];
  const current = pending[0];

  if (isDemo || !current) return null;

  function choose(side: "revenue" | "opex") {
    resolveClassification(current.key, side);
    toast.success(t("hitl.learned"));
  }

  return (
    <div className="px-3 pt-3 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6">
      <Card className="border-amber-400/40 bg-amber-400/8 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-200">
            <HelpCircle className="h-5 w-5" />
            <p className="text-sm font-semibold">{t("hitl.title")}</p>
          </div>
          <p className="text-xs text-muted">
            {fill(t("hitl.progress"), { current: 1, total: pending.length })}
          </p>
        </div>
        <p className="mt-3 text-base leading-8 text-foreground">
          {fill(t("hitl.prompt"), {
            item: current.term,
            amount: formatMoney(current.amount, currency),
          })}
        </p>
        <p className="mt-1 text-sm text-muted">
          {fill(t("hitl.held"), { score: current.confidence.toFixed(2) })}
          {current.count > 1 ? ` · ${fill(t("hitl.rows"), { count: current.count })}` : ""}
          {current.sheet ? ` · ${current.sheet}` : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => choose("opex")}>
            {t("hitl.expense")}
          </Button>
          <Button variant="accent" onClick={() => choose("revenue")}>
            {t("hitl.sales")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
