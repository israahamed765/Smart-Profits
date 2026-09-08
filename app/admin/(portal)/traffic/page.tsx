"use client";

import { AlertTriangle, Eye, Globe, MousePointerClick, Stethoscope } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AdminHeader } from "@/frontend/components/admin/admin-header";
import { AdminKpi } from "@/frontend/components/admin/admin-kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAdminPortal } from "@/frontend/context/admin-portal";
import { useAppearance } from "@/frontend/context/appearance";
import { formatCount } from "@/frontend/lib/admin/money";

export default function AdminTrafficPage() {
  const { snapshot, ready } = useAdminPortal();
  const { t } = useAppearance();

  if (!ready || !snapshot) {
    return <p className="page-pad text-sm text-muted">{t("admin.traffic.loading")}</p>;
  }

  const maxCountry = Math.max(...snapshot.countries.map((row) => row.visitors), 1);

  return (
    <>
      <AdminHeader title={t("admin.traffic.title")} subtitle={t("admin.traffic.subtitle")} />
      <div className="page-pad">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminKpi title={t("admin.traffic.unique")} value={formatCount(snapshot.uniqueVisitors)} hint={t("admin.traffic.uniqueHint")} icon={Eye} />
          <AdminKpi title={t("admin.traffic.views")} value={formatCount(snapshot.pageViews)} hint={t("admin.traffic.viewsHint")} icon={Globe} />
          <AdminKpi title={t("admin.traffic.conversion")} value={`${snapshot.conversion}%`} hint={t("admin.traffic.conversionHint")} icon={MousePointerClick} />
          <AdminKpi title={t("admin.traffic.uploadErrors")} value={formatCount(snapshot.uploadErrors)} hint={t("admin.traffic.uploadErrorsHint")} icon={AlertTriangle} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.traffic.sources")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mx-auto h-[220px] w-[220px]" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={snapshot.sources} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={3}>
                      {snapshot.sources.map((slice) => (
                        <Cell key={slice.id ?? slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-2 text-sm">
                {snapshot.sources.map((slice) => (
                  <li key={slice.id ?? slice.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-300">
                      <i className="h-2.5 w-2.5 rounded-full" style={{ background: slice.color }} />
                      {slice.name}
                    </span>
                    <span className="text-muted">{slice.value}%</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("admin.traffic.stores")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot.countries.length === 0 && (
                <p className="text-sm text-muted">{t("admin.traffic.storesEmpty")}</p>
              )}
              {snapshot.countries.map((row) => (
                <div key={row.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-slate-300">{row.name}</span>
                    <span className="text-muted">{formatCount(row.visitors)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(row.visitors / maxCountry) * 100}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-accent" />
              {t("admin.traffic.features")}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={snapshot.features}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }} />
                <Bar dataKey="uses" name={t("admin.traffic.uses")} fill="#4fd1c5" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
