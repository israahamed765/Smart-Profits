"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { useSmartGuard } from "@/frontend/context/smart-guard-context";
import { dataSpanDays, simulateWhatIf } from "@/lib/advisor";
import { formatMoney } from "@/frontend/lib/format";
import { localizeCatalogLabel } from "@/frontend/lib/localize-catalog";
import { GuardBlockedError } from "@/frontend/lib/smart-guard/client";
import { toast } from "sonner";

export function WhatIfSimulator() {
  const { result, parseResult, currency } = useAnalysis();
  const { t, locale } = useAppearance();
  const { protect } = useSmartGuard();
  const catalog = result?.productHighlights.catalog ?? [];
  const [product, setProduct] = useState(catalog[0]?.name ?? "");
  const [mode, setMode] = useState<"price" | "discount">("price");
  const [price, setPrice] = useState(catalog[0] ? Math.round((catalog[0].revenue / Math.max(1, catalog[0].quantity)) * 100) / 100 : 0);
  const [discount, setDiscount] = useState(10);

  const selected = catalog.find((item) => item.name === product) ?? catalog[0];
  const days = parseResult ? dataSpanDays(parseResult.transactions) : 30;

  const simulation = useMemo(() => {
    if (!selected) return null;
    const current = selected.quantity > 0 ? selected.revenue / selected.quantity : selected.revenue;
    const next = mode === "discount" ? current * (1 - discount / 100) : price;
    return simulateWhatIf(selected, next, days);
  }, [selected, mode, price, discount, days]);

  if (!result || !selected || !simulation) {
    return (
      <Card className="p-4 sm:p-6">
        <p className="text-sm text-muted">{t("sim.needProducts")}</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          {t("sim.whatif")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>{t("ui.product")}</Label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
              value={selected.name}
              onChange={(event) => {
                const item = catalog.find((row) => row.name === event.target.value);
                setProduct(event.target.value);
                if (item) setPrice(Math.round((item.revenue / Math.max(1, item.quantity)) * 100) / 100);
              }}
            >
              {catalog.map((item) => (
                <option key={item.name} value={item.name}>
                  {localizeCatalogLabel(item.name, locale)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("sim.mode")}</Label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
              value={mode}
              onChange={(event) => setMode(event.target.value as "price" | "discount")}
            >
              <option value="price">{t("sim.mode.price")}</option>
              <option value="discount">{t("sim.mode.discount")}</option>
            </select>
          </div>
          {mode === "price" ? (
            <div>
              <Label>{t("sim.newPrice")}</Label>
              <Input className="mt-1" type="number" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} />
            </div>
          ) : (
            <div>
              <Label>{t("sim.discountPct")}</Label>
              <Input className="mt-1" type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border p-4 text-sm text-slate-300">
            <p>
              {t("sim.curPrice")}: {formatMoney(simulation.currentPrice, currency)}
            </p>
            <p className="mt-1">
              {t("sim.newPrice")}: {formatMoney(simulation.newPrice, currency)}
            </p>
            <p className="mt-1">
              {t("sim.unitProfit")}: {formatMoney(simulation.currentUnitProfit, currency)} → {formatMoney(simulation.newUnitProfit, currency)}
            </p>
          </div>
          <div className="rounded-xl border border-accent/30 bg-accent/8 p-4 text-sm">
            <p className="text-slate-300">{t("sim.monthProfit")}</p>
            <p className="mt-1 text-lg font-bold text-foreground">
              {formatMoney(simulation.currentMonthlyProfit, currency)} → {formatMoney(simulation.newMonthlyProfit, currency)}
            </p>
            <p className={`mt-1 ${simulation.delta >= 0 ? "text-accent" : "text-red-300"}`}>
              {t("sim.delta")}: {simulation.delta >= 0 ? "+" : ""}
              {formatMoney(simulation.delta, currency)}
            </p>
          </div>
        </div>
        <p className="text-sm leading-7 text-slate-200">{t(simulation.verdictKey)}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPrice(simulation.currentPrice)}>
            {t("sim.resetPrice")}
          </Button>
          <Button
            onClick={() => {
              void (async () => {
                try {
                  await protect("price_change");
                  toast.success(t("sim.guardOk"));
                } catch (error) {
                  if (error instanceof GuardBlockedError) return;
                  toast.error(t("sim.guardFail"));
                }
              })();
            }}
          >
            {t("sim.applyPrice")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
