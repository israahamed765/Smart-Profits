"use client";

import Link from "next/link";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { KpiCards } from "@/frontend/components/dashboard/kpi-cards";
import { RevenueExpenseChart } from "@/frontend/components/dashboard/revenue-chart";
import { ExpenseDonut } from "@/frontend/components/dashboard/expense-donut";
import { HealthPanel } from "@/frontend/components/advisor/health-panel";
import { TodayActions } from "@/frontend/components/advisor/today-actions";
import { ProfitLeaks } from "@/frontend/components/advisor/profit-leaks";
import { RiskRadar } from "@/frontend/components/advisor/risk-radar";
import { ActionPlan } from "@/frontend/components/advisor/action-plan";
import { InventoryAdviceTable } from "@/frontend/components/advisor/inventory-table";
import { SmartPricingList } from "@/frontend/components/advisor/pricing-list";
import { MonthCompare } from "@/frontend/components/advisor/month-compare";
import { OpexInsights } from "@/frontend/components/dashboard/opex-insights";
import { AppHeader } from "@/frontend/components/layout/app-header";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { useAuth } from "@/frontend/context/auth-context";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import { Card } from "@/frontend/components/ui/card";
import { trackPlatform } from "@/frontend/lib/admin/track";

export default function DashboardPage() {
  const { result, isDemo } = useAnalysis();
  const { user } = useAuth();
  const { t } = useAppearance();

  useEffect(() => {
    if (result) trackPlatform("doctor", undefined, user?.email);
  }, [result, user?.email]);

  return (
    <>
      <AppHeader title={t("dash.title")} subtitle={t("dash.subtitle")} />
      <motion.div
        className="page-pad"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        {isDemo && (
          <Badge tone="warning">{t("dash.demo")}</Badge>
        )}

        {!result && (
          <Card className="p-5 text-center sm:p-8">
            <p className="text-foreground">{t("dash.needFile")}</p>
            <Link href="/data">
              <Button className="mt-4">{t("dash.goData")}</Button>
            </Link>
          </Card>
        )}

        {result && (
          <>
            <KpiCards />
            <OpexInsights />
            <MonthCompare />
            <div className="grid gap-4 lg:grid-cols-12">
              <div className="min-w-0 lg:col-span-8">
                <RevenueExpenseChart />
              </div>
              <div className="min-w-0 lg:col-span-4">
                <ExpenseDonut />
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-12">
              <div className="min-w-0 lg:col-span-7">
                <HealthPanel />
              </div>
              <div className="min-w-0 lg:col-span-5">
                <TodayActions />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <ProfitLeaks />
              <RiskRadar />
            </div>
            <InventoryAdviceTable />
            <div className="grid gap-4 md:grid-cols-2">
              <SmartPricingList />
              <ActionPlan />
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}
