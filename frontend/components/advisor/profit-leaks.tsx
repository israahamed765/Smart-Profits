"use client";

import { useEffect } from "react";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAuth } from "@/frontend/context/auth-context";
import { trackPlatform } from "@/frontend/lib/admin/track";
import { useAppearance } from "@/frontend/context/appearance";
import { formatMoney } from "@/frontend/lib/format";
import { localizeCatalogLabel } from "@/frontend/lib/localize-catalog";
import { localizeLeak } from "@/frontend/lib/localize-advisor";

export function ProfitLeaks() {
  const { result, currency } = useAnalysis();
  const { t, locale } = useAppearance();
  const { user } = useAuth();
  const leaks = result?.advisor.leaks ?? [];

  useEffect(() => {
    if (leaks.length) trackPlatform("leak", undefined, user?.email);
  }, [leaks.length, user?.email]);

  if (!result) return null;

  return (
    <Card className="border-amber-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-4 w-4 text-amber-300" />
          {t("ui.leaks")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {leaks.length === 0 && <p className="text-sm text-muted">{t("ui.noLeak")}</p>}
        {leaks.map((leak) => {
          const copy = localizeLeak(leak, t);
          return (
          <div key={leak.id} className="rounded-xl border border-border bg-white/3 p-4">
            <p className="text-sm font-semibold text-foreground">{localizeCatalogLabel(leak.product, locale)}</p>
            <p className="mt-1 text-xs text-muted">
              {t("ui.sales")} {formatMoney(leak.revenue, currency)} • {t("ui.profit")} {formatMoney(leak.profit, currency)}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{copy.issue}</p>
            <p className="mt-1 text-sm leading-6 text-accent">{copy.suggestion}</p>
          </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
