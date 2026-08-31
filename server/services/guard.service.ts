import type { NacDemoFlags, SensitiveAction } from "@/lib/smart-guard/types";
import { AppError } from "@/server/errors";
import { findAccount } from "@/server/repositories/user.repository";
import { listGuardDecisions, type GuardLogMeta } from "@/server/repositories/guard-log.repository";
import { readDemoFlags, writeDemoFlags } from "@/server/repositories/demo.repository";
import { createNetworkChallenge, verifyNetworkChallenge } from "@/server/smart-guard/network-code";
import { markStepUpVerified } from "@/server/smart-guard/demo";
import { runSmartGuard, type RunGuardRequest } from "@/server/smart-guard/run";

export async function listMerchantGuardLogs(email: string, limit: number) {
  return listGuardDecisions({ email, limit });
}

export async function getGuardDemoFlags(email: string) {
  return readDemoFlags(email);
}

export async function saveGuardDemoFlags(
  email: string,
  patch: {
    simSwapRecent?: boolean;
    locationOutside?: boolean;
    numberMatch?: boolean;
  },
): Promise<NacDemoFlags> {
  return writeDemoFlags(email, {
    simSwapRecent: Boolean(patch.simSwapRecent),
    locationOutside: Boolean(patch.locationOutside),
    numberMatch: patch.numberMatch !== false,
  });
}

export async function sendStepUpNetworkCode(email: string, bodyPhone?: string) {
  const account = await findAccount(email);
  const phone = String(account?.phone || bodyPhone || "").trim();
  if (!phone) throw new AppError("missing_phone", 400);

  const result = createNetworkChallenge(email, phone);
  if (!result.ok) {
    throw new AppError("cooldown", 429);
  }

  return {
    ok: true as const,
    channel: result.channel,
    maskedPhone: result.maskedPhone,
    expiresInSec: result.expiresInSec,
    retryAfterSec: result.retryAfterSec,
    demoCode: result.demoCode,
  };
}

export async function evaluateSensitiveAction(input: RunGuardRequest) {
  return runSmartGuard(input);
}

export async function verifyStepUpNetworkCode(input: {
  action: SensitiveAction;
  email: string;
  code: string;
  phone?: string;
  meta?: GuardLogMeta;
}) {
  const code = String(input.code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) {
    throw new AppError("mismatch", 400);
  }

  const check = verifyNetworkChallenge(input.email, code);
  if (!check.ok) {
    throw new AppError(check.error, 403);
  }

  markStepUpVerified(input.email);
  const verdict = await runSmartGuard({
    action: input.action,
    email: input.email,
    phone: input.phone,
    confirmNumber: true,
    meta: input.meta,
  });
  return { ok: true as const, verdict };
}
