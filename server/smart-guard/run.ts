import { findAccount, upsertAccount } from "@/server/repositories/user.repository";
import { appendGuardDecision, type GuardLogMeta } from "@/server/repositories/guard-log.repository";
import { isWriteFrozenError } from "@/server/write-freeze";
import { gatherCamaraSignals } from "./camara";
import { financialSuspicion, decideSmartGuard } from "@/lib/smart-guard/policy";
import { markNumberVerified, sessionStepUpVerified } from "./demo";
import { nacMode } from "./nac-env";
import { nacEffectiveMode } from "./nac-client";
import type { GuardVerdict, SensitiveAction } from "@/lib/smart-guard/types";

export interface RunGuardRequest {
  action: SensitiveAction;
  email: string;
  phone?: string;
  fileBytes?: number;
  fileName?: string;
  confirmNumber?: boolean;
  meta?: GuardLogMeta;
}

export async function runSmartGuard(req: RunGuardRequest): Promise<GuardVerdict> {
  const email = req.email.trim().toLowerCase();
  nacMode();
  const account = email ? await findAccount(email) : null;
  const phone = (req.phone || account?.phone || "").trim();
  const store =
    account?.homeLat != null && account?.homeLng != null
      ? { lat: account.homeLat, lng: account.homeLng }
      : { lat: 31.5017, lng: 34.4668 };

  const bundle = await gatherCamaraSignals({
    action: req.action,
    phone,
    email,
    store,
    forceNumberCheck: Boolean(req.confirmNumber) || req.action === "login",
  });

  if (req.confirmNumber && bundle.number.verified) {
    markNumberVerified(email);
  } else if (req.action === "login" && bundle.number.verified) {
    markNumberVerified(email);
  }

  const created = account?.createdAt ? new Date(account.createdAt).getTime() : Date.now();
  const accountAgeHours = Math.max(0, (Date.now() - created) / 36e5);

  const verdict = decideSmartGuard({
    action: req.action,
    simSwap: bundle.simSwap,
    deviceSwap: bundle.deviceSwap,
    location: bundle.location,
    number: bundle.number,
    nacMode: nacEffectiveMode(phone),
    merchant: {
      email,
      phone,
      alreadyFrozen: Boolean(account?.guardFrozen),
      stepUpVerified: sessionStepUpVerified(email),
      accountAgeHours,
      fileBytes: req.fileBytes,
      fileName: req.fileName,
      suspicious: financialSuspicion({
        phone,
        accountAgeHours,
        fileBytes: req.fileBytes,
        fileName: req.fileName,
      }),
    },
  });

  if (account) {
    try {
      const wasFrozen = Boolean(account.guardFrozen);
      // Freeze sticks until an explicit allow (successful step-up). step_up must not clear the flag.
      const nextFrozen =
        verdict.decision === "freeze" ? true : verdict.decision === "allow" ? false : wasFrozen;
      await upsertAccount({
        email,
        guardFrozen: nextFrozen,
        guardFrozenAt: nextFrozen
          ? verdict.decision === "freeze"
            ? verdict.at
            : account.guardFrozenAt || verdict.at
          : "",
        guardReason: verdict.reason,
        homeLat: account.homeLat,
        homeLng: account.homeLng,
      });
    } catch (error) {
      if (isWriteFrozenError(error)) throw error;
      console.warn("[smart-guard] Could not persist account freeze flag.", error);
    }
  }

  const withTraces = { ...verdict, traces: bundle.traces };
  try {
    await appendGuardDecision({
      email,
      phone,
      verdict: withTraces,
      meta: req.meta,
    });
  } catch (error) {
    if (isWriteFrozenError(error)) throw error;
    console.warn("[smart-guard] Failed to persist decision log.", error);
  }
  return withTraces;
}
