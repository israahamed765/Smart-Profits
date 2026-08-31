"use client";

import { Ban, Eye, Gift, Search, UserMinus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminHeader } from "@/frontend/components/admin/admin-header";
import { AdminKpi } from "@/frontend/components/admin/admin-kpi";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { useAdminPortal } from "@/frontend/context/admin-portal";
import { useAppearance } from "@/frontend/context/appearance";
import type { AccountStatus, PlanTier } from "@/lib/admin/config";
import { formatUsd } from "@/frontend/lib/admin/money";
import type { AdminUserRow } from "@/lib/admin/types";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const STATUS_LABEL: Record<AccountStatus, string> = {
  active: "نشط",
  inactive: "غير نشط",
  churned: "ملغى",
};

const STATUS_TONE: Record<AccountStatus, "success" | "warning" | "danger"> = {
  active: "success",
  inactive: "warning",
  churned: "danger",
};

const PLAN_LABEL: Record<PlanTier, string> = {
  free: "مجانية",
  pro: "احترافية",
  business: "أعمال",
};

export default function AdminUsersPage() {
  const { snapshot, ready, patchUser } = useAdminPortal();
  const { t } = useAppearance();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | AccountStatus>("all");
  const [viewing, setViewing] = useState<AdminUserRow | null>(null);

  const filtered = useMemo(() => {
    if (!snapshot) return [];
    const q = query.trim().toLowerCase();
    return snapshot.users.filter((user) => {
      const matchesQuery =
        !q ||
        user.name.toLowerCase().includes(q) ||
        user.store.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q);
      const matchesStatus = status === "all" || user.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [query, snapshot, status]);

  if (!ready || !snapshot) {
    return <p className="page-pad text-sm text-muted">جاري تحميل المستخدمين...</p>;
  }

  const planData = [
    { name: "مجانية", value: snapshot.planSplit.free, color: "#94a3b8" },
    { name: "احترافية", value: snapshot.planSplit.pro, color: "#4fd1c5" },
    { name: "أعمال", value: snapshot.planSplit.business, color: "#e8c56b" },
  ];
  const totalPlans = Math.max(1, snapshot.planSplit.free + snapshot.planSplit.pro + snapshot.planSplit.business);

  return (
    <>
      <AdminHeader title={t("admin.users.title")} subtitle={t("admin.users.subtitle")} />
      <div className="page-pad">
        <div className="grid gap-4 md:grid-cols-3">
          <AdminKpi title="معدل الاحتفاظ" value={`${snapshot.retention}%`} hint="Retention Rate" icon={Users} />
          <AdminKpi title="معدل التسرب" value={`${snapshot.churn}%`} hint="Churn Rate" icon={UserMinus} />
          <AdminKpi title="القيمة مدى الحياة" value={formatUsd(snapshot.ltv)} hint="LTV المتوقع من التاجر" icon={Gift} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="xl:col-span-1">
            <CardHeader>
              <CardTitle>تقسيم خطط الاشتراك</CardTitle>
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

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>دليل التجار</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute end-3 top-3.5 h-4 w-4 text-slate-500" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="اسم التاجر / متجره / البريد"
                    className="pe-10"
                  />
                </div>
                <select
                  className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as "all" | AccountStatus)}
                >
                  <option value="all">كل الحالات</option>
                  <option value="active">نشط</option>
                  <option value="inactive">غير نشط</option>
                  <option value="churned">ملغى</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-start font-medium">التاجر / المتجر</th>
                      <th className="px-3 py-2 text-start font-medium">البريد</th>
                      <th className="px-3 py-2 text-start font-medium">التسجيل</th>
                      <th className="px-3 py-2 text-start font-medium">الحالة</th>
                      <th className="px-3 py-2 text-start font-medium">الباقة</th>
                      <th className="px-3 py-2 text-start font-medium">ملفات Excel</th>
                      <th className="px-3 py-2 text-start font-medium">آخر ظهور</th>
                      <th className="px-3 py-2 text-start font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-6 text-sm text-muted">
                          لا يوجد تجار مطابقون. الحسابات تظهر هنا بعد التسجيل الحقيقي.
                        </td>
                      </tr>
                    )}
                    {filtered.map((user) => (
                      <tr key={user.id} className="border-b border-border/70">
                        <td className="px-3 py-3">
                          <p className="font-medium text-foreground">{user.name}</p>
                          <p className="text-xs text-muted">{user.store}</p>
                        </td>
                        <td className="px-3 py-3 text-slate-300">{user.email}</td>
                        <td className="px-3 py-3 text-muted">{new Date(user.registeredAt).toLocaleDateString("ar-SA")}</td>
                        <td className="px-3 py-3">
                          <Badge tone={STATUS_TONE[user.status]}>{STATUS_LABEL[user.status]}</Badge>
                        </td>
                        <td className="px-3 py-3 text-slate-300">{PLAN_LABEL[user.plan]}</td>
                        <td className="px-3 py-3 text-foreground">{user.filesUploaded}</td>
                        <td className="px-3 py-3 text-muted">
                          {new Date(user.lastActive).toLocaleString("ar-SA", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" title="عرض الملف" onClick={() => setViewing(user)}>
                              <Eye />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="تعطيل الحساب"
                              onClick={() => {
                                patchUser(user.id, { status: "inactive" });
                                toast.success(`تم تعطيل حساب ${user.store}`);
                              }}
                            >
                              <Ban />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="فترة تجريبية مجانية"
                              onClick={() => {
                                patchUser(user.id, { status: "active", plan: "pro" });
                                toast.success(`مُنحت ${user.store} تجربة Pro مجانية`);
                              }}
                            >
                              <Gift />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setViewing(null)}>
          <Card className="w-full max-w-md p-5" onClick={(event) => event.stopPropagation()}>
            <p className="text-lg font-semibold text-foreground">{viewing.store}</p>
            <p className="mt-1 text-sm text-muted">{viewing.name} • {viewing.email}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              <p>الحالة: {STATUS_LABEL[viewing.status]}</p>
              <p>الباقة: {PLAN_LABEL[viewing.plan]}</p>
              <p>ملفات محلّلة: {viewing.filesUploaded}</p>
              <p>التسجيل: {new Date(viewing.registeredAt).toLocaleDateString("ar-SA")}</p>
              <p>آخر ظهور: {new Date(viewing.lastActive).toLocaleString("ar-SA")}</p>
              {viewing.real && <Badge tone="info">حساب حقيقي من المنصة</Badge>}
            </div>
            <Button className="mt-4 w-full" variant="outline" onClick={() => setViewing(null)}>
              إغلاق
            </Button>
          </Card>
        </div>
      )}
    </>
  );
}
