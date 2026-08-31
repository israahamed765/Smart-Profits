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
    return <p className="page-pad text-sm text-muted">{t("admin.traffic.title")}...</p>;
  }

  const maxCountry = Math.max(...snapshot.countries.map((row) => row.visitors), 1);

  return (
    <>
      <AdminHeader title={t("admin.traffic.title")} subtitle={t("admin.traffic.subtitle")} />
      <div className="page-pad">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminKpi title="الزوار الفريدون" value={formatCount(snapshot.uniqueVisitors)} hint="حسابات ظهرت في أحداث الفترة" icon={Eye} />
          <AdminKpi title="المشاهدات" value={formatCount(snapshot.pageViews)} hint="عدد الأحداث الحقيقية" icon={Globe} />
          <AdminKpi title="معدل التحويل" value={`${snapshot.conversion}%`} hint="تسجيل جديد ÷ النشاط الفريد" icon={MousePointerClick} />
          <AdminKpi title="أخطاء رفع Excel" value={formatCount(snapshot.uploadErrors)} hint="ملفات فشل تنظيفها" icon={AlertTriangle} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>مصادر النشاط داخل المنصة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mx-auto h-[220px] w-[220px]" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={snapshot.sources} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={3}>
                      {snapshot.sources.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-2 text-sm">
                {snapshot.sources.map((slice) => (
                  <li key={slice.name} className="flex items-center justify-between">
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
              <CardTitle>المتاجر حسب الملفات المحفوظة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot.countries.length === 0 && (
                <p className="text-sm text-muted">لا يوجد تجار بملفات محفوظة بعد.</p>
              )}
              {snapshot.countries.map((row) => (
                <div key={row.name}>
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
              استهلاك الميزات داخل المنصة
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={snapshot.features}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }} />
                <Bar dataKey="uses" name="مرات الاستخدام" fill="#4fd1c5" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
