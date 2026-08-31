"use client";

import { CreditCard, Eye, FileSpreadsheet, TrendingUp, Users } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
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
  const { snapshot, ready } = useAdminPortal();
  const { t } = useAppearance();

  if (!ready || !snapshot) {
    return <p className="page-pad text-sm text-muted">{t("admin.overview.loading")}</p>;
  }

  return (
    <>
      <AdminHeader title={t("admin.overview.title")} subtitle={t("admin.overview.subtitle")} />
      <div className="page-pad">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminKpi
            title="النشاط الفريد"
            value={formatCount(snapshot.visitors)}
            hint="حسابات دخلت أو حلّلت في الفترة"
            change={snapshot.visitorsChange}
            icon={Eye}
          />
          <AdminKpi
            title="المستخدمون النشطون"
            value={formatCount(snapshot.activeUsers)}
            hint={`${snapshot.users.length} مسجّل إجمالاً`}
            icon={Users}
          />
          <AdminKpi
            title="إيراد الاشتراكات / MRR"
            value={formatUsd(snapshot.mrr)}
            hint="المجانية = $0 حتى تُحوَّل لـ Pro"
            icon={CreditCard}
          />
          <AdminKpi
            title="صافي ربح المنصة"
            value={formatUsd(snapshot.netProfit)}
            hint="الاشتراكات − تكاليف مسجّلة (حالياً 0)"
            icon={TrendingUp}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>المالية — الدخل مقابل المصاريف</CardTitle>
              <div className="flex gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-full bg-accent" /> المبيعات والاشتراكات
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="h-2 w-2 rounded-full bg-slate-400" /> التكاليف
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
                  <Line type="monotone" dataKey="revenue" name="الدخل" stroke="#4fd1c5" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="expenses" name="المصاريف" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 6" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>نمو المستخدمين</CardTitle>
            </CardHeader>
            <CardContent className="h-[280px]" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={snapshot.userGrowth}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }} />
                  <Line type="monotone" dataKey="users" name="مسجّلون جدد" stroke="#e8c56b" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>جدول النشاط الفوري</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {snapshot.activity.length === 0 && (
              <p className="text-sm text-muted">لا يوجد نشاط حقيقي في هذه الفترة بعد.</p>
            )}
            {snapshot.activity.map((item) => {
              const Icon = ACTIVITY_ICON[item.icon];
              return (
                <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-white/3 px-4 py-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${ACTIVITY_DOT[item.icon]}`} />
                  <Icon className="h-4 w-4 text-slate-400" />
                  <p className="flex-1 text-sm text-slate-200">{item.text}</p>
                  <span className="text-xs text-muted">{item.time}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
