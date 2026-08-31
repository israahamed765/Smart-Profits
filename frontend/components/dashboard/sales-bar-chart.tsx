"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/frontend/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useChartTheme } from "@/frontend/components/charts/use-chart-theme";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { convertAmount, currencySuffix } from "@/frontend/lib/format";

export function SalesBarChart() {
  const { result, currency } = useAnalysis();
  const { t, months } = useAppearance();
  const palette = useChartTheme();
  if (!result) return null;

  const history = result.monthlySeries.map((point) => ({
    name: months[point.month] ?? point.label.replace(/ \d{4}$/, ""),
    sales: Math.round(convertAmount(point.revenue, currency)),
    expenses: Math.round(convertAmount(point.expenses, currency)),
  }));

  const next = result.forecast.series.find((p) => p.isForecast);
  if (next) {
    const [, month] = next.key.split("-").map(Number);
    history.push({
      name: `${months[(month || 1) - 1] ?? next.label} (${t("chart.forecast")})`,
      sales: Math.round(convertAmount(next.predictedRevenue ?? 0, currency)),
      expenses: Math.round(convertAmount(next.predictedExpenses ?? 0, currency)),
    });
  }

  const suffix = currencySuffix(currency);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t("chart.revVsExp")}</CardTitle>
        <Badge tone="info">{t("chart.forecast")}</Badge>
      </CardHeader>
      <CardContent className="h-[280px]" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={history}>
            <CartesianGrid stroke={palette.grid} vertical={false} />
            <XAxis dataKey="name" tick={{ fill: palette.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: palette.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={palette.tooltipStyle}
              formatter={(value, name) => [
                `${Number(value).toLocaleString("en-US")} ${suffix}`,
                name === "sales" ? t("chart.rev") : t("chart.exp"),
              ]}
            />
            <Legend
              formatter={(value) => (value === "sales" ? t("chart.rev") : t("chart.exp"))}
              wrapperStyle={{ color: palette.tick, fontSize: 12 }}
            />
            <Bar dataKey="sales" fill={palette.revenue} radius={[6, 6, 0, 0]} />
            <Bar dataKey="expenses" fill={palette.expenses} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
