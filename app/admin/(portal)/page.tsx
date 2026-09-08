"use client";

import { AlertTriangle, CreditCard, Eye, FileSpreadsheet, ShieldAlert, ShieldCheck, TrendingUp, UserMinus, Users } from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminHeader } from "@/frontend/components/admin/admin-header";
import { AdminKpi } from "@/frontend/components/admin/admin-kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAdminPortal } from "@/frontend/context/admin-portal";
import { useAppearance } from "@/frontend/context/appearance";
import { formatCount, formatUsd } from "@/frontend/lib/admin/money";
import { resolveUserStats } from "@/frontend/lib/admin/metrics";

const ACTIVITY_ICON = {
  analyze: FileSpreadsheet,
  pay: CreditCard,
  user: Users,
};

const ACTIVITY_DOT = {
  analyze: "bg-accent",
  pay: "bg-primary",
  user: "bg-purple",
};

export default function AdminOverviewPage() {
  const { snapshot, ready, range, from, to } = useAdminPortal();
  const { t, locale } = useAppearance();

  if (!ready || !snapshot) {
    return <p className="page-pad text-sm text-muted">{t("admin.overview.loading")}</p>;
  }

  const planData = [
    { name: t("admin.plan.free"), value: snapshot.planSplit.free, color: "#94a3b8" },
    { name: t("admin.plan.pro"), value: snapshot.planSplit.pro, color: "#4fd1c5" },
    { name: t("admin.plan.business"), value: snapshot.planSplit.business, color: "#e8c56b" },
  ];
  const totalPlans = Math.max(1, snapshot.planSplit.free + snapshot.planSplit.pro + snapshot.planSplit.business);
  const stats = resolveUserStats(snapshot, range, from, to);
  const chartLocale = locale === "ar" ? "ar" : "en";

  return (
    <>
      <AdminHeader title={t("admin.overview.title")} subtitle={t("admin.overview.subtitle")} />
      <div className="page-pad">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminKpi
            title={t("admin.kpi.registered")}
            value={formatCount(stats.totalRegistered)}
            hint={t("admin.kpi.registeredHint").replace("{n}", String(stats.registeredInPeriod))}
            icon={Users}
          />
          <AdminKpi
            title={t("admin.kpi.frozen")}
            value={formatCount(stats.frozenCount)}
            hint={t("admin.kpi.frozenHint")}
            icon={ShieldAlert}
          />
          <AdminKpi
            title={t("admin.kpi.issues")}
            value={formatCount(stats.guardIssuesCount)}
            hint={t("admin.kpi.issuesHint")}
            icon={AlertTriangle}
          />
          <AdminKpi
            title={t("admin.kpi.normal")}
            value={formatCount(Math.max(0, stats.totalRegistered - stats.frozenCount - stats.guardIssuesCount))}
            hint={t("admin.kpi.normalHint")}
            icon={ShieldCheck}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminKpi
            title={t("admin.kpi.unique")}
            value={formatCount(snapshot.visitors)}
            hint={t("admin.kpi.uniqueHint")}
            change={snapshot.visitorsChange}
            icon={Eye}
          />
          <AdminKpi
            title={t("admin.kpi.active")}
            value={formatCount(snapshot.activeUsers)}
            hint={t("admin.kpi.activeHint").replace("{n}", String(snapshot.retention))}
            icon={Users}
          />
          <AdminKpi
            title={t("admin.kpi.churn")}
            value={`${snapshot.churn}%`}
            hint={t("admin.kpi.churnHint").replace("{n}", formatUsd(snapshot.ltv))}
            icon={UserMinus}
          />
          <AdminKpi
            title={t("admin.kpi.mrr")}
            value={formatUsd(snapshot.mrr)}
            hint={t("admin.kpi.mrrHint").replace("{n}", formatUsd(snapshot.netProfit))}
            icon={CreditCard}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.chart.plans")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mx-auto h-[180px] w-[180px]" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={planData} dataKey="value" innerRadius={48} outerRadius={72} paddingAngle={3}>
                      {planData.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-2 text-sm">
                {planData.map((slice) => (
                  <li key={slice.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-300">
                      <i className="h-2.5 w-2.5 rounded-full" style={{ background: slice.color }} />
                      {slice.name}
                    </span>
                    <span className="text-muted">
                      {slice.value} ({Math.round((slice.value / totalPlans) * 100)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>{t("admin.chart.growth")}</CardTitle>
            </CardHeader>
            <CardContent className="h-[280px]" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={snapshot.userGrowth}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }} />
                  <Line type="monotone" dataKey="users" name={t("admin.chart.growthSeries")} stroke="#e8c56b" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.chart.finance")}</CardTitle>
              <div className="flex gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-full bg-accent" /> {t("admin.chart.sales")}
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-full bg-slate-400" /> {t("admin.chart.costs")}
                </span>
              </div>
            </CardHeader>
            <CardContent className="h-[280px]" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={snapshot.revenueSeries}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }} />
                  <Line type="monotone" dataKey="revenue" name={t("admin.chart.income")} stroke="#4fd1c5" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="expenses" name={t("admin.chart.expenses")} stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 6" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("admin.chart.net")}</CardTitle>
            </CardHeader>
            <CardContent className="flex h-[280px] flex-col items-center justify-center gap-2">
              <p className="text-4xl font-bold text-accent">{formatUsd(snapshot.netProfit)}</p>
              <p className="text-sm text-muted">{t("admin.chart.netHint")}</p>
              <TrendingUp className="h-8 w-8 text-muted" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("admin.activity.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {snapshot.activity.length === 0 && (
              <p className="text-sm text-muted">{t("admin.activity.empty")}</p>
            )}
            {snapshot.activity.map((item) => {
              const Icon = ACTIVITY_ICON[item.icon];
              return (
                <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-white/3 px-4 py-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${ACTIVITY_DOT[item.icon]}`} />
                  <Icon className="h-4 w-4 text-slate-400" />
                  <p className="flex-1 text-sm text-slate-200">{item.text}</p>
                  <span className="text-xs text-muted" lang={chartLocale}>
                    {item.time}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
