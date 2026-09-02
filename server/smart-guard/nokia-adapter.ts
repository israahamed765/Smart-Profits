import type { NacCallTrace } from "@/shared/contracts/nac-contract";
import {
  buildProviderMeta,
  NacProviderError,
  NOKIA_LIVE_ENDPOINTS,
  providerLogLine,
  type NacProviderOutcome,
} from "@/shared/contracts/nac-provider";
import { nacBaseUrl, nacHeaders } from "./nac-env";
import {
  mapLiveDeviceSwapCheck,
  mapLiveDeviceSwapDate,
  mapLiveLocationVerify,
  mapLiveNumberVerify,
  mapLiveSimSwapCheck,
  mapLiveSimSwapDate,
} from "./nac-live-mapper";

export const NOKIA_LIVE_TIMEOUT_MS = 15_000;

function outcomeFromStatus(status: number): NacProviderOutcome {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status === 504) return "timeout";
  if (status >= 500) return "upstream";
  return "upstream";
}

function requestIdFromHeaders(headers: Headers) {
  return (
    headers.get("x-correlator") ||
    headers.get("x-request-id") ||
    headers.get("x-rapidapi-request-id") ||
    undefined
  );
}

async function liveRequest<T>(
  api: NacCallTrace["api"],
  endpoint: string,
  request: unknown,
  map: (body: unknown) => T,
): Promise<{ data: T; trace: NacCallTrace }> {
  const started = Date.now();
  const url = `${nacBaseUrl()}${endpoint}`;
  const headers = nacHeaders();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(NOKIA_LIVE_TIMEOUT_MS),
    });
  } catch (error) {
    const latencyMs = Date.now() - started;
    const kind: NacProviderOutcome =
      error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network";
    const meta = buildProviderMeta({ endpoint, status: 0, latencyMs, outcome: kind });
    console.warn(`[nac-live] ${providerLogLine(meta, api)}`);
    throw new NacProviderError({
      kind,
      status: 0,
      endpoint,
      api,
      latencyMs,
      request,
      message: kind === "timeout" ? "Nokia NaC request timed out." : "Nokia NaC network error.",
    });
  }

  const latencyMs = Date.now() - started;
  const requestId = requestIdFromHeaders(response.headers);
  let responseBody: unknown;
  const text = await response.text();
  try {
    responseBody = text ? JSON.parse(text) : null;
  } catch {
    responseBody = { raw: text.slice(0, 500) };
  }

  if (!response.ok) {
    const kind = outcomeFromStatus(response.status);
    const meta = buildProviderMeta({
      endpoint,
      status: response.status,
      latencyMs,
      outcome: kind,
      requestId,
    });
    console.warn(`[nac-live] ${providerLogLine(meta, api)}`);
    throw new NacProviderError({
      kind,
      status: response.status,
      endpoint,
      api,
      latencyMs,
      requestId,
      request,
      responseBody,
    });
  }

  let data: T;
  try {
    data = map(responseBody);
  } catch (error) {
    const meta = buildProviderMeta({
      endpoint,
      status: response.status,
      latencyMs,
      outcome: "upstream",
      requestId,
    });
    console.warn(`[nac-live] ${providerLogLine(meta, api)} mapError=${error instanceof Error ? error.message : "unknown"}`);
    throw new NacProviderError({
      kind: "upstream",
      status: response.status,
      endpoint,
      api,
      latencyMs,
      requestId,
      request,
      responseBody,
      message: error instanceof Error ? error.message : "Invalid Nokia response mapping.",
    });
  }

  const meta = buildProviderMeta({
    endpoint,
    status: response.status,
    latencyMs,
    outcome: "success",
    requestId,
  });
  console.info(`[nac-live] ${providerLogLine(meta, api)}`);

  const trace: NacCallTrace = {
    api,
    endpoint,
    mode: "live",
    request,
    response: responseBody,
    provider: meta,
  };

  return { data, trace };
}

export async function nokiaSimSwapCheck(request: { phoneNumber: string; maxAge: number }) {
  return liveRequest("sim-swap", NOKIA_LIVE_ENDPOINTS.simSwapCheck, request, mapLiveSimSwapCheck);
}

export async function nokiaSimSwapDate(request: { phoneNumber: string }) {
  return liveRequest("sim-swap", NOKIA_LIVE_ENDPOINTS.simSwapDate, request, mapLiveSimSwapDate);
}

export async function nokiaDeviceSwapCheck(request: { phoneNumber: string; maxAge: number }) {
  return liveRequest("device-swap", NOKIA_LIVE_ENDPOINTS.deviceSwapCheck, request, mapLiveDeviceSwapCheck);
}

export async function nokiaDeviceSwapDate(request: { phoneNumber: string }) {
  return liveRequest("device-swap", NOKIA_LIVE_ENDPOINTS.deviceSwapDate, request, mapLiveDeviceSwapDate);
}

export async function nokiaNumberVerify(request: { phoneNumber: string }) {
  return liveRequest(
    "number-verification",
    NOKIA_LIVE_ENDPOINTS.numberVerify,
    request,
    mapLiveNumberVerify,
  );
}

export async function nokiaLocationVerify(request: {
  device: { phoneNumber: string };
  area: {
    areaType: "CIRCLE";
    center: { latitude: number; longitude: number };
    radius: number;
  };
}) {
  return liveRequest(
    "location-verification",
    NOKIA_LIVE_ENDPOINTS.locationVerify,
    request,
    mapLiveLocationVerify,
  );
}

export { NOKIA_LIVE_ENDPOINTS };
