"use client";

import Link from "next/link";
import { ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { localizeAction } from "@/frontend/lib/localize-advisor";
import { cn } from "@/frontend/ui/cn";

const PRIORITY = {
  high: "border-red-500/30 bg-red-500/8",
  medium: "border-amber-500/30 bg-amber-500/8",
  low: "border-accent/30 bg-accent/8",
};

export function TodayActions() {
  const { result } = useAnalysis();
  const { t } = useAppearance();
  if (!result) return null;
  const actions = result.advisor.todayActions;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          {t("ui.today")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted">{t("ui.todayHint")}</p>
        {actions.map((action, index) => {
          const copy = localizeAction(action, result.advisor, t);
          return (
          <div key={action.id} className={cn("rounded-xl border p-4", PRIORITY[action.priority])}>
            <p className="text-sm font-semibold text-foreground">
              {index + 1}. {copy.title}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{copy.reason}</p>
            <Link href={action.href}>
              <Button size="sm" variant="outline" className="mt-3">
                {t("ui.do")}
              </Button>
            </Link>
          </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
