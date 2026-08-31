"use client";

import { GitBranch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { formatMoney } from "@/frontend/lib/format";

export function ProfitScenariosCard() {
  const { result, currency } = useAnalysis();
  const { t } = useAppearance();
  if (!result) return null;
  const { scenarios } = result.advisor;

  const items = [
    { key: "worst", label: t("sim.worst"), tone: "text-red-300", point: scenarios.worst },
    { key: "expected", label: t("sim.expected"), tone: "text-amber-200", point: scenarios.expected },
    { key: "best", label: t("sim.best"), tone: "text-accent", point: scenarios.best },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          {t("sim.scenarios")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.key} className="rounded-xl border border-border bg-white/3 p-4">
            <p className="text-xs text-muted">{item.label}</p>
            <p className={`mt-2 text-xl font-bold ${item.tone}`}>{formatMoney(item.point.profit, currency)}</p>
            <p className="mt-1 text-xs text-slate-400">
              {t("ui.sales")} {formatMoney(item.point.revenue, currency)}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
