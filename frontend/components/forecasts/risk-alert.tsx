"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card } from "@/frontend/components/ui/card";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { formatMoney } from "@/frontend/lib/format";
import { localizeAlert } from "@/frontend/lib/localize-advisor";
import { cn } from "@/frontend/ui/cn";

export function RiskAlertCard() {
  const { result, currency } = useAnalysis();
  const { t } = useAppearance();
  if (!result) return null;
  const alert = result.forecast.alerts[0];
  if (!alert) return null;

  const high = alert.severity === "high";
  const positive = alert.severity === "positive";
  const amount = alert.id === "loss-next-month" ? formatMoney(alert.value ?? Math.abs(result.forecast.nextMonthProfit), currency) : "";
  const copy = localizeAlert(alert, amount, t);

  return (
    <Card
      className={cn(
        "p-5",
        high && "border-red-500/40 bg-red-500/8",
        positive && "border-accent/40 bg-accent/8",
        !high && !positive && "border-amber-500/30 bg-amber-500/8",
      )}
    >
      <div className="flex items-start gap-3">
        {positive ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-accent" />
        ) : (
          <AlertTriangle className={cn("mt-0.5 h-5 w-5", high ? "text-red-400" : "text-amber-400")} />
        )}
        <div>
          <h3 className={cn("font-semibold", high ? "text-red-300" : positive ? "text-accent" : "text-amber-300")}>
            {copy.title}
          </h3>
          <p className="mt-2 text-sm leading-7 text-slate-200">{copy.message}</p>
          <p className="mt-2 text-sm text-slate-400">{copy.recommendation}</p>
        </div>
      </div>
    </Card>
  );
}
