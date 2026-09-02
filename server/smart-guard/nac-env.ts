import type { NacMode } from "@/shared/contracts/nac-contract";

export type { NacMode };

export function nacLiveKey() {
  return (process.env.NAC_API_KEY || "").trim();
}

/** Optional OIDC client for live Number Verification (do not commit real values). */
export function nacNvOidcClientId() {
  return (process.env.NAC_NV_OIDC_CLIENT_ID || "").trim();
}

export function nacNvOidcClientSecret() {
  return (process.env.NAC_NV_OIDC_CLIENT_SECRET || "").trim();
}

/** Step-up demoCode: always in local development (hackathon UI); never in production. */
export function allowSimulatorDemoCode(nodeEnv = process.env.NODE_ENV, key = nacLiveKey()) {
  if (nodeEnv === "production") return false;
  if (nodeEnv === "development") return true;
  return !key;
}

export function nacMode(nodeEnv = process.env.NODE_ENV, key = nacLiveKey()): NacMode {
  if (key) return "live";
  if (nodeEnv === "production") {
    throw new Error("NAC_API_KEY is required in production.");
  }
  return "simulator";
}

export function nacBaseUrl() {
  return (process.env.NAC_BASE_URL || "https://network-as-code.p-eu.rapidapi.com").replace(/\/$/, "");
}

export function nacHeaders() {
  const key = process.env.NAC_API_KEY || "";
  const host = process.env.NAC_RAPIDAPI_HOST || "network-as-code.nokia.rapidapi.com";
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-RapidAPI-Key": key,
    "X-RapidAPI-Host": host,
  };
}
