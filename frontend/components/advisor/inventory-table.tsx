"use client";

import { Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Badge } from "@/frontend/components/ui/badge";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { formatMoney } from "@/frontend/lib/format";

export function InventoryAdviceTable() {
  const { result, currency } = useAnalysis();
  const { t } = useAppearance();
  if (!result) return null;
  const rows = result.advisor.inventory;
  const decisionLabel = {
    order_now: t("ui.orderNow"),
    dont_buy: t("ui.dontBuy"),
    watch: t("ui.watch"),
  } as const;
  const decisionTone = {
    order_now: "danger" as const,
    dont_buy: "warning" as const,
    watch: "success" as const,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          {t("ui.stock")}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <p className="mb-3 text-xs text-muted">{t("ui.stockHint")}</p>
        <table className="w-full min-w-[640px] text-start text-sm">
          <thead className="text-slate-400">
            <tr className="border-b border-border">
              <th className="px-2 py-2 font-medium">{t("ui.product")}</th>
              <th className="px-2 py-2 font-medium">{t("ui.estStock")}</th>
              <th className="px-2 py-2 font-medium">{t("ui.velocity")}</th>
              <th className="px-2 py-2 font-medium">{t("ui.daysOut")}</th>
              <th className="px-2 py-2 font-medium">{t("ui.unitProfit")}</th>
              <th className="px-2 py-2 font-medium">{t("ui.decision")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.product} className="border-b border-border/60 text-slate-200">
                <td className="px-2 py-2">{row.product}</td>
                <td className="px-2 py-2">{row.estimatedStock}</td>
                <td className="px-2 py-2">{row.dailyVelocity.toFixed(1)}</td>
                <td className="px-2 py-2">{row.daysUntilStockout ?? "—"}</td>
                <td className="px-2 py-2">{formatMoney(row.unitProfit, currency)}</td>
                <td className="px-2 py-2">
                  <Badge tone={decisionTone[row.decision]}>{decisionLabel[row.decision]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
