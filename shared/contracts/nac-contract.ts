export const SIM_SWAP_MAX_AGE_HOURS = 24;
export const DEVICE_SWAP_MAX_AGE_HOURS = 24;
export const STORE_RADIUS_METERS = 2000;

export type NacMode = "simulator" | "live";

export interface CamaraSimSwapCheckRequest {
  phoneNumber: string;
  maxAge: number;
}

export interface CamaraSimSwapCheckResponse {
  swapped: boolean;
}

export interface CamaraSimSwapDateRequest {
  phoneNumber: string;
}

export interface CamaraSimSwapDateResponse {
  latestSimChange: string | null;
}

export interface CamaraDeviceSwapCheckRequest {
  phoneNumber: string;
  maxAge: number;
}

export interface CamaraDeviceSwapCheckResponse {
  swapped: boolean;
}

export interface CamaraDeviceSwapDateRequest {
  phoneNumber: string;
}

export interface CamaraDeviceSwapDateResponse {
  latestDeviceChange: string | null;
}

export interface CamaraNumberVerifyRequest {
  phoneNumber: string;
}

export interface CamaraNumberVerifyResponse {
  devicePhoneNumberVerified: boolean;
}

export interface CamaraLocationVerifyRequest {
  device: { phoneNumber: string };
  area: {
    areaType: "CIRCLE";
    center: { latitude: number; longitude: number };
    radius: number;
  };
}

export interface CamaraLocationVerifyResponse {
  verificationResult: "TRUE" | "FALSE" | "PARTIAL";
  lastLocationTime: string;
  matchRate?: number;
}

export interface NacCallTrace {
  api: "number-verification" | "sim-swap" | "device-swap" | "location-verification";
  endpoint: string;
  mode: NacMode;
  request: unknown;
  response: unknown;
  /** Present for live RapidAPI calls — audit trail for hackathon / ops. */
  provider?: {
    provider: "Nokia";
    transport: "RapidAPI";
    nacMode: "live";
    endpoint: string;
    status: number;
    latencyMs: number;
    outcome: "success" | "auth" | "not_found" | "rate_limit" | "timeout" | "upstream" | "network";
    requestId?: string;
  };
}
