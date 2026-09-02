"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, ShieldQuestion, Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/frontend/components/ui/card";
import { Input } from "@/frontend/components/ui/input";
import { useAppearance } from "@/frontend/context/appearance";
import { useSmartGuardOptional } from "@/frontend/context/smart-guard-context";
import { GuardBlockedError, notifyRegisterContinueAfterStepUp } from "@/frontend/lib/smart-guard/client";
import type { GuardReason, GuardVerdict } from "@/lib/smart-guard/types";

const REASON_KEY: Record<GuardReason, string> = {
  clean: "guard.reason.clean",
  sim_swap: "guard.reason.sim_swap",
  device_swap: "guard.reason.device_swap",
  location_mismatch: "guard.reason.location_mismatch",
  location_soft: "guard.reason.location_soft",
  account_frozen: "guard.reason.account_frozen",
  need_number_verification: "guard.reason.need_number_verification",
  location_unknown: "guard.reason.location_unknown",
  missing_phone: "guard.reason.missing_phone",
  financial_risk: "guard.reason.financial_risk",
  check_failed: "guard.reason.check_failed",
};

function verdictMessageKey(verdict: GuardVerdict): string {
  const { triggers } = verdict.inputs;
  if (triggers.sim_swap_detected && triggers.device_swap_detected) {
    return "guard.reason.swap_both";
  }
  return REASON_KEY[verdict.reason];
}

function isSwapFreeze(verdict: GuardVerdict) {
  const { triggers } = verdict.inputs;
  return triggers.sim_swap_detected || triggers.device_swap_detected;
}

const CODE_ERROR_KEY: Record<string, string> = {
  cooldown: "guard.stepup.cooldown",
  missing: "guard.stepup.missing",
  expired: "guard.stepup.expired",
  locked: "guard.stepup.locked",
  mismatch: "guard.stepup.mismatch",
  missing_phone: "guard.reason.missing_phone",
};

export function SmartGuardOverlay() {
  const guard = useSmartGuardOptional();
  const { t } = useAppearance();
  const router = useRouter();
  const pathname = usePathname();
  const onSettings = pathname.startsWith("/settings");
  const [code, setCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [demoCode, setDemoCode] = useState<string | undefined>();
  const [retryAfter, setRetryAfter] = useState(0);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const verdict = guard?.lastVerdict ?? null;
  const needsCode = Boolean(
    verdict && verdict.decision === "step_up" && verdict.reason !== "missing_phone" && !onSettings,
  );

  const requestStepUpCode = guard?.requestStepUpCode;

  useEffect(() => {
    if (!needsCode || !requestStepUpCode) return;
    setCode("");
    setDemoCode(undefined);
    let cancelled = false;
    setSending(true);
    void requestStepUpCode()
      .then((result) => {
        if (cancelled) return;
        setMaskedPhone(result.maskedPhone);
        setDemoCode(result.demoCode);
        setRetryAfter(result.retryAfterSec);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("guard.stepup.sendFail"));
      })
      .finally(() => {
        if (!cancelled) setSending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [needsCode, verdict?.at, requestStepUpCode, t]);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setTimeout(() => setRetryAfter((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfter]);

  if (!verdict || verdict.decision === "allow") return null;

  const frozen = verdict.decision === "freeze";

  if (onSettings) {
    return (
      <div className="sticky top-0 z-[60] border-b border-amber-500/30 bg-amber-500/15 px-4 py-2 text-center text-sm text-foreground">
        {t(verdictMessageKey(verdict))}
      </div>
    );
  }

  const Icon = frozen ? ShieldAlert : ShieldQuestion;

  async function onResend() {
    if (!guard || retryAfter > 0) return;
    setSending(true);
    try {
      const result = await guard.requestStepUpCode();
      setMaskedPhone(result.maskedPhone);
      setDemoCode(result.demoCode);
      setRetryAfter(result.retryAfterSec);
      if (result.error === "cooldown") {
        toast.error(t("guard.stepup.cooldown"));
        return;
      }
      toast.success(t("guard.stepup.sent"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("guard.stepup.sendFail"));
    } finally {
      setSending(false);
    }
  }

  async function onConfirm() {
    if (!guard || confirming) return;
    setConfirming(true);
    try {
      await guard.confirmStepUp(code.replace(/\s/g, ""));
      if (pathname === "/register") {
        toast.success(t("guard.stepup.registerVerified"));
        notifyRegisterContinueAfterStepUp();
        return;
      }
      toast.success(t("guard.stepup.ok"));
      if (pathname === "/login" || pathname === "/forgot-password") {
        return;
      }
    } catch (error) {
      if (error instanceof GuardBlockedError) {
        toast.error(t(REASON_KEY[error.verdict.reason]));
        return;
      }
      const key = error instanceof Error ? CODE_ERROR_KEY[error.message] : undefined;
      toast.error(key ? t(key) : t("guard.stepup.fail"));
    } finally {
      setConfirming(false);
    }
  }

  const confirmBusy = confirming || Boolean(guard?.pending);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-3 sm:items-center sm:p-4">
      <Card className="max-h-[90dvh] w-full max-w-lg overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${frozen ? "text-danger" : "text-amber-400"}`} />
            {frozen ? t("guard.freeze.title") : t("guard.stepup.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-7 text-foreground">{t(verdictMessageKey(verdict))}</p>
          {frozen && isSwapFreeze(verdict) && (
            <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm leading-7 text-foreground">
              {t("guard.freeze.safeguard")}
            </p>
          )}
          {frozen && !isSwapFreeze(verdict) && (
            <p className="text-sm leading-7 text-muted">{t("guard.freeze.safeguard")}</p>
          )}
          {!frozen && verdict.reason !== "missing_phone" && (
            <p className="text-sm leading-7 text-muted">
              {t("guard.stepup.networkHint")}
              {maskedPhone ? ` ${maskedPhone}` : ""}
            </p>
          )}
          <div className="grid gap-2 rounded-xl border border-border bg-black/[0.03] p-3 text-xs leading-6 text-muted dark:bg-white/3">
            <p>
              Nokia NaC ({verdict.inputs.nacMode}): Number Verification{" "}
              {verdict.inputs.numberVerified ? t("guard.signal.ok") : t("guard.signal.pending")}
            </p>
            <p>
              SIM Swap (24h): {verdict.inputs.triggers.sim_swap_detected ? t("guard.signal.bad") : t("guard.signal.ok")}
              {verdict.inputs.simSwapHoursAgo != null
                ? ` · ${Math.round(verdict.inputs.simSwapHoursAgo)}h`
                : ""}
            </p>
            <p>
              Device Swap (24h):{" "}
              {verdict.inputs.triggers.device_swap_detected ? t("guard.signal.bad") : t("guard.signal.ok")}
              {verdict.inputs.deviceSwapHoursAgo != null
                ? ` · ${Math.round(verdict.inputs.deviceSwapHoursAgo)}h`
                : ""}
            </p>
            <p>
              Location Verification:{" "}
              {verdict.inputs.locationResult ??
                (verdict.inputs.locationMatch == null
                  ? t("guard.signal.unknown")
                  : verdict.inputs.locationMatch
                    ? "TRUE"
                    : "FALSE")}
              {verdict.inputs.locationMatchRate != null ? ` · ${verdict.inputs.locationMatchRate}%` : ""}
            </p>
          </div>
          {demoCode && !frozen && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm leading-7">
              {t("guard.stepup.demoInbox")}: <span className="font-mono tracking-[0.3em]">{demoCode}</span>
            </div>
          )}
          {needsCode && (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="step-up-code">
                {t("guard.stepup.codeLabel")}
              </label>
              <Input
                id="step-up-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                className="text-center font-mono text-lg tracking-[0.4em]"
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {verdict.reason === "missing_phone" ? (
              <Button onClick={() => router.push("/settings")}>{t("guard.goPhone")}</Button>
            ) : frozen ? (
              <Button variant="ghost" onClick={() => router.push("/settings")}>
                {t("guard.openSettings")}
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => void onConfirm()}
                  disabled={confirmBusy || sending || code.length !== 6}
                >
                  {confirmBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                  )}
                  {confirmBusy ? t("guard.stepup.confirming") : t("guard.stepup.action")}
                </Button>
                <Button variant="outline" onClick={() => void onResend()} disabled={sending || retryAfter > 0 || confirmBusy}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {retryAfter > 0 ? `${t("guard.stepup.resend")} (${retryAfter})` : t("guard.stepup.resend")}
                </Button>
                <Button variant="outline" onClick={guard?.dismiss} disabled={confirmBusy || sending}>
                  {t("guard.cancel")}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
