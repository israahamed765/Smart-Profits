"use client";

import { Radar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { localizeRisk } from "@/frontend/lib/localize-advisor";

const TONE = {
  high: "danger" as const,
  medium: "warning" as const,
  low: "info" as const,
  good: "success" as const,
};

export function RiskRadar() {
  const { result } = useAnalysis();
  const { t } = useAppearance();
  if (!result) return null;
  const catalog = result.productHighlights.catalog ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-red-300" />
          {t("ui.radar")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {result.advisor.risks.map((risk) => {
          const copy = localizeRisk(risk, result.kpis, catalog, t, result.forecast.willLoseNextMonth);
          return (
            <div key={risk.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{copy.label}</p>
                <p className="text-xs text-muted">{copy.reason}</p>
              </div>
              <Badge tone={TONE[risk.level]}>{copy.level}</Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
