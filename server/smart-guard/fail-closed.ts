import type { GuardVerdict, SensitiveAction } from "@/lib/smart-guard/types";

export function failClosedVerdict(action: SensitiveAction): GuardVerdict {
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
