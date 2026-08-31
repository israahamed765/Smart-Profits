"use client";

import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { formatMoney } from "@/frontend/lib/format";
import { toast } from "sonner";

export function ProductTables() {
  const { result, currency } = useAnalysis();
  const { t } = useAppearance();
  if (!result) return null;
  const statusLabel = {
    rising: t("dash.rising"),
    stable: t("dash.stable"),
    declining: t("dash.declining"),
  } as const;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("dash.top")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {result.topProducts.map((product) => (
              <div key={product.name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/3 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-foreground">{product.name}</p>
                  <p className="text-xs text-muted">{formatMoney(product.revenue, currency)}</p>
                </div>
                <Badge
                  tone={product.status === "rising" ? "success" : product.status === "declining" ? "danger" : "info"}
                >
                  {statusLabel[product.status]}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dash.stagnant")}</CardTitle>
        </CardHeader>
        <CardContent>
          {result.stagnantInventory.length === 0 ? (
            <p className="text-sm text-muted">{t("dash.noStagnant")}</p>
          ) : (
            <div className="space-y-3">
              {result.stagnantInventory.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl bg-white/3 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted">{t("dash.daysIdle").replace("{n}", String(item.daysStagnant))}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={item.suggestedAction === "liquidate" ? "destructive" : "default"}
                    onClick={() =>
                      toast.message(item.suggestedAction === "liquidate" ? t("dash.liqHint") : t("dash.discHint"))
                    }
                  >
                    {item.suggestedAction === "liquidate" ? t("dash.liquidate") : t("dash.discount20")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
