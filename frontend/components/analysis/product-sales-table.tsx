"use client";

import { Badge } from "@/frontend/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { formatMoney } from "@/frontend/lib/format";
import { localizeCatalogLabel } from "@/frontend/lib/localize-catalog";
import type { ProductPerformance } from "@/lib/types";

function Highlight({
  title,
  product,
  tone,
  detail,
  emptyLabel,
  lossLabel,
  profitLabel,
  locale,
  onPick,
}: {
  title: string;
  product: ProductPerformance | null;
  tone: "success" | "danger" | "info" | "warning";
  detail: string;
  emptyLabel: string;
  lossLabel: string;
  profitLabel: string;
  locale: "ar" | "en";
  onPick?: (name: string) => void;
}) {
  return (
    <Card
      className={`p-4 ${product && onPick ? "cursor-pointer hover:border-primary/40" : ""}`}
      onClick={() => product && onPick?.(product.name)}
    >
      <p className="text-xs text-muted">{title}</p>
      <p className="mt-2 text-base font-semibold text-foreground">
        {product ? localizeCatalogLabel(product.name, locale) : emptyLabel}
      </p>
      {detail ? <p className="mt-1 text-sm text-muted">{detail}</p> : null}
      {product ? (
        <Badge className="mt-2" tone={tone}>
          {product.isLoss ? lossLabel : profitLabel}
        </Badge>
      ) : null}
    </Card>
  );
}

export function ProductSalesTable() {
  const { result, currency, setScope, scope } = useAnalysis();
  const { t, locale } = useAppearance();
  if (!result?.productHighlights) return null;
  const { catalog, highestSales, lowestSales, mostProfitable, lossMakers } = result.productHighlights;
  const worstLoss = lossMakers[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Highlight
          title={t("sales.highest")}
          product={highestSales}
          tone="success"
          detail={
            highestSales
              ? `${t("sales.times").replace("{n}", String(highestSales.saleCount))} • ${t("sales.units").replace("{n}", String(highestSales.quantity))}`
              : ""
          }
          emptyLabel={t("sales.none")}
          lossLabel={t("sales.loss")}
          profitLabel={t("sales.profit")}
          locale={locale}
          onPick={(name) => setScope({ product: name })}
        />
        <Highlight
          title={t("sales.lowest")}
          product={lowestSales}
          tone="warning"
          detail={
            lowestSales
              ? `${t("sales.times").replace("{n}", String(lowestSales.saleCount))} • ${t("sales.units").replace("{n}", String(lowestSales.quantity))}`
              : ""
          }
          emptyLabel={t("sales.none")}
          lossLabel={t("sales.loss")}
          profitLabel={t("sales.profit")}
          locale={locale}
          onPick={(name) => setScope({ product: name })}
        />
        <Highlight
          title={t("sales.mostProfit")}
          product={mostProfitable}
          tone="success"
          detail={mostProfitable ? formatMoney(mostProfitable.profit, currency) : ""}
          emptyLabel={t("sales.none")}
          lossLabel={t("sales.loss")}
          profitLabel={t("sales.profit")}
          locale={locale}
          onPick={(name) => setScope({ product: name })}
        />
        <Highlight
          title={t("sales.lossMaker")}
          product={worstLoss}
          tone="danger"
          detail={
            worstLoss
              ? `${t("sales.times").replace("{n}", String(worstLoss.saleCount))} • ${formatMoney(worstLoss.profit, currency)}`
              : t("sales.noLoss")
          }
          emptyLabel={t("sales.none")}
          lossLabel={t("sales.loss")}
          profitLabel={t("sales.profit")}
          locale={locale}
          onPick={(name) => setScope({ product: name })}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("sales.tableTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {catalog.length === 0 ? (
            <p className="text-sm text-muted">{t("sales.empty")}</p>
          ) : (
            <table className="w-full min-w-[800px] text-start text-sm">
              <thead className="text-slate-400">
                <tr className="border-b border-border">
                  <th className="px-2 py-2 font-medium">{t("ui.product")}</th>
                  <th className="px-2 py-2 font-medium">{t("sales.saleCount")}</th>
                  <th className="px-2 py-2 font-medium">{t("sales.qty")}</th>
                  <th className="px-2 py-2 font-medium">{t("sales.revenue")}</th>
                  <th className="px-2 py-2 font-medium">{t("sales.cogs")}</th>
                  <th className="px-2 py-2 font-medium">{t("ui.profit")}</th>
                  <th className="px-2 py-2 font-medium">{t("sales.margin")}</th>
                  <th className="px-2 py-2 font-medium">{t("sales.status")}</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((item) => (
                  <tr
                    key={item.name}
                    className={`cursor-pointer border-b border-border/60 text-slate-200 hover:bg-white/5 ${
                      scope.product === item.name ? "bg-accent/10" : ""
                    }`}
                    onClick={() => setScope({ product: scope.product === item.name ? null : item.name })}
                  >
                    <td className="px-2 py-2 font-medium text-foreground">
                      {localizeCatalogLabel(item.name, locale)}
                    </td>
                    <td className="px-2 py-2">{t("sales.times").replace("{n}", String(item.saleCount))}</td>
                    <td className="px-2 py-2">{t("sales.units").replace("{n}", String(item.quantity))}</td>
                    <td className="px-2 py-2">{formatMoney(item.revenue, currency)}</td>
                    <td className="px-2 py-2">{formatMoney(item.cogs, currency)}</td>
                    <td className={`px-2 py-2 ${item.profit >= 0 ? "text-accent" : "text-danger"}`}>
                      {formatMoney(item.profit, currency)}
                    </td>
                    <td className="px-2 py-2">{item.margin.toFixed(1)}%</td>
                    <td className="px-2 py-2">
                      <Badge tone={item.isLoss ? "danger" : item.saleCount <= 1 ? "warning" : "success"}>
                        {item.isLoss ? t("sales.loss") : item.saleCount <= 1 ? t("sales.stagnant") : t("sales.good")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
