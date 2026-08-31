"use client";

import { CalendarRange } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { formatMoney } from "@/frontend/lib/format";
import { cn } from "@/frontend/ui/cn";

export function MonthCompare() {
  const { result, currency } = useAnalysis();
  const { t, months } = useAppearance();
  if (!result) return null;
  const points = result.monthlySeries;
  if (points.length < 2) return null;

  const ranked = [...points].sort((a, b) => b.netProfit - a.netProfit);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  function periodLabel(year: number, month: number) {
    return `${months[month]} ${year}`;
  }

  function reason(index: number) {
    const current = points[index];
    const previous = index > 0 ? points[index - 1] : null;
    if (!previous) return t("ui.month.first");
    const rev = current.revenue - previous.revenue;
    const cost = current.expenses - previous.expenses;
    if (cost > 0 && cost >= Math.abs(rev)) return t("ui.month.cost");
    if (rev < 0) return t("ui.month.drop");
    if (rev > 0 && current.netProfit > previous.netProfit) return t("ui.month.up");
    return t("ui.month.mix");
  }

  const bestIdx = points.findIndex((point) => point.key === best.key);
  const worstIdx = points.findIndex((point) => point.key === worst.key);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" />
          {t("ui.months")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-accent/30 bg-accent/8 p-4">
            <p className="text-xs text-muted">{t("ui.mostProfit")}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{periodLabel(best.year, best.month)}</p>
            <p className="mt-1 text-sm text-accent">{formatMoney(best.netProfit, currency)}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{reason(bestIdx)}</p>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/8 p-4">
            <p className="text-xs text-muted">{t("ui.leastProfit")}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{periodLabel(worst.year, worst.month)}</p>
            <p className="mt-1 text-sm text-red-300">{formatMoney(worst.netProfit, currency)}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{reason(worstIdx)}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th className="px-2 py-2 text-start font-medium">{t("ui.period")}</th>
                <th className="px-2 py-2 text-start font-medium">{t("ui.sales")}</th>
                <th className="px-2 py-2 text-start font-medium">{t("ui.exp")}</th>
                <th className="px-2 py-2 text-start font-medium">{t("kpi.profit")}</th>
                <th className="px-2 py-2 text-start font-medium">{t("ui.change")}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point, index) => {
                const prev = index > 0 ? points[index - 1] : null;
                const delta = prev ? point.netProfit - prev.netProfit : 0;
                return (
                  <tr key={point.key} className="border-b border-border/70">
                    <td className="px-2 py-2 text-foreground">{periodLabel(point.year, point.month)}</td>
                    <td className="px-2 py-2 text-slate-300">{formatMoney(point.revenue, currency)}</td>
                    <td className="px-2 py-2 text-slate-300">{formatMoney(point.expenses, currency)}</td>
                    <td className="px-2 py-2 text-foreground">{formatMoney(point.netProfit, currency)}</td>
                    <td className={cn("px-2 py-2", !prev ? "text-muted" : delta >= 0 ? "text-accent" : "text-danger")}>
                      {!prev ? "—" : `${delta >= 0 ? "+" : ""}${formatMoney(delta, currency)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
