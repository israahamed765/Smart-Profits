import type {
  CamaraDeviceSwapCheckResponse,
  CamaraDeviceSwapDateResponse,
  CamaraLocationVerifyResponse,
  CamaraNumberVerifyResponse,
  CamaraSimSwapCheckResponse,
  CamaraSimSwapDateResponse,
} from "@/shared/contracts/nac-contract";

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return undefined;
}

function readString(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return undefined;
}

/** Maps Nokia/RapidAPI JSON to the internal Smart Guard CAMARA contract. No business rules here. */
export function mapLiveSimSwapCheck(body: unknown): CamaraSimSwapCheckResponse {
  if (!body || typeof body !== "object") throw new Error("Invalid Nokia SIM swap check response.");
  const row = body as Record<string, unknown>;
  const swapped = readBoolean(row.swapped);
  if (swapped === undefined) throw new Error("Nokia SIM swap check response missing swapped.");
  return { swapped };
}

export function mapLiveSimSwapDate(body: unknown): CamaraSimSwapDateResponse {
  if (!body || typeof body !== "object") throw new Error("Invalid Nokia SIM swap date response.");
  const row = body as Record<string, unknown>;
  const latest =
    readString(row.latestSimChange) ??
    readString(row.latest_sim_change) ??
    readString(row.latestSimChangeDate) ??
    null;
  return { latestSimChange: latest };
}

export function mapLiveDeviceSwapCheck(body: unknown): CamaraDeviceSwapCheckResponse {
  if (!body || typeof body !== "object") throw new Error("Invalid Nokia device swap check response.");
  const row = body as Record<string, unknown>;
  const swapped = readBoolean(row.swapped);
  if (swapped === undefined) throw new Error("Nokia device swap check response missing swapped.");
  return { swapped };
}

export function mapLiveDeviceSwapDate(body: unknown): CamaraDeviceSwapDateResponse {
  if (!body || typeof body !== "object") throw new Error("Invalid Nokia device swap date response.");
  const row = body as Record<string, unknown>;
  const latest =
    readString(row.latestDeviceChange) ??
    readString(row.latest_device_change) ??
    readString(row.latestDeviceChangeDate) ??
    null;
  return { latestDeviceChange: latest };
}

export function mapLiveNumberVerify(body: unknown): CamaraNumberVerifyResponse {
  if (!body || typeof body !== "object") throw new Error("Invalid Nokia number verification response.");
  const row = body as Record<string, unknown>;
  const verified =
    readBoolean(row.devicePhoneNumberVerified) ??
    readBoolean(row.device_phone_number_verified) ??
    readBoolean(row.verified);
  if (verified === undefined) {
    throw new Error("Nokia number verification response missing devicePhoneNumberVerified.");
  }
  return { devicePhoneNumberVerified: verified };
}

const LOCATION_RESULTS = new Set(["TRUE", "FALSE", "PARTIAL"]);

export function mapLiveLocationVerify(body: unknown): CamaraLocationVerifyResponse {
  if (!body || typeof body !== "object") throw new Error("Invalid Nokia location verification response.");
  const row = body as Record<string, unknown>;
  const raw =
    (typeof row.verificationResult === "string" && row.verificationResult) ||
    (typeof row.verification_result === "string" && row.verification_result) ||
    "";
  if (!LOCATION_RESULTS.has(raw)) {
    throw new Error(`Nokia location verification returned unexpected result: ${raw || "(empty)"}`);
  }
  const lastLocationTime =
    readString(row.lastLocationTime) ??
    readString(row.last_location_time) ??
    new Date().toISOString();
  const matchRateRaw = row.matchRate ?? row.match_rate;
  const matchRate = typeof matchRateRaw === "number" ? matchRateRaw : undefined;
  return {
    verificationResult: raw as CamaraLocationVerifyResponse["verificationResult"],
    lastLocationTime,
    matchRate,
  };
}
