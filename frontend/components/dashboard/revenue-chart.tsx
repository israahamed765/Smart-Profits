"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useChartTheme } from "@/frontend/components/charts/use-chart-theme";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { convertAmount, currencySuffix } from "@/frontend/lib/format";

function formatAxis(value: number) {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
}

export function RevenueExpenseChart() {
  const { result, currency } = useAnalysis();
  const { t, months } = useAppearance();
  const palette = useChartTheme();
  if (!result) return null;

  const data = result.monthlySeries.map((point) => ({
    name: months[point.month] ?? point.label.replace(/ \d{4}$/, ""),
    revenue: Math.round(convertAmount(point.revenue, currency)),
    expenses: Math.round(convertAmount(point.expenses, currency)),
  }));
  const suffix = currencySuffix(currency);
  const useBars = data.length <= 2;

  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>{t("chart.revVsExp")}</CardTitle>
          <p className="mt-1 text-xs leading-5 text-muted">
            {t("chart.revVsExp.hint")}
            {data.length === 1 ? ` ${t("chart.oneMonth")}.` : ""}
          </p>
        </div>
      </CardHeader>
      <CardContent className="h-[220px] min-w-0 sm:h-[260px] lg:h-[300px]" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          {useBars ? (
            <BarChart data={data} barGap={8}>
              <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: palette.tick, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: palette.tick, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatAxis}
              />
              <Tooltip
                contentStyle={palette.tooltipStyle}
                formatter={(value, name) => [
                  `${Number(value).toLocaleString("en-US")} ${suffix}`,
                  name === "revenue" ? t("chart.rev") : t("chart.exp"),
                ]}
              />
              <Legend
                formatter={(value) => (value === "revenue" ? t("chart.rev") : t("chart.exp"))}
                wrapperStyle={{ color: palette.tick, fontSize: 12 }}
              />
              <Bar dataKey="revenue" fill={palette.revenue} radius={[8, 8, 0, 0]} maxBarSize={56} />
              <Bar dataKey="expenses" fill={palette.expenses} radius={[8, 8, 0, 0]} maxBarSize={56} />
            </BarChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fill: palette.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: palette.tick, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatAxis}
              />
              <Tooltip
                contentStyle={palette.tooltipStyle}
                formatter={(value, name) => [
                  `${Number(value).toLocaleString("en-US")} ${suffix}`,
                  name === "revenue" ? t("chart.rev") : t("chart.exp"),
                ]}
              />
              <Legend
                formatter={(value) => (value === "revenue" ? t("chart.rev") : t("chart.exp"))}
                wrapperStyle={{ color: palette.tick, fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke={palette.revenue}
                strokeWidth={3}
                dot={{ r: 4, fill: palette.revenue, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="expenses"
                stroke={palette.expenses}
                strokeWidth={2}
                strokeDasharray="6 6"
                dot={{ r: 3, fill: palette.expenses, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
