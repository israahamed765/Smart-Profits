import { normalizeMobile } from "@/shared/phone";
import {
  DEVICE_SWAP_MAX_AGE_HOURS,
  STORE_RADIUS_METERS,
  type CamaraDeviceSwapCheckResponse,
  type CamaraDeviceSwapDateResponse,
  type CamaraLocationVerifyResponse,
  type CamaraNumberVerifyResponse,
  type CamaraSimSwapCheckResponse,
  type CamaraSimSwapDateResponse,
  type NacCallTrace,
  type NacMode,
} from "@/shared/contracts/nac-contract";
import { nacBaseUrl, nacHeaders, nacMode } from "./nac-env";
import { findNokiaMockProfile } from "./nokia-mock";
import {
  simulateDeviceSwapCheck,
  simulateDeviceSwapDate,
  simulateLocationVerify,
  simulateNumberVerify,
  simulateSimSwapCheck,
  simulateSimSwapDate,
} from "./nac-simulator";

function e164(phone: string) {
  return normalizeMobile(phone) || phone;
}

/** Official Nokia NaC simulator MSISDNs must stay on local profiles even when NAC_API_KEY is set. */
export function nacEffectiveMode(phone: string): NacMode {
  if (findNokiaMockProfile(e164(phone))) return "simulator";
  return nacMode();
}

async function livePost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${nacBaseUrl()}${path}`, {
    method: "POST",
    headers: nacHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Nokia NaC ${path} failed (${response.status})`);
  }
  return (await response.json()) as T;
}

function trace(
  api: NacCallTrace["api"],
  endpoint: string,
  mode: NacMode,
  request: unknown,
  response: unknown,
): NacCallTrace {
  return { api, endpoint, mode, request, response };
}

export async function nacCheckSimSwap(phone: string, email: string, maxAgeHours: number) {
  const mode = nacEffectiveMode(phone);
  const request = { phoneNumber: e164(phone), maxAge: maxAgeHours };
  const endpoint = "/sim-swap/v1/check";
  const response =
    mode === "live"
      ? await livePost<CamaraSimSwapCheckResponse>(endpoint, request)
      : await simulateSimSwapCheck(request, email);
  return { ...response, trace: trace("sim-swap", endpoint, mode, request, response) };
}

export async function nacRetrieveSimSwapDate(phone: string, email: string) {
  const mode = nacEffectiveMode(phone);
  const request = { phoneNumber: e164(phone) };
  const endpoint = "/sim-swap/v1/retrieve-date";
  const response =
    mode === "live"
      ? await livePost<CamaraSimSwapDateResponse>(endpoint, request)
      : await simulateSimSwapDate(request, email);
  return { ...response, trace: trace("sim-swap", endpoint, mode, request, response) };
}

export async function nacCheckDeviceSwap(phone: string, email: string, maxAgeHours: number) {
  const mode = nacEffectiveMode(phone);
  const request = { phoneNumber: e164(phone), maxAge: maxAgeHours };
  const endpoint = "/device-swap/v1/check";
  const response =
    mode === "live"
      ? await livePost<CamaraDeviceSwapCheckResponse>(endpoint, request)
      : await simulateDeviceSwapCheck(request, email);
  return { ...response, trace: trace("device-swap", endpoint, mode, request, response) };
}

export async function nacRetrieveDeviceSwapDate(phone: string, email: string) {
  const mode = nacEffectiveMode(phone);
  const request = { phoneNumber: e164(phone) };
  const endpoint = "/device-swap/v1/retrieve-date";
  const response =
    mode === "live"
      ? await livePost<CamaraDeviceSwapDateResponse>(endpoint, request)
      : await simulateDeviceSwapDate(request, email);
  return { ...response, trace: trace("device-swap", endpoint, mode, request, response) };
}

export async function nacVerifyNumber(phone: string, email: string) {
  const mode = nacEffectiveMode(phone);
  const request = { phoneNumber: e164(phone) };
  const endpoint = "/number-verification/v1/verify";
  const response =
    mode === "live"
      ? await livePost<CamaraNumberVerifyResponse>(endpoint, request)
      : await simulateNumberVerify(request, email);
  return { ...response, trace: trace("number-verification", endpoint, mode, request, response) };
}

export async function nacVerifyLocation(
  phone: string,
  email: string,
  store: { lat: number; lng: number },
) {
  const mode = nacEffectiveMode(phone);
  const request = {
    device: { phoneNumber: e164(phone) },
    area: {
      areaType: "CIRCLE" as const,
      center: { latitude: store.lat, longitude: store.lng },
      radius: STORE_RADIUS_METERS,
    },
  };
  const endpoint = "/location-verification/v1/verify";
  const response =
    mode === "live"
      ? await livePost<CamaraLocationVerifyResponse>(endpoint, request)
      : await simulateLocationVerify(request, email);
  return { ...response, trace: trace("location-verification", endpoint, mode, request, response) };
}
