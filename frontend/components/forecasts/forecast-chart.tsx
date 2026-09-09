"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/frontend/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useChartTheme } from "@/frontend/components/charts/use-chart-theme";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { convertAmount, currencySuffix } from "@/frontend/lib/format";

function formatAxis(value: number) {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
}

export function ForecastChart() {
  const { result, currency } = useAnalysis();
  const { t, months, locale } = useAppearance();
  const palette = useChartTheme();
  if (!result) return null;

  const series = result.forecast.series.filter((point) => {
    const year = Number(point.key.split("-")[0]);
    return year >= 2000 && year <= 2100;
  });
  const lastActualIndex = series.reduce((acc, point, index) => (point.isForecast ? acc : index), -1);

  const years = new Set(series.map((point) => point.key.slice(0, 4)));
  const showYear = years.size > 1;

  const data = series.map((point, index) => {
    const [year, month] = point.key.split("-").map(Number);
    const monthName = months[(month || 1) - 1] ?? point.label.replace(/ \d{4}$/, "");
    const label = `${monthName}${showYear ? ` ${year}` : ""}${point.isForecast ? ` · ${t("chart.forecast")}` : ""}`;
    const value = Math.round(convertAmount((point.predictedRevenue ?? point.actualRevenue) ?? 0, currency));
    return {
      name: label,
      actual: point.isForecast ? undefined : value,
      forecast: point.isForecast || index === lastActualIndex ? value : undefined,
    };
  });

  const suffix = currencySuffix(currency, locale);

  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>{t("chart.forecastTitle")}</CardTitle>
          <p className="mt-1 text-xs leading-5 text-muted">{t("chart.forecastHint")}</p>
        </div>
        <Badge tone="info">{t("chart.forecast")}</Badge>
      </CardHeader>
      <CardContent className="h-[220px] min-w-0 sm:h-[280px] lg:h-[320px]" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              tick={{ fill: palette.tick, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={data.length > 6 ? -25 : 0}
              textAnchor={data.length > 6 ? "end" : "middle"}
              height={data.length > 6 ? 58 : 30}
            />
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
                name === "actual" ? t("chart.actual") : t("chart.forecast"),
              ]}
            />
            <Legend
              formatter={(value) => (value === "actual" ? t("chart.actual") : t("chart.forecast"))}
              wrapperStyle={{ color: palette.tick, fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke={palette.revenue}
              strokeWidth={3}
              connectNulls={false}
              dot={{ r: 5, fill: palette.revenue, strokeWidth: 0 }}
              activeDot={{ r: 7 }}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke={palette.forecast}
              strokeWidth={3}
              strokeDasharray="7 6"
              connectNulls
              dot={{ r: 5, fill: palette.forecast, strokeWidth: 0 }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
