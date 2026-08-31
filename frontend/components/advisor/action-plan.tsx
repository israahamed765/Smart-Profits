"use client";

import { CalendarRange } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { localizePlanTask } from "@/frontend/lib/localize-advisor";

export function ActionPlan() {
  const { result } = useAnalysis();
  const { t } = useAppearance();
  if (!result) return null;
  const weekTitle = ["", t("ui.plan.1"), t("ui.plan.2"), t("ui.plan.3"), t("ui.plan.4")];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-accent" />
          {t("ui.plan30")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {result.advisor.plan.map((week) => (
          <div key={week.week} className="rounded-xl border border-border p-4">
            <p className="text-sm font-semibold text-foreground">
              {t("ui.week").replace("{n}", String(week.week))} — {weekTitle[week.week] || week.title}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-300">
              {week.tasks.map((task) => (
                <li key={task}>• {localizePlanTask(task, t)}</li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
