"use client";

import { CreditCard, Server, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { AdminHeader } from "@/frontend/components/admin/admin-header";
import { AdminKpi } from "@/frontend/components/admin/admin-kpi";
import { Badge } from "@/frontend/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAdminPortal } from "@/frontend/context/admin-portal";
import { useAppearance } from "@/frontend/context/appearance";
import { formatUsd, formatUsdPrecise } from "@/frontend/lib/admin/money";

const TX_TONE = {
  success: "success" as const,
  failed: "danger" as const,
  refunded: "warning" as const,
};

export default function AdminFinancialsPage() {
  const { snapshot, ready } = useAdminPortal();
  const { t, locale } = useAppearance();

  if (!ready || !snapshot) {
    return <p className="page-pad text-sm text-muted">{t("admin.fin.loading")}</p>;
  }

  const inflowRows = [
    { label: t("admin.fin.subs"), value: snapshot.inflow.subscriptions },
    { label: t("admin.fin.addons"), value: snapshot.inflow.addons },
  ];
  const outflowRows = [
    { label: t("admin.fin.ai"), value: snapshot.outflow.ai, icon: Sparkles },
    { label: t("admin.fin.hosting"), value: snapshot.outflow.hosting, icon: Server },
    { label: t("admin.fin.payments"), value: snapshot.outflow.payments, icon: CreditCard },
    { label: t("admin.fin.marketing"), value: snapshot.outflow.marketing, icon: Wallet },
  ];
  const txLabel = {
    success: t("admin.fin.tx.success"),
    failed: t("admin.fin.tx.failed"),
    refunded: t("admin.fin.tx.refunded"),
  };
  const dateLocale = locale === "ar" ? "ar-SA" : "en-GB";

  return (
    <>
      <AdminHeader title={t("admin.financials.title")} subtitle={t("admin.financials.subtitle")} />
      <div className="page-pad">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminKpi title={t("admin.fin.inflow")} value={formatUsd(snapshot.inflow.total)} hint="Inflow" icon={TrendingUp} />
          <AdminKpi title={t("admin.fin.outflow")} value={formatUsd(snapshot.outflow.total)} hint="Outflow" icon={Wallet} />
          <AdminKpi title={t("admin.fin.margin")} value={`${snapshot.margin}%`} hint={t("admin.fin.marginHint")} icon={Sparkles} />
          <AdminKpi title="MRR" value={formatUsd(snapshot.mrr)} hint={`ARPU ${formatUsdPrecise(snapshot.arpu)}`} icon={CreditCard} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.fin.inflowTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {inflowRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-xl border border-border bg-white/3 px-4 py-3">
                  <span className="text-sm text-slate-300">{row.label}</span>
                  <span className="font-semibold text-accent">{formatUsd(row.value)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted">{t("admin.fin.total")}</span>
                <span className="font-bold text-foreground">{formatUsd(snapshot.inflow.total)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("admin.fin.outflowTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {outflowRows.map((row) => {
                const Icon = row.icon;
                return (
                  <div key={row.label} className="flex items-center justify-between rounded-xl border border-border bg-white/3 px-4 py-3">
                    <span className="flex items-center gap-2 text-sm text-slate-300">
                      <Icon className="h-4 w-4 text-slate-500" />
                      {row.label}
                    </span>
                    <span className="font-semibold text-danger">{formatUsd(row.value)}</span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="text-muted">{t("admin.fin.total")}</span>
                <span className="font-bold text-foreground">{formatUsd(snapshot.outflow.total)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <p className="text-sm text-muted">{t("admin.fin.saas")}</p>
            <p className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">{formatUsd(snapshot.mrr)}</p>
            <p className="mt-1 text-sm text-slate-400">Monthly Recurring Revenue</p>
          </Card>
          <Card className="p-5">
            <p className="text-sm text-muted">{t("admin.fin.arpuTitle")}</p>
            <p className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">{formatUsdPrecise(snapshot.arpu)}</p>
            <p className="mt-1 text-sm text-slate-400">ARPU — Average Revenue Per User</p>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("admin.fin.txTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-start font-medium">{t("admin.fin.invoice")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.fin.merchant")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.fin.plan")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.fin.amount")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.fin.status")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("admin.fin.date")}</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.transactions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-sm text-muted">
                      {t("admin.fin.txEmpty")}
                    </td>
                  </tr>
                )}
                {snapshot.transactions.map((row) => (
                  <tr key={row.invoice} className="border-b border-border/70">
                    <td className="px-3 py-3 font-mono text-xs text-slate-300">{row.invoice}</td>
                    <td className="px-3 py-3 text-foreground">{row.merchant}</td>
                    <td className="px-3 py-3 text-slate-300">{row.plan}</td>
                    <td className="px-3 py-3 text-foreground">{formatUsd(row.amount)}</td>
                    <td className="px-3 py-3">
                      <Badge tone={TX_TONE[row.status]}>{txLabel[row.status]}</Badge>
                    </td>
                    <td className="px-3 py-3 text-muted">{new Date(row.date).toLocaleDateString(dateLocale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
