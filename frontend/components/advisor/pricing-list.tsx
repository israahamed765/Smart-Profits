"use client";

import { Tag } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { formatMoney } from "@/frontend/lib/format";
import { localizeCatalogLabel } from "@/frontend/lib/localize-catalog";
import { localizePricingCaution } from "@/frontend/lib/localize-advisor";

export function SmartPricingList() {
  const { result, currency } = useAnalysis();
  const { t, locale } = useAppearance();
  if (!result) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-accent" />
          {t("ui.pricing")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {result.advisor.pricing.map((item) => (
          <div key={item.product} className="rounded-xl border border-border p-4">
            <p className="text-sm font-semibold text-foreground">{localizeCatalogLabel(item.product, locale)}</p>
            <p className="mt-2 text-sm text-slate-300">
              {t("ui.currentPrice")} {formatMoney(item.currentPrice, currency)} • {t("ui.cost")}{" "}
              {formatMoney(item.cost, currency)} • {t("ui.margin")} {item.margin.toFixed(0)}%
            </p>
            <p className="mt-1 text-sm text-accent">
              {t("ui.suggested")}: {formatMoney(item.suggestedMin, currency)} — {formatMoney(item.suggestedMax, currency)}
            </p>
            <p className="mt-1 text-xs text-muted">{localizePricingCaution(item.margin, t)}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
