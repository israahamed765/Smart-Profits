"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Calculator, Ghost, Pencil, Scale, ShieldCheck } from "lucide-react";
import { OpexSetupModal } from "@/frontend/components/opex/opex-setup-modal";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { formatMoney, monthKey } from "@/frontend/lib/format";
import { reviveTransactionDate } from "@/lib/serialize";
import { computeBreakEven, computeOpexHealth, computeRealVsPhantom, monthlyOpexFromSettings } from "@/lib/opex";
import type { AppSettings } from "@/lib/types";
import { cn } from "@/frontend/ui/cn";

export function OpexInsights() {
  const { result, parseResult, settings, currency, saveSettings } = useAnalysis();
  const { t } = useAppearance();
  const [setupOpen, setSetupOpen] = useState(false);
  const latest = result?.monthlySeries.at(-1);
  const txs = useMemo(() => {
    const all = parseResult?.transactions ?? [];
    if (!latest) return all;
    const dated = all
      .map((tx) => ({ tx, date: reviveTransactionDate(tx.date) }))
      .filter((row): row is { tx: (typeof all)[number]; date: Date } => Boolean(row.date));
    if (!dated.length) return all;
    return dated.filter((row) => monthKey(row.date.getFullYear(), row.date.getMonth()) === latest.key).map((row) => row.tx);
  }, [parseResult?.transactions, latest?.key]);

  const phantom = useMemo(() => computeRealVsPhantom(latest, settings), [latest, settings]);
  const breakEven = useMemo(() => computeBreakEven(latest, txs, settings), [latest, txs, settings]);
  const health = useMemo(() => computeOpexHealth(latest, settings), [latest, settings]);

  if (!result || !phantom || !breakEven || !health) return null;

  const toneClass =
    health.tone === "bad"
      ? "border-red-500/40 bg-red-500/10"
      : health.tone === "warn"
        ? "border-amber-400/40 bg-amber-400/10"
        : health.tone === "good"
          ? "border-primary/30 bg-primary/8"
          : "border-primary/30 bg-primary/8";

  function saveOpex(next: AppSettings) {
    saveSettings(next);
    setSetupOpen(false);
  }

  const healthTitle =
    health.tone === "idle"
      ? t("opex.h.idle")
      : health.tone === "bad"
        ? t("opex.h.bad")
        : health.tone === "warn"
          ? t("opex.h.warn")
          : t("opex.h.ok");
  const healthMsg =
    health.tone === "idle"
      ? settings.opexIncludedInFile
        ? t("opex.m.idleIn")
        : t("opex.m.idleOut")
      : health.tone === "bad"
        ? t("opex.m.bad").replace("{n}", String(health.ratioPct.toFixed(0))).replace("{g}", String(health.ofGrossPct.toFixed(0)))
        : health.tone === "warn"
          ? t("opex.m.warn").replace("{n}", String(health.ratioPct.toFixed(0)))
          : t("opex.m.ok").replace("{n}", String(health.ratioPct.toFixed(0)));

  return (
    <>
      {!settings.opexSetupCompleted && (
        <Card className="border-amber-400/30 bg-amber-400/8 p-5">
          <p className="text-sm font-semibold text-amber-100">{t("opex.phantomWarn")}</p>
          <p className="mt-1 text-sm leading-7 text-slate-300">{t("opex.phantomBody")}</p>
          <Button className="mt-3" onClick={() => setSetupOpen(true)}>
            {t("opex.enterNow")}
          </Button>
        </Card>
      )}

      <Card className={cn("p-5", toneClass)}>
        <div className="flex items-start gap-3">
          {health.tone === "bad" ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 text-red-300" />
          ) : health.tone === "good" ? (
            <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" />
          )}
          <div className="flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-foreground">{healthTitle}</p>
              <p className="text-sm text-slate-200">
                {t("opex.ratio")}: <span className="font-bold">{health.ratioPct.toFixed(0)}%</span> {t("opex.ofSales")}
              </p>
            </div>
            <p className="mt-2 text-sm leading-7 text-slate-200">{healthMsg}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              {t("opex.realVsPhantom")}
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setSetupOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              {t("opex.editFixed")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-amber-400/25 bg-amber-400/8 p-4">
                <p className="flex items-center gap-1.5 text-xs text-amber-200">
                  <Ghost className="h-3.5 w-3.5" />
                  {t("opex.phantom")}
                </p>
                <p className="mt-2 text-2xl font-bold text-foreground">{formatMoney(phantom.phantomProfit, currency)}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{t("opex.phantomHint")}</p>
              </div>
              <div className="rounded-2xl border border-primary/25 bg-primary/8 p-4">
                <p className="text-xs text-primary">{t("opex.real")}</p>
                <p className={cn("mt-2 text-2xl font-bold", phantom.realProfit >= 0 ? "text-accent" : "text-danger")}>
                  {formatMoney(phantom.realProfit, currency)}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {t("opex.after")
                    .replace("{rent}", formatMoney(settings.opexIncludedInFile ? 0 : settings.rent, currency))
                    .replace("{sal}", formatMoney(settings.opexIncludedInFile ? 0 : settings.salaries, currency))
                    .replace("{util}", formatMoney(settings.opexIncludedInFile ? 0 : settings.utilities || 0, currency))
                    .replace("{mkt}", formatMoney(settings.opexIncludedInFile ? 0 : settings.otherOpex, currency))}
                </p>
              </div>
            </div>
            <p className="text-sm leading-7 text-slate-300">
              {t("opex.gap")}:{" "}
              <span className="font-semibold text-foreground">{formatMoney(phantom.gap, currency)}</span>
              {phantom.gap > 0 ? t("opex.gapYes") : t("opex.gapNo")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              {t("opex.be")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {breakEven.fixedOpex <= 0 ? (
              <p className="text-sm leading-7 text-slate-300">{t("opex.beNeed")}</p>
            ) : breakEven.impossible ? (
              <p className="text-sm leading-7 text-red-200">
                {t("opex.beImpossible").replace("{n}", formatMoney(breakEven.fixedOpex, currency))}
              </p>
            ) : (
              <>
                <p className="text-2xl font-bold text-foreground sm:text-3xl">
                  {breakEven.unitsNeeded?.toLocaleString("en-US")}{" "}
                  <span className="text-lg font-medium text-slate-400">{t("opex.unit")}</span>
                </p>
                <p className="text-sm leading-7 text-slate-200">
                  {t("opex.beNeedSell")
                    .replace("{n}", String(breakEven.unitsNeeded))
                    .replace("{money}", formatMoney(monthlyOpexFromSettings(settings), currency))}
                </p>
                <p className="text-sm text-slate-400">
                  {t("opex.soldSoFar").replace("{n}", breakEven.unitsSold.toLocaleString("en-US"))}
                  {breakEven.covered
                    ? t("opex.passed")
                    : t("opex.remain").replace("{n}", (breakEven.remainingUnits ?? 0).toLocaleString("en-US"))}
                  {breakEven.revenueNeeded ? t("opex.orRev").replace("{n}", formatMoney(breakEven.revenueNeeded, currency)) : ""}
                </p>
                <p className="text-xs text-muted">
                  {t("opex.contrib")
                    .replace("{n}", formatMoney(breakEven.avgUnitContribution, currency))
                    .replace("{m}", breakEven.grossMarginPct.toFixed(0))}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <OpexSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onConfirm={saveOpex}
        confirmLabel={t("opex.recalc")}
      />
    </>
  );
}
