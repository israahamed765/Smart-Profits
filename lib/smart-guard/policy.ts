import type { GuardInput, GuardReason, GuardVerdict, SensitiveAction } from "./types";
import { DEVICE_SWAP_MAX_AGE_HOURS, SIM_SWAP_MAX_AGE_HOURS } from "./nac-contract";

const LOCATION_BOUND: SensitiveAction[] = ["file_upload", "report_export"];
const IDENTITY_BOUND: SensitiveAction[] = ["login", "password_reset", "price_change"];

/** Below this matchRate, Location Verification FALSE is a hard freeze. At/above it, or PARTIAL, is a mild Step-up. */
export const HARD_LOCATION_MATCH_RATE = 40;

const SUMMARY: Record<GuardReason, string> = {
  clean: "Signals are consistent. Smart Guard allows the action.",
  sim_swap: `SIM swap detected within the last ${SIM_SWAP_MAX_AGE_HOURS} hours. Session is frozen; SMS OTP is not trusted.`,
  device_swap: `Device swap detected within the last ${DEVICE_SWAP_MAX_AGE_HOURS} hours. Session is frozen until network identity is confirmed.`,
  location_mismatch: "Device is far outside the usual store area. Financial upload/export is frozen.",
  location_soft: "Location is only a slight mismatch. The action is not rejected — confirm identity with a network code.",
  account_frozen: "This account is already frozen. Confirm network identity before any sensitive action.",
  need_number_verification: "Password is not enough. Confirm the merchant is on the claimed mobile line.",
  location_unknown: "Store location could not be verified. Step-up is required before ingesting the file.",
  missing_phone: "No mobile number on the account. Network APIs cannot run until a number is saved.",
  financial_risk: "Financial context looks unusual together with weak network signals. Step-up required.",
  check_failed: "Smart Guard could not verify this action. It was blocked.",
};

export function guardSwapTriggers(
  simSwap: GuardInput["simSwap"],
  deviceSwap: GuardInput["deviceSwap"],
): GuardVerdict["inputs"]["triggers"] {
  return {
    sim_swap_detected: simSwap.recent,
    device_swap_detected: deviceSwap.recent,
  };
}

function verdict(
  input: GuardInput,
  decision: GuardVerdict["decision"],
  reason: GuardReason,
): GuardVerdict {
  return {
    decision,
    reason,
    summary: SUMMARY[reason],
    action: input.action,
    inputs: {
      simSwapRecent: input.simSwap.recent,
      simSwapHoursAgo: input.simSwap.hoursAgo,
      latestSimChange: input.simSwap.latestSimChange,
      deviceSwapRecent: input.deviceSwap.recent,
      deviceSwapHoursAgo: input.deviceSwap.hoursAgo,
      latestDeviceChange: input.deviceSwap.latestDeviceChange,
      triggers: guardSwapTriggers(input.simSwap, input.deviceSwap),
      locationMatch: input.location.match,
      locationResult: input.location.verificationResult ?? null,
      locationMatchRate: input.location.matchRate ?? null,
      numberVerified: input.number.verified,
      nacMode: input.nacMode,
    },
    at: new Date().toISOString(),
  };
}

/**
 * Smart Guard brain. Callers must not branch on CAMARA signals themselves —
 * they pass gathered SIM Swap, Device Swap, Location, and Number signals here
 * and obey the single Allow / Step-up / Freeze result.
 */
function isHardLocationMismatch(location: GuardInput["location"]) {
  if (location.verificationResult === "PARTIAL") return false;
  if (location.verificationResult === "FALSE") {
    return (location.matchRate ?? 0) < HARD_LOCATION_MATCH_RATE;
  }
  if (location.match === false) {
    return (location.matchRate ?? 0) < HARD_LOCATION_MATCH_RATE;
  }
  return false;
}

function isSoftLocationDoubt(location: GuardInput["location"]) {
  if (location.verificationResult === "PARTIAL") return true;
  if (location.match !== false && location.verificationResult !== "FALSE") return false;
  const rate = location.matchRate;
  return typeof rate === "number" && rate >= HARD_LOCATION_MATCH_RATE;
}

export function decideSmartGuard(input: GuardInput): GuardVerdict {
  const locationBound = LOCATION_BOUND.includes(input.action);
  const identityBound = IDENTITY_BOUND.includes(input.action);
  const steppedUp = input.merchant.stepUpVerified;

  if (input.simSwap.recent) {
    return verdict(input, "freeze", "sim_swap");
  }

  if (input.deviceSwap.recent) {
    return verdict(input, "freeze", "device_swap");
  }

  if (locationBound && isHardLocationMismatch(input.location)) {
    return verdict(input, "freeze", "location_mismatch");
  }

  // Stay frozen until network identity is confirmed (step-up). Do not clear on a later allow/step_up path by accident.
  if (input.merchant.alreadyFrozen && !steppedUp) {
    return verdict(input, "freeze", "account_frozen");
  }

  if (!input.merchant.phone) {
    return verdict(input, "step_up", "missing_phone");
  }

  if (steppedUp) {
    return verdict(input, "allow", "clean");
  }

  if (identityBound && input.number.verified !== true) {
    return verdict(input, "step_up", "need_number_verification");
  }

  if (locationBound && isSoftLocationDoubt(input.location)) {
    return verdict(input, "step_up", "location_soft");
  }

  if (locationBound && input.location.match == null && input.location.verificationResult !== "PARTIAL") {
    return verdict(input, "step_up", "location_unknown");
  }

  if (input.merchant.suspicious && (input.location.match !== true || input.number.verified !== true)) {
    return verdict(input, "step_up", "financial_risk");
  }

  return verdict(input, "allow", "clean");
}

export function isLocationBound(action: SensitiveAction) {
  return LOCATION_BOUND.includes(action);
}

export function financialSuspicion(input: {
  phone: string;
  accountAgeHours: number;
  fileBytes?: number;
  fileName?: string;
}) {
  if (!input.phone) return true;
  if (typeof input.fileBytes === "number" && input.fileBytes > 35 * 1024 * 1024) return true;
  if (input.accountAgeHours < 1 && typeof input.fileBytes === "number" && input.fileBytes > 8 * 1024 * 1024) {
    return true;
  }
  const name = (input.fileName ?? "").toLowerCase();
  if (name.includes("full_dump") || name.includes("all_customers")) return true;
  return false;
}
