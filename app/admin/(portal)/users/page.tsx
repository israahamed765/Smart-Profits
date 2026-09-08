"use client";

import { Ban, Eye, Gift, Search, Trash2 } from "lucide-react";
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

const STATUS_TONE: Record<AccountStatus, "success" | "warning" | "danger"> = {
  active: "success",
  inactive: "warning",
  churned: "danger",
};

export default function AdminUsersPage() {
  const { snapshot, ready, patchUser, deleteUser, range, from, to } = useAdminPortal();
  const { t, locale } = useAppearance();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | AccountStatus>("all");
  const [viewing, setViewing] = useState<AdminUserRow | null>(null);
  const dateLocale = locale === "ar" ? "ar-SA" : "en-GB";

  const statusLabel: Record<AccountStatus, string> = {
    active: t("admin.users.status.active"),
    inactive: t("admin.users.status.inactive"),
    churned: t("admin.users.status.churned"),
  };
  const planLabel: Record<PlanTier, string> = {
    free: t("admin.plan.free"),
    pro: t("admin.plan.pro"),
    business: t("admin.plan.business"),
  };

  function formatAdminDate(value: string) {
    if (!value) return "—";
    return new Date(value).toLocaleString(dateLocale, {
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "short",
    });
  }

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
    return <p className="page-pad text-sm text-muted">{t("admin.users.loading")}</p>;
  }

  const userStats = resolveUserStats(snapshot, range, from, to);

  return (
    <>
      <AdminHeader title={t("admin.users.title")} subtitle={t("admin.users.subtitle")} />
      <div className="page-pad">
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.users.directory")}</CardTitle>
            <p className="text-sm text-muted">
              {t("admin.users.directoryHint")
                .replace("{n}", String(filtered.length))
                .replace("{total}", String(userStats.totalRegistered))}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute end-3 top-3.5 h-4 w-4 text-slate-500" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("admin.users.search")}
                  className="pe-10"
                />
              </div>
              <select
                className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                value={status}
                onChange={(event) => setStatus(event.target.value as "all" | AccountStatus)}
              >
                <option value="all">{t("admin.users.allStatuses")}</option>
                <option value="active">{t("admin.users.status.active")}</option>
                <option value="inactive">{t("admin.users.status.inactive")}</option>
                <option value="churned">{t("admin.users.status.churned")}</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-start font-medium">{t("admin.users.col.merchant")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.users.col.email")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.users.col.phone")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.users.col.password")}</th>
                    <th className="px-3 py-2 text-start font-medium">Smart Guard</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.users.col.registered")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.users.col.status")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.users.col.plan")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.users.col.files")}</th>
                    <th className="px-3 py-2 text-start font-medium">{t("admin.users.col.lastLogin")}</th>
                    <th className="px-3 py-2 text-start font-medium min-w-[180px]">{t("admin.users.col.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-3 py-6 text-sm text-muted">
                        {t("admin.users.empty")}
                      </td>
                    </tr>
                  )}
                  {filtered.map((user) => {
                    const security = guardSecurityLabel(user, locale);
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
                            title={user.passwordKind === "hashed" ? t("admin.users.hashed") : undefined}
                          >
                            {user.passwordDisplay}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={security.tone}>{security.text}</Badge>
                        </td>
                        <td className="px-3 py-3 text-muted">
                          {new Date(user.registeredAt).toLocaleDateString(dateLocale)}
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={STATUS_TONE[user.status]}>{statusLabel[user.status]}</Badge>
                        </td>
                        <td className="px-3 py-3 text-slate-300">{planLabel[user.plan]}</td>
                        <td className="px-3 py-3 text-foreground">{user.filesUploaded}</td>
                        <td className="px-3 py-3 text-muted">{formatAdminDate(user.lastLoginAt || user.lastActive)}</td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" title={t("admin.users.view")} onClick={() => setViewing(user)}>
                              <Eye />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title={t("admin.users.disable")}
                              onClick={() => {
                                patchUser(user.id, { status: "inactive" });
                                toast.success(t("admin.users.disableOk").replace("{store}", user.store));
                              }}
                            >
                              <Ban />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title={t("admin.users.trial")}
                              onClick={() => {
                                patchUser(user.id, { status: "active", plan: "pro" });
                                toast.success(t("admin.users.trialOk").replace("{store}", user.store));
                              }}
                            >
                              <Gift />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title={t("admin.users.delete")}
                              className="text-danger hover:bg-danger/10 hover:text-danger"
                              onClick={async () => {
                                const ok = window.confirm(
                                  t("admin.users.deleteConfirm")
                                    .replace("{store}", user.store)
                                    .replace("{email}", user.email)
                                    .replace("{phone}", user.phone || "—"),
                                );
                                if (!ok) return;
                                const deleted = await deleteUser(user.id);
                                if (deleted) {
                                  if (viewing?.id === user.id) setViewing(null);
                                  toast.success(t("admin.users.deleteOk").replace("{store}", user.store));
                                } else {
                                  toast.error(t("admin.users.deleteFail"));
                                }
                              }}
                            >
                              <Trash2 />
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
                {t("admin.users.phone")}:{" "}
                <span className="font-mono" dir="ltr">
                  {viewing.phone}
                </span>
              </p>
              <p>
                {t("admin.users.password")}:{" "}
                <span className={`font-mono ${viewing.passwordKind === "plain" ? "text-amber-300" : ""}`} dir="ltr">
                  {viewing.passwordDisplay}
                </span>
              </p>
              <p>
                Smart Guard:{" "}
                <Badge tone={guardSecurityLabel(viewing, locale).tone}>{guardSecurityLabel(viewing, locale).text}</Badge>
              </p>
              {viewing.guardFrozenAt && (
                <p>
                  {t("admin.users.frozenAt")}: {formatAdminDate(viewing.guardFrozenAt)}
                </p>
              )}
              {viewing.latestGuardSummary && (
                <p className="rounded-lg border border-border bg-black/20 px-3 py-2 text-xs leading-6 text-muted">
                  {viewing.latestGuardSummary}
                </p>
              )}
              <p>
                {t("admin.users.statusLabel")}: {statusLabel[viewing.status]}
              </p>
              <p>
                {t("admin.users.planLabel")}: {planLabel[viewing.plan]}
              </p>
              <p>
                {t("admin.users.filesLabel")}: {viewing.filesUploaded}
              </p>
              <p>
                {t("admin.users.registeredLabel")}: {new Date(viewing.registeredAt).toLocaleDateString(dateLocale)}
              </p>
              <p>
                {t("admin.users.lastLoginLabel")}: {formatAdminDate(viewing.lastLoginAt || viewing.lastActive)}
              </p>
              {viewing.real && <Badge tone="info">{t("admin.users.realBadge")}</Badge>}
            </div>
            <Button className="mt-4 w-full" variant="outline" onClick={() => setViewing(null)}>
              {t("admin.users.close")}
            </Button>
            <Button
              className="mt-2 w-full"
              variant="destructive"
              onClick={async () => {
                const ok = window.confirm(
                  t("admin.users.deleteConfirmShort")
                    .replace("{store}", viewing.store)
                    .replace("{phone}", viewing.phone || "—"),
                );
                if (!ok) return;
                const deleted = await deleteUser(viewing.id);
                if (deleted) {
                  setViewing(null);
                  toast.success(t("admin.users.deleteOkShort"));
                } else {
                  toast.error(t("admin.users.deleteFail"));
                }
              }}
            >
              {t("admin.users.deleteFinal")}
            </Button>
          </Card>
        </div>
      )}
    </>
  );
}
