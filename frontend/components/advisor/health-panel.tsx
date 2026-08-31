"use client";

import { Activity, Stethoscope } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { HealthRing } from "@/frontend/components/dashboard/kpi-cards";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { healthHeadline, localizeFinding } from "@/frontend/lib/localize-advisor";
import { cn } from "@/frontend/ui/cn";

const TONE = {
  good: "text-accent",
  warn: "text-amber-300",
  bad: "text-red-300",
};

export function HealthPanel() {
  const { result } = useAnalysis();
  const { t } = useAppearance();
  if (!result) return null;
  const { health } = result.advisor;
  const catalog = result.productHighlights.catalog ?? [];
  const headline = healthHeadline(health.daysUntilProblem, t);
  const label =
    health.label === "ممتاز"
      ? t("kpi.health.excellent")
      : health.label === "جيد جداً"
        ? t("kpi.health.vgood")
        : health.label === "متوسط"
          ? t("kpi.health.ok")
          : health.label === "ضعيف"
            ? t("kpi.health.weak")
            : health.label === "حرج"
              ? t("kpi.health.critical")
              : health.label;

  return (
    <Card className="border-accent/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-accent" />
          {t("ui.doctor")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-5">
          <HealthRing score={health.score} label={label} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">{t("kpi.health")}</p>
            <p className="text-2xl font-bold text-foreground sm:text-3xl">{health.score}/100</p>
            <p className="mt-2 text-sm leading-7 text-slate-200">{headline}</p>
          </div>
        </div>
        <div className="space-y-2">
          {health.findings.map((finding) => {
            const copy = localizeFinding(finding, result.kpis, catalog, t);
            return (
            <div key={finding.id} className="rounded-xl border border-border bg-white/3 p-3">
              <p className={cn("text-sm font-semibold", TONE[finding.tone])}>{copy.title}</p>
              <p className="mt-1 text-sm leading-6 text-slate-300">{copy.detail}</p>
            </div>
            );
          })}
        </div>
        {health.daysUntilProblem != null && health.daysUntilProblem > 0 && (
          <p className="flex items-center gap-2 text-xs text-amber-200">
            <Activity className="h-3.5 w-3.5" />
            {t("ui.window").replace("{n}", String(health.daysUntilProblem))}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
