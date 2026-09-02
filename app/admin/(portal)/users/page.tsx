"use client";

import { Ban, Eye, Gift, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminHeader } from "@/frontend/components/admin/admin-header";
import { Badge } from "@/frontend/components/ui/badge";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { filterUsersRegisteredInRange, guardSecurityLabel } from "@/frontend/lib/admin/guard-status";
import { resolveUserStats } from "@/frontend/lib/admin/metrics";
import { useAdminPortal } from "@/frontend/context/admin-portal";
import { useAppearance } from "@/frontend/context/appearance";
import type { AccountStatus, PlanTier } from "@/lib/admin/config";
import { rangeBounds } from "@/lib/admin/config";
import type { AdminUserRow } from "@/lib/admin/types";

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

function formatAdminDate(value: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
}

export default function AdminUsersPage() {
  const { snapshot, ready, patchUser, range, from, to } = useAdminPortal();
  const { t } = useAppearance();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | AccountStatus>("all");
  const [viewing, setViewing] = useState<AdminUserRow | null>(null);

  const filtered = useMemo(() => {
    if (!snapshot) return [];
    const { start, end } = rangeBounds(range, from, to);
    const inPeriod = filterUsersRegisteredInRange(snapshot.users, start, end);
    const q = query.trim().toLowerCase();
    return inPeriod.filter((user) => {
      const matchesQuery =
        !q ||
        user.name.toLowerCase().includes(q) ||
        user.store.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.phone.toLowerCase().includes(q);
      const matchesStatus = status === "all" || user.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [from, query, range, snapshot, status, to]);

  if (!ready || !snapshot) {
    return <p className="page-pad text-sm text-muted">جاري تحميل المستخدمين...</p>;
  }

  const userStats = resolveUserStats(snapshot, range, from, to);

  return (
    <>
      <AdminHeader title={t("admin.users.title")} subtitle={t("admin.users.subtitle")} />
      <div className="page-pad">
        <Card>
          <CardHeader>
            <CardTitle>دليل التجار</CardTitle>
            <p className="text-sm text-muted">
              يعرض من سجّل في الفترة المحددة من الشريط الجانبي ({filtered.length} من {userStats.totalRegistered} إجمالاً)
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute end-3 top-3.5 h-4 w-4 text-slate-500" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="اسم التاجر / متجره / البريد / الجوال"
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
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-start font-medium">التاجر / المتجر</th>
                    <th className="px-3 py-2 text-start font-medium">البريد</th>
                    <th className="px-3 py-2 text-start font-medium">الجوال</th>
                    <th className="px-3 py-2 text-start font-medium">كلمة المرور</th>
                    <th className="px-3 py-2 text-start font-medium">Smart Guard</th>
                    <th className="px-3 py-2 text-start font-medium">التسجيل</th>
                    <th className="px-3 py-2 text-start font-medium">الحالة</th>
                    <th className="px-3 py-2 text-start font-medium">الباقة</th>
                    <th className="px-3 py-2 text-start font-medium">ملفات Excel</th>
                    <th className="px-3 py-2 text-start font-medium">آخر دخول</th>
                    <th className="px-3 py-2 text-start font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-3 py-6 text-sm text-muted">
                        لا يوجد تجار سجّلوا في هذه الفترة. جرّبي «هذا الشهر» أو «هذا العام» من فترة البيانات.
                      </td>
                    </tr>
                  )}
                  {filtered.map((user) => {
                    const security = guardSecurityLabel(user);
                    return (
                      <tr key={user.id} className="border-b border-border/70">
                        <td className="px-3 py-3">
                          <p className="font-medium text-foreground">{user.name}</p>
                          <p className="text-xs text-muted">{user.store}</p>
                        </td>
                        <td className="px-3 py-3 text-slate-300">{user.email}</td>
                        <td className="px-3 py-3 font-mono text-xs text-slate-300" dir="ltr">
                          {user.phone}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`font-mono text-xs ${user.passwordKind === "plain" ? "text-amber-300" : "text-muted"}`}
                            dir="ltr"
                            title={user.passwordKind === "hashed" ? "كلمة المرور مشفّرة ولا يمكن عرضها" : undefined}
                          >
                            {user.passwordDisplay}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={security.tone}>{security.text}</Badge>
                        </td>
                        <td className="px-3 py-3 text-muted">
                          {new Date(user.registeredAt).toLocaleDateString("ar-SA")}
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={STATUS_TONE[user.status]}>{STATUS_LABEL[user.status]}</Badge>
                        </td>
                        <td className="px-3 py-3 text-slate-300">{PLAN_LABEL[user.plan]}</td>
                        <td className="px-3 py-3 text-foreground">{user.filesUploaded}</td>
                        <td className="px-3 py-3 text-muted">{formatAdminDate(user.lastLoginAt || user.lastActive)}</td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setViewing(null)}>
          <Card className="w-full max-w-lg p-5" onClick={(event) => event.stopPropagation()}>
            <p className="text-lg font-semibold text-foreground">{viewing.store}</p>
            <p className="mt-1 text-sm text-muted">
              {viewing.name} • {viewing.email}
            </p>
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              <p>
                الجوال:{" "}
                <span className="font-mono" dir="ltr">
                  {viewing.phone}
                </span>
              </p>
              <p>
                كلمة المرور:{" "}
                <span className={`font-mono ${viewing.passwordKind === "plain" ? "text-amber-300" : ""}`} dir="ltr">
                  {viewing.passwordDisplay}
                </span>
              </p>
              <p>
                Smart Guard:{" "}
                <Badge tone={guardSecurityLabel(viewing).tone}>{guardSecurityLabel(viewing).text}</Badge>
              </p>
              {viewing.guardFrozenAt && <p>تاريخ التجميد: {formatAdminDate(viewing.guardFrozenAt)}</p>}
              {viewing.latestGuardSummary && (
                <p className="rounded-lg border border-border bg-black/20 px-3 py-2 text-xs leading-6 text-muted">
                  {viewing.latestGuardSummary}
                </p>
              )}
              <p>الحالة: {STATUS_LABEL[viewing.status]}</p>
              <p>الباقة: {PLAN_LABEL[viewing.plan]}</p>
              <p>ملفات محلّلة: {viewing.filesUploaded}</p>
              <p>التسجيل: {new Date(viewing.registeredAt).toLocaleDateString("ar-SA")}</p>
              <p>آخر دخول: {formatAdminDate(viewing.lastLoginAt || viewing.lastActive)}</p>
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
