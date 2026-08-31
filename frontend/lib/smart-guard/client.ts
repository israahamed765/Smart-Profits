import { apiFetch } from "@/frontend/lib/api/client";
import type { GuardVerdict, SensitiveAction } from "@/lib/smart-guard/types";

export class GuardBlockedError extends Error {
  verdict: GuardVerdict;
  constructor(verdict: GuardVerdict) {
    super(verdict.summary);
    this.name = "GuardBlockedError";
    this.verdict = verdict;
  }
}

function denyFallback(action: SensitiveAction): GuardVerdict {
  return {
    decision: "freeze",
    reason: "check_failed",
    summary: "Smart Guard could not verify this action. It was blocked.",
    action,
    inputs: {
      simSwapRecent: false,
      simSwapHoursAgo: null,
      latestSimChange: null,
      deviceSwapRecent: false,
      deviceSwapHoursAgo: null,
      latestDeviceChange: null,
      triggers: { sim_swap_detected: false, device_swap_detected: false },
      locationMatch: null,
      locationResult: null,
      locationMatchRate: null,
      numberVerified: null,
      nacMode: "simulator",
    },
    at: new Date().toISOString(),
  };
}

export function readDeviceCoords(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        window.clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 3500, maximumAge: 60_000 },
    );
  });
}

export function verdictFromPayload(data: unknown): GuardVerdict | null {
  if (!data || typeof data !== "object") return null;
  const verdict = (data as { verdict?: GuardVerdict }).verdict;
  if (!verdict || typeof verdict !== "object") return null;
  if (verdict.decision === "allow" || !verdict.decision) return null;
  return verdict;
}

export async function evaluateGuard(input: {
  action: SensitiveAction;
  email?: string;
  phone?: string;
  fileBytes?: number;
  fileName?: string;
}): Promise<GuardVerdict> {
  const coords = await readDeviceCoords();
  try {
    const response = await apiFetch("/api/smart-guard/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: input.action,
        email: input.email,
        phone: input.phone,
        coords,
        fileBytes: input.fileBytes,
        fileName: input.fileName,
      }),
    });
    const data = (await response.json()) as { verdict?: GuardVerdict; error?: string };
    if (!data.verdict) {
      throw new GuardBlockedError(denyFallback(input.action));
    }
    publishVerdict(data.verdict);
    return data.verdict;
  } catch (error) {
    if (error instanceof GuardBlockedError) throw error;
    throw new GuardBlockedError(denyFallback(input.action));
  }
}

export function publishGuardVerdict(verdict: GuardVerdict) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("smart-guard-verdict", { detail: verdict }));
}

function publishVerdict(verdict: GuardVerdict) {
  publishGuardVerdict(verdict);
}

export async function sendStepUpCode(email?: string, phone?: string, action?: SensitiveAction) {
  const response = await apiFetch("/api/smart-guard/step-up/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      email,
      phone,
    }),
  });
  const data = (await response.json()) as {
    ok?: boolean;
    error?: string;
    maskedPhone?: string;
    expiresInSec?: number;
    retryAfterSec?: number;
    demoCode?: string;
    channel?: "network";
  };
  if (!response.ok && response.status !== 429) {
    throw new Error(data.error || "Could not send the network code.");
  }
  return {
    ok: Boolean(data.ok),
    error: data.error,
    maskedPhone: data.maskedPhone || "",
    expiresInSec: data.expiresInSec ?? 300,
    retryAfterSec: data.retryAfterSec ?? 30,
    demoCode: data.demoCode,
    channel: data.channel ?? "network",
  };
}

export async function confirmGuardStepUp(
  action: SensitiveAction,
  code: string,
  email?: string,
  phone?: string,
) {
  const coords = await readDeviceCoords();
  const response = await apiFetch("/api/smart-guard/step-up/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      code,
      email,
      phone,
      coords,
    }),
  });
  const data = (await response.json()) as { verdict?: GuardVerdict; error?: string };
  if (!response.ok || !data.verdict) {
    throw new Error(data.error || "Number Verification failed.");
  }
  publishVerdict(data.verdict);
  return data.verdict;
}
