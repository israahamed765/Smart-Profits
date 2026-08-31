"use client";

import { useEffect } from "react";
import Link from "next/link";
import { WhatIfSimulator } from "@/frontend/components/advisor/what-if";
import { ProfitScenariosCard } from "@/frontend/components/advisor/scenarios";
import { ForecastChart } from "@/frontend/components/forecasts/forecast-chart";
import { Recommendations } from "@/frontend/components/forecasts/recommendations";
import { RiskAlertCard } from "@/frontend/components/forecasts/risk-alert";
import { AppHeader } from "@/frontend/components/layout/app-header";
import { Button } from "@/frontend/components/ui/button";
import { Card } from "@/frontend/components/ui/card";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { useAuth } from "@/frontend/context/auth-context";
import { formatMoney } from "@/frontend/lib/format";
import { trackPlatform } from "@/frontend/lib/admin/track";

export default function SimulatorPage() {
  const { result, currency } = useAnalysis();
  const { user } = useAuth();
  const { t } = useAppearance();

  useEffect(() => {
    trackPlatform("whatif", undefined, user?.email);
  }, [user?.email]);

  return (
    <>
      <AppHeader title={t("sim.title")} subtitle={t("sim.subtitle")} />
      <div className="page-pad">
        {!result && (
          <Card className="p-5 text-center sm:p-8">
            <p className="text-foreground">{t("sim.needFile")}</p>
            <Link href="/data">
              <Button className="mt-4">{t("sim.upload")}</Button>
            </Link>
          </Card>
        )}

        {result && (
          <>
            <WhatIfSimulator />
            {result.forecast.willLoseNextMonth != null && (
              <p className="text-sm text-muted">
                {t("sim.nextProfit")}:{" "}
                <span className={result.forecast.willLoseNextMonth ? "text-danger" : "text-accent"}>
                  {formatMoney(result.forecast.nextMonthProfit, currency)}
                </span>
              </p>
            )}
            <RiskAlertCard />
            <ProfitScenariosCard />
            <div className="grid gap-4 lg:grid-cols-12">
              <div className="min-w-0 lg:col-span-8">
                <ForecastChart />
              </div>
              <div className="min-w-0 lg:col-span-4">
                <Recommendations />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
