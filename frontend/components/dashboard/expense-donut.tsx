"use client";

import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";
import { useChartTheme } from "@/frontend/components/charts/use-chart-theme";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { formatMoney } from "@/frontend/lib/format";

const SLICE_LABELS: Record<string, string> = {
  "تكلفة المبيعات / خامات": "chart.slice.cogs",
  الإيجار: "chart.slice.rent",
  الرواتب: "chart.slice.salaries",
  "فواتير وخدمات": "chart.slice.utilities",
  "تسويق وتشغيل": "chart.slice.opex",
  "تالف وهالك": "chart.slice.waste",
  "مصروفات غير مصنّفة": "chart.slice.other",
};

export function ExpenseDonut() {
  const { result, currency } = useAnalysis();
  const { t } = useAppearance();
  const palette = useChartTheme();
  if (!result) return null;

  const data = result.expenseBreakdown;
  const total = data.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("chart.expClass")}</CardTitle>
      </CardHeader>
      <CardContent>
        {total <= 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-2 text-center sm:min-h-[280px]">
            <div className="flex h-28 w-28 items-center justify-center rounded-full border-8 border-dashed border-border">
              <span className="text-sm font-semibold text-muted">0</span>
            </div>
            <p className="max-w-xs text-sm leading-6 text-muted">{t("chart.expEmpty")}</p>
            <Link href="/settings">
              <Button variant="outline" className="mt-1">
                {t("chart.expEmptyCta")}
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="relative mx-auto h-[min(210px,70vw)] w-[min(210px,70vw)]" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="value" innerRadius={62} outerRadius={88} paddingAngle={3}>
                    {data.map((slice) => (
                      <Cell key={slice.name} fill={slice.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={palette.tooltipStyle}
                    formatter={(value, name) => [
                      formatMoney(Number(value), currency),
                      SLICE_LABELS[String(name)] ? t(SLICE_LABELS[String(name)]) : String(name),
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted">{t("chart.total")}</span>
                <span className="text-lg font-bold text-foreground">
                  {formatMoney(total, currency, { compact: true })}
                </span>
              </div>
            </div>
            <ul className="mt-2 space-y-2">
              {data.map((slice) => (
                <li key={slice.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-foreground">
                    <i className="h-2.5 w-2.5 rounded-full" style={{ background: slice.color }} />
                    {SLICE_LABELS[slice.name] ? t(SLICE_LABELS[slice.name]) : slice.name}
                  </span>
                  <span className="text-muted">{formatMoney(slice.value, currency, { compact: true })}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
