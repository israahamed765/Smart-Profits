"use client";

import { Download, FileText, Printer } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ActionLogHint, ActionLogList } from "@/frontend/components/layout/action-log";
import { AppHeader } from "@/frontend/components/layout/app-header";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { SectionTabs } from "@/frontend/components/ui/section-tabs";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { useAuth } from "@/frontend/context/auth-context";
import { useSmartGuard } from "@/frontend/context/smart-guard-context";
import { exportMonthlyReport } from "@/frontend/lib/export-report";
import { formatMoney } from "@/frontend/lib/format";
import { normalizeMobile } from "@/frontend/lib/phone";
import { apiFetch } from "@/frontend/lib/api/client";
import { GuardBlockedError } from "@/frontend/lib/smart-guard/client";
import type { AppSettings, CurrencyCode } from "@/lib/types";
import { SmartGuardDemoPanel } from "@/frontend/components/guard/smart-guard-demo-panel";
import { SmartGuardLogPanel } from "@/frontend/components/guard/smart-guard-log-panel";

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, months } = useAppearance();
  const requested = searchParams.get("tab");
  const tab = requested === "actions" || requested === "reports" ? requested : "store";
  const { settings, saveSettings, result, currency } = useAnalysis();
  const { user, updateProfile } = useAuth();
  const { surfaceVerdict } = useSmartGuard();
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState<AppSettings>(settings);
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [storeLat, setStoreLat] = useState("");
  const [storeLng, setStoreLng] = useState("");
  const tabs = [
    { id: "store", label: t("settings.tab.store") },
    { id: "actions", label: t("settings.tab.actions") },
    { id: "reports", label: t("settings.tab.reports") },
  ];

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    setPhone(user?.phone ?? "");
  }, [user?.phone]);

  useEffect(() => {
    if (!user?.email) return;
    apiFetch("/api/auth/profile")
      .then((res) => res.json())
      .then((data: { homeLat?: number | null; homeLng?: number | null }) => {
        if (typeof data.homeLat === "number") setStoreLat(String(data.homeLat));
        if (typeof data.homeLng === "number") setStoreLng(String(data.homeLng));
      })
      .catch(() => undefined);
  }, [user?.email]);

  const reports = useMemo(() => {
    return (result?.monthlySeries ?? [])
      .slice()
      .reverse()
      .map((point) => ({
        title: `${t("settings.reportOf")} ${months[point.month]} ${point.year}`,
        profit: point.netProfit,
        key: point.key,
      }));
  }, [result, t, months]);

  function setTab(id: string) {
    router.replace(id === "store" ? "/settings" : `/settings?tab=${id}`);
  }

  async function save() {
    const normalized = normalizeMobile(phone);
    if (!normalized) {
      toast.error(t("settings.phone.invalid"));
      return;
    }
    const ok = await updateProfile({ phone: normalized, storeName: form.storeName });
    if (!ok) {
      toast.error(t("settings.phone.taken"));
      return;
    }
    const lat = Number(storeLat);
    const lng = Number(storeLng);
    if (storeLat && storeLng && Number.isFinite(lat) && Number.isFinite(lng)) {
      await apiFetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: normalized,
          storeName: form.storeName,
          homeLat: lat,
          homeLng: lng,
        }),
      }).catch(() => undefined);
    }
    setPhone(normalized);
    saveSettings({ ...form, opexSetupCompleted: true });
    toast.success(t("settings.saved"));
  }

  async function exportReport(monthKey: string, mode: "html" | "pdf", scope: "month" | "all" = "month") {
    if (!result) {
      toast.error(t("settings.needFile"));
      return;
    }
    try {
      setExporting(true);
      await exportMonthlyReport(
        { monthKey, mode, scope, currency },
        (verdict) => surfaceVerdict(verdict),
      );
      toast.success(mode === "pdf" ? t("settings.pdfOk") : t("settings.htmlOk"));
    } catch (error) {
      if (error instanceof GuardBlockedError) return;
      toast.error(error instanceof Error ? error.message : t("settings.exportFail"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <AppHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <div className="page-pad">
        <SectionTabs tabs={tabs} value={tab} onChange={setTab} />

        {tab === "store" && (
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.account")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-foreground">{t("settings.profile")}</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>{t("settings.email")}</Label>
                    <Input value={user?.email ?? ""} readOnly dir="ltr" className="text-start text-muted" />
                  </div>
                  <div>
                    <Label>{t("settings.phone")}</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      dir="ltr"
                      placeholder={t("auth.placeholder.phone")}
                      className="text-start"
                    />
                    <p className="mt-1.5 text-xs leading-5 text-muted">{t("settings.phone.hint")}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>{t("settings.storeLat")}</Label>
                    <Input
                      value={storeLat}
                      onChange={(e) => setStoreLat(e.target.value)}
                      dir="ltr"
                      className="text-start"
                      placeholder="31.5017"
                    />
                  </div>
                  <div>
                    <Label>{t("settings.storeLng")}</Label>
                    <Input
                      value={storeLng}
                      onChange={(e) => setStoreLng(e.target.value)}
                      dir="ltr"
                      className="text-start"
                      placeholder="34.4668"
                    />
                  </div>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted">{t("settings.storeLocation.hint")}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    if (!navigator.geolocation) {
                      toast.error(t("settings.storeLocation.fail"));
                      return;
                    }
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setStoreLat(pos.coords.latitude.toFixed(6));
                        setStoreLng(pos.coords.longitude.toFixed(6));
                        toast.success(t("settings.storeLocation.ok"));
                      },
                      () => toast.error(t("settings.storeLocation.fail")),
                    );
                  }}
                >
                  {t("settings.storeLocation.useHere")}
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>{t("settings.storeName")}</Label>
                  <Input value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} />
                </div>
                <div>
                  <Label>{t("settings.currency")}</Label>
                  <select
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none"
                    value={form.defaultCurrency}
                    onChange={(e) => setForm({ ...form, defaultCurrency: e.target.value as CurrencyCode })}
                  >
                    <option value="SAR">{t("settings.sar")}</option>
                    <option value="USD">{t("settings.usd")}</option>
                    <option value="AED">{t("settings.aed")}</option>
                    <option value="JOD">{t("settings.jod")}</option>
                    <option value="ILS">{t("settings.ils")}</option>
                  </select>
                </div>
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold text-foreground">{t("settings.opexTitle")}</h3>
                <p className="mb-3 text-xs leading-6 text-muted">{t("settings.opexHint")}</p>
                <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-black/[0.03] p-3 dark:bg-white/3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-teal-400"
                    checked={Boolean(form.opexIncludedInFile)}
                    onChange={(e) => setForm({ ...form, opexIncludedInFile: e.target.checked, opexSetupCompleted: true })}
                  />
                  <span className="text-sm leading-6 text-foreground">{t("settings.noOpex")}</span>
                </label>
                <div className={form.opexIncludedInFile ? "pointer-events-none grid gap-4 opacity-40 md:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
                  <div>
                    <Label>{t("settings.rent")}</Label>
                    <Input type="number" min={0} value={form.rent} onChange={(e) => setForm({ ...form, rent: Number(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label>{t("settings.salaries")}</Label>
                    <Input type="number" min={0} value={form.salaries} onChange={(e) => setForm({ ...form, salaries: Number(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label>{t("settings.utilities")}</Label>
                    <Input type="number" min={0} value={form.utilities || 0} onChange={(e) => setForm({ ...form, utilities: Number(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label>{t("settings.other")}</Label>
                    <Input type="number" min={0} value={form.otherOpex} onChange={(e) => setForm({ ...form, otherOpex: Number(e.target.value) || 0 })} />
                  </div>
                </div>
              </div>
              <Button onClick={save}>{t("settings.save")}</Button>
            </CardContent>
          </Card>
          )}
          {tab === "store" && (
            <>
              <SmartGuardDemoPanel />
              <SmartGuardLogPanel />
            </>
          )}

        {tab === "actions" && (
          <>
            <ActionLogList />
            <ActionLogHint />
          </>
        )}

        {tab === "reports" && (
          <div className="space-y-4">
            <Card className="border-primary/30 bg-primary/8 p-5">
              <p className="text-sm leading-7 text-muted">{t("settings.reportIntro")}</p>
              <p className="mt-2 text-xs leading-6 text-amber-700 dark:text-amber-200/80">{t("settings.guardExportHint")}</p>
              {reports[0] && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button disabled={exporting} onClick={() => exportReport(reports[0].key, "html", "all")}>
                    <Download className="h-4 w-4" />
                    {exporting ? t("guard.checking") : t("settings.downloadAll")}
                  </Button>
                  <Button variant="outline" disabled={exporting} onClick={() => exportReport(reports[0].key, "pdf", "all")}>
                    <Printer className="h-4 w-4" />
                    {exporting ? t("guard.checking") : t("settings.printPdf")}
                  </Button>
                </div>
              )}
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.monthReports")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {reports.length === 0 && (
                  <p className="text-sm text-muted">{t("settings.noReports")}</p>
                )}
                {reports.map((report) => (
                  <div key={report.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-black/[0.03] px-4 py-3 dark:bg-white/3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={exporting} onClick={() => exportReport(report.key, "html")}>
                        <Download className="h-4 w-4" />
                        HTML
                      </Button>
                      <Button size="sm" disabled={exporting} onClick={() => exportReport(report.key, "pdf")}>
                        <Printer className="h-4 w-4" />
                        PDF
                      </Button>
                    </div>
                    <div className="flex flex-1 items-center justify-end gap-3">
                      <div className="text-end">
                        <p className="text-sm font-medium text-foreground">{report.title}</p>
                        <p className="text-xs text-muted">
                          {t("settings.netProfit")}: {formatMoney(report.profit, currency)} • {t("settings.fullReport")}
                        </p>
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                        <FileText className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

function SettingsFallback() {
  const { t } = useAppearance();
  return <p className="page-pad text-sm text-muted">{t("settings.loading")}</p>;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsFallback />}>
      <SettingsPageInner />
    </Suspense>
  );
}
