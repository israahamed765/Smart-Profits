export const SENSITIVE_ACTIONS = [
  "login",
  "password_reset",
  "file_upload",
  "report_export",
  "price_change",
] as const;

export type SensitiveAction = (typeof SENSITIVE_ACTIONS)[number];
export type GuardDecision = "allow" | "step_up" | "freeze";

export type GuardReason =
  | "clean"
  | "sim_swap"
  | "device_swap"
  | "location_mismatch"
  | "location_soft"
  | "account_frozen"
  | "need_number_verification"
  | "location_unknown"
  | "missing_phone"
  | "financial_risk"
  | "check_failed";

export interface SimSwapSignal {
  swapped: boolean;
  hoursAgo: number | null;
  recent: boolean;
  latestSimChange: string | null;
}

export interface DeviceSwapSignal {
  swapped: boolean;
  hoursAgo: number | null;
  recent: boolean;
  latestDeviceChange: string | null;
}

export interface LocationSignal {
  match: boolean | null;
  reason: string;
  verificationResult?: "TRUE" | "FALSE" | "PARTIAL" | null;
  lastLocationTime?: string | null;
  matchRate?: number | null;
}

export interface NumberSignal {
  verified: boolean | null;
}

export interface MerchantContext {
  email: string;
  phone: string;
  alreadyFrozen: boolean;
  stepUpVerified: boolean;
  accountAgeHours: number;
  fileBytes?: number;
  fileName?: string;
  suspicious: boolean;
}

export interface GuardInput {
  action: SensitiveAction;
  simSwap: SimSwapSignal;
  deviceSwap: DeviceSwapSignal;
  location: LocationSignal;
  number: NumberSignal;
  merchant: MerchantContext;
  nacMode: "simulator" | "live";
}

export interface GuardVerdict {
  decision: GuardDecision;
  reason: GuardReason;
  summary: string;
  action: SensitiveAction;
  inputs: {
    simSwapRecent: boolean;
    simSwapHoursAgo: number | null;
    latestSimChange: string | null;
    deviceSwapRecent: boolean;
    deviceSwapHoursAgo: number | null;
    latestDeviceChange: string | null;
    /** Which swap signals triggered evaluation (audit / UI). */
    triggers: {
      sim_swap_detected: boolean;
      device_swap_detected: boolean;
    };
    locationMatch: boolean | null;
    locationResult: "TRUE" | "FALSE" | "PARTIAL" | null;
    locationMatchRate: number | null;
    numberVerified: boolean | null;
    nacMode: "simulator" | "live";
  };
  at: string;
  traces?: Array<{
    api: string;
    endpoint: string;
    mode: string;
    request: unknown;
    response: unknown;
  }>;
}

export interface NacDemoFlags {
  simSwapRecent: boolean;
  locationOutside: boolean;
  numberMatch: boolean;
}

export const DEFAULT_NAC_DEMO: NacDemoFlags = {
  simSwapRecent: false,
  locationOutside: false,
  numberMatch: true,
};

export interface GuardDecisionLog {
  id: string;
  email: string;
  phone: string;
  action: SensitiveAction;
  decision: GuardDecision;
  reason: GuardReason;
  summary: string;
  simSwapRecent: boolean;
  simSwapHoursAgo: number | null;
  locationResult: "TRUE" | "FALSE" | "PARTIAL" | null;
  locationMatch: boolean | null;
  locationMatchRate: number | null;
  numberVerified: boolean | null;
  nacMode: string;
  frozenAt: string | null;
  traces: GuardVerdict["traces"];
  ip: string;
  userAgent: string;
  createdAt: string;
}
