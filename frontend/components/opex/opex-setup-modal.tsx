"use client";

import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Label } from "@/frontend/components/ui/label";
import { useAnalysis } from "@/frontend/context/analysis-context";
import { useAppearance } from "@/frontend/context/appearance";
import { currencySuffix, formatMoney } from "@/frontend/lib/format";
import { monthlyOpexFromSettings } from "@/lib/opex";
import type { AppSettings } from "@/lib/types";
import { cn } from "@/frontend/ui/cn";

export function OpexSetupModal({
  open,
  onClose,
  onConfirm,
  onSkip,
  confirmLabel,
  skipLabel,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (next: AppSettings) => void;
  onSkip?: () => void;
  confirmLabel?: string;
  skipLabel?: string;
}) {
  const { settings, currency } = useAnalysis();
  const { t } = useAppearance();
  const [form, setForm] = useState(settings);
  const [included, setIncluded] = useState(Boolean(settings.opexIncludedInFile));
  const suffix = currencySuffix(currency);
  const fields: Array<{
    key: "rent" | "salaries" | "utilities" | "otherOpex";
    label: string;
    hint: string;
  }> = [
    { key: "rent", label: t("opex.rent"), hint: t("opex.rentHint") },
    { key: "salaries", label: t("opex.salaries"), hint: t("opex.salariesHint") },
    { key: "utilities", label: t("opex.utilities"), hint: t("opex.utilitiesHint") },
    { key: "otherOpex", label: t("opex.other"), hint: t("opex.otherHint") },
  ];

  useEffect(() => {
    if (!open) return;
    setForm(settings);
    setIncluded(Boolean(settings.opexIncludedInFile));
  }, [open, settings]);

  if (!open) return null;

  const preview = monthlyOpexFromSettings({ ...form, opexIncludedInFile: included });

  function submit() {
    onConfirm({
      ...form,
      opexIncludedInFile: included,
      opexSetupCompleted: true,
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-primary/25 bg-background p-4 shadow-2xl shadow-black/50 sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-primary">{t("opex.badge")}</p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">{t("opex.title")}</h2>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label={t("opex.close")}>
            <X />
          </Button>
        </div>

        <p className="rounded-2xl border border-amber-400/20 bg-amber-400/8 p-4 text-sm leading-7 text-foreground">
          {t("opex.body")}
        </p>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-black/[0.03] p-3 dark:bg-white/3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-teal-400"
            checked={included}
            onChange={(event) => setIncluded(event.target.checked)}
          />
          <span className="text-sm leading-6 text-foreground">
            {t("opex.noOpex")}
            <span className="mt-0.5 block text-xs text-muted">{t("opex.noOpexHint")}</span>
          </span>
        </label>

        <div className={cn("mt-4 grid gap-3", included && "pointer-events-none opacity-40")}>
          {fields.map((field) => (
            <div key={field.key}>
              <Label>{field.label}</Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  step={50}
                  className="pe-24"
                  value={form[field.key] || 0}
                  onChange={(event) =>
                    setForm({ ...form, [field.key]: Math.max(0, Number(event.target.value) || 0) })
                  }
                />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted">
                  {suffix} / {t("opex.monthly")}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted">{field.hint}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm">
          <span className="text-muted">{t("opex.total")}</span>
          <span className="font-semibold text-foreground">{included ? t("opex.fromFile") : formatMoney(preview, currency)}</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="flex-1" onClick={submit}>
            {confirmLabel ?? t("opex.confirmUpload")}
          </Button>
          <Button variant="outline" onClick={onSkip ?? onClose}>
            {skipLabel ?? t("opex.skipUpload")}
          </Button>
        </div>
      </div>
    </div>
  );
}
