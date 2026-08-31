"use client";

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { useAppearance } from "@/frontend/context/appearance";
import { useAuth } from "@/frontend/context/auth-context";
import { apiFetch } from "@/frontend/lib/api/client";
import type { NacDemoFlags } from "@/lib/smart-guard/types";
import { DEFAULT_NAC_DEMO } from "@/lib/smart-guard/types";

export function SmartGuardDemoPanel() {
  const { user } = useAuth();
  const { t } = useAppearance();
  const [flags, setFlags] = useState<NacDemoFlags>(DEFAULT_NAC_DEMO);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    apiFetch("/api/smart-guard/demo")
      .then((res) => res.json())
      .then((data: { flags?: NacDemoFlags }) => {
        if (data.flags) setFlags({ ...DEFAULT_NAC_DEMO, ...data.flags });
      })
      .catch(() => undefined);
  }, [user?.email]);

  async function save(next: NacDemoFlags) {
    if (!user?.email) return;
    setSaving(true);
    setFlags(next);
    try {
      const response = await apiFetch("/api/smart-guard/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("save failed");
      toast.success(t("guard.demo.saved"));
    } catch {
      toast.error(t("guard.demo.fail"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          {t("guard.demo.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-7 text-muted">{t("guard.demo.hint")}</p>
        <p className="text-xs leading-6 text-muted">{t("guard.mock.numbers")}</p>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 accent-teal-400"
            checked={flags.simSwapRecent}
            disabled={saving}
            onChange={(e) => void save({ ...flags, simSwapRecent: e.target.checked })}
          />
          <span>{t("guard.demo.simSwap")}</span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 accent-teal-400"
            checked={flags.locationOutside}
            disabled={saving}
            onChange={(e) => void save({ ...flags, locationOutside: e.target.checked })}
          />
          <span>{t("guard.demo.location")}</span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 accent-teal-400"
            checked={!flags.numberMatch}
            disabled={saving}
            onChange={(e) => void save({ ...flags, numberMatch: !e.target.checked })}
          />
          <span>{t("guard.demo.numberFail")}</span>
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => void save(DEFAULT_NAC_DEMO)}
        >
          {t("guard.demo.reset")}
        </Button>
      </CardContent>
    </Card>
  );
}
