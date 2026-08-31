"use client";

import { useEffect, useState } from "react";
import { Database, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAppearance } from "@/frontend/context/appearance";
import { useAuth } from "@/frontend/context/auth-context";
import { apiFetch } from "@/frontend/lib/api/client";
import type { GuardDecisionLog } from "@/lib/smart-guard/types";

const DECISION_AR: Record<string, string> = {
  allow: "مسموح",
  step_up: "تحقق إضافي",
  freeze: "تجميد",
};

export function SmartGuardLogPanel() {
  const { user } = useAuth();
  const { t, locale } = useAppearance();
  const [backend, setBackend] = useState<"postgres" | "file" | "">("");
  const [configured, setConfigured] = useState(false);
  const [rows, setRows] = useState<GuardDecisionLog[]>([]);

  useEffect(() => {
    if (!user?.email) return;
    function load() {
      apiFetch("/api/smart-guard/logs?limit=12")
        .then((res) => res.json())
        .then((data: { backend?: "postgres" | "file"; configured?: boolean; rows?: GuardDecisionLog[] }) => {
          setBackend(data.backend || "file");
          setConfigured(Boolean(data.configured));
          setRows(data.rows ?? []);
        })
        .catch(() => undefined);
    }
    load();
    function onVerdict() {
      window.setTimeout(load, 400);
    }
    window.addEventListener("smart-guard-verdict", onVerdict);
    return () => window.removeEventListener("smart-guard-verdict", onVerdict);
  }, [user?.email]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          {t("guard.logs.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-7 text-muted">{t("guard.logs.hint")}</p>
        <p className="text-xs text-muted">
          {backend === "postgres" ? t("guard.logs.backend.postgres") : t("guard.logs.backend.file")}
          {configured && backend !== "postgres" ? ` · ${t("guard.logs.postgresDown")}` : ""}
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">{t("guard.logs.empty")}</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl border border-border bg-black/[0.03] px-3 py-2 text-xs leading-6 dark:bg-white/3">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  {row.action} → {locale === "ar" ? DECISION_AR[row.decision] ?? row.decision : row.decision}
                  {row.frozenAt ? ` · ${t("guard.logs.frozen")}` : ""}
                </p>
                <p className="text-muted">
                  {t("guard.logs.who")}: {row.email}
                  {row.phone ? ` · ${row.phone}` : ""}
                </p>
                <p className="text-muted">{new Date(row.createdAt).toLocaleString(locale === "ar" ? "ar" : "en")}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
