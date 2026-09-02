import type { NacCallTrace } from "./nac-contract";

/** RapidAPI Nokia NaC passthrough paths (OpenAPI). Location uses top-level CAMARA v1. */
export const NOKIA_LIVE_ENDPOINTS = {
  simSwapCheck: "/passthrough/camara/v1/sim-swap/sim-swap/v0/check",
  simSwapDate: "/passthrough/camara/v1/sim-swap/sim-swap/v0/retrieve-date",
  deviceSwapCheck: "/passthrough/camara/v1/device-swap/device-swap/v1/check",
  deviceSwapDate: "/passthrough/camara/v1/device-swap/device-swap/v1/retrieve-date",
  numberVerify: "/passthrough/camara/v1/number-verification/number-verification/v0/verify",
  locationVerify: "/location-verification/v1/verify",
} as const;

export type NacProviderOutcome =
  | "success"
  | "auth"
  | "not_found"
  | "rate_limit"
  | "timeout"
  | "upstream"
  | "network";

export interface NacProviderMeta {
  provider: "Nokia";
  transport: "RapidAPI";
  nacMode: "live";
  endpoint: string;
  status: number;
  latencyMs: number;
  outcome: NacProviderOutcome;
  requestId?: string;
}

export type NacProviderKind = NacProviderOutcome;

export class NacProviderError extends Error {
  readonly kind: NacProviderKind;
  readonly status: number;
  readonly endpoint: string;
  readonly api: NacCallTrace["api"];
  readonly latencyMs: number;
  readonly requestId?: string;
  readonly trace: NacCallTrace;

  constructor(input: {
    kind: NacProviderKind;
    status: number;
    endpoint: string;
    api: NacCallTrace["api"];
    latencyMs: number;
    requestId?: string;
    request: unknown;
    responseBody?: unknown;
    message?: string;
  }) {
    super(input.message || `Nokia NaC ${input.endpoint} failed (${input.status})`);
    this.name = "NacProviderError";
    this.kind = input.kind;
    this.status = input.status;
    this.endpoint = input.endpoint;
    this.api = input.api;
    this.latencyMs = input.latencyMs;
    this.requestId = input.requestId;
    this.trace = {
      api: input.api,
      endpoint: input.endpoint,
      mode: "live",
      request: input.request,
      response: input.responseBody ?? { error: this.message },
      provider: buildProviderMeta({
        endpoint: input.endpoint,
        status: input.status,
        latencyMs: input.latencyMs,
        outcome: input.kind,
        requestId: input.requestId,
      }),
    };
  }

  /** Number Verification auth/config gaps → Smart Guard step-up, not fake success. */
  recoverableForNumberVerification() {
    return this.api === "number-verification" && (this.status === 401 || this.status === 403 || this.status === 404);
  }

  /** Location provider gaps → unknown location (step-up path), not a mapped Nokia result. */
  recoverableForLocationVerification() {
    return (
      this.api === "location-verification" &&
      (this.status === 401 || this.status === 403 || this.status === 404 || this.status === 422)
    );
  }
}

export function isNacProviderError(error: unknown): error is NacProviderError {
  return error instanceof NacProviderError;
}

export function buildProviderMeta(input: {
  endpoint: string;
  status: number;
  latencyMs: number;
  outcome: NacProviderOutcome;
  requestId?: string;
}): NacProviderMeta {
  return {
    provider: "Nokia",
    transport: "RapidAPI",
    nacMode: "live",
    endpoint: input.endpoint,
    status: input.status,
    latencyMs: input.latencyMs,
    outcome: input.outcome,
    requestId: input.requestId,
  };
}

export function providerLogLine(meta: NacProviderMeta, api: NacCallTrace["api"]) {
  const parts = [
    `nacMode=${meta.nacMode}`,
    `provider=${meta.provider}`,
    `transport=${meta.transport}`,
    `api=${api}`,
    `endpoint=${meta.endpoint}`,
    `status=${meta.status}`,
    `outcome=${meta.outcome}`,
    `latencyMs=${meta.latencyMs}`,
  ];
  if (meta.requestId) parts.push(`requestId=${meta.requestId}`);
  return parts.join(" ");
}
