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
import { nacMode } from "./nac-env";
import { findNokiaMockProfile } from "./nokia-mock";
import {
  nokiaDeviceSwapCheck,
  nokiaDeviceSwapDate,
  nokiaLocationVerify,
  nokiaNumberVerify,
  nokiaSimSwapCheck,
  nokiaSimSwapDate,
} from "./nokia-adapter";
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

/**
 * Official Nokia NaC test MSISDNs (+99999991000/1001/1002) stay on local profiles even
 * when NAC_API_KEY is set — RapidAPI live often misroutes them and breaks the demo script.
 * All other numbers use live Nokia when the key is present.
 */
export function nacEffectiveMode(phone?: string): NacMode {
  if (phone && findNokiaMockProfile(e164(phone))) return "simulator";
  return nacMode();
}

function trace(
  api: NacCallTrace["api"],
  endpoint: string,
  mode: NacMode,
  request: unknown,
  response: unknown,
  provider?: NacCallTrace["provider"],
): NacCallTrace {
  return { api, endpoint, mode, request, response, provider };
}

export async function nacCheckSimSwap(phone: string, email: string, maxAgeHours: number) {
  const request = { phoneNumber: e164(phone), maxAge: maxAgeHours };
  const mode = nacEffectiveMode(request.phoneNumber);
  if (mode === "live") {
    const live = await nokiaSimSwapCheck(request);
    return { ...live.data, trace: live.trace };
  }
  const response = await simulateSimSwapCheck(request, email);
  return {
    ...response,
    trace: trace("sim-swap", "/sim-swap/v1/check", mode, request, response),
  };
}

export async function nacRetrieveSimSwapDate(phone: string, email: string) {
  const request = { phoneNumber: e164(phone) };
  const mode = nacEffectiveMode(request.phoneNumber);
  if (mode === "live") {
    const live = await nokiaSimSwapDate(request);
    return { ...live.data, trace: live.trace };
  }
  const response = await simulateSimSwapDate(request, email);
  return {
    ...response,
    trace: trace("sim-swap", "/sim-swap/v1/retrieve-date", mode, request, response),
  };
}

export async function nacCheckDeviceSwap(phone: string, email: string, maxAgeHours: number) {
  const request = { phoneNumber: e164(phone), maxAge: maxAgeHours };
  const mode = nacEffectiveMode(request.phoneNumber);
  if (mode === "live") {
    const live = await nokiaDeviceSwapCheck(request);
    return { ...live.data, trace: live.trace };
  }
  const response = await simulateDeviceSwapCheck(request, email);
  return {
    ...response,
    trace: trace("device-swap", "/device-swap/v1/check", mode, request, response),
  };
}

export async function nacRetrieveDeviceSwapDate(phone: string, email: string) {
  const request = { phoneNumber: e164(phone) };
  const mode = nacEffectiveMode(request.phoneNumber);
  if (mode === "live") {
    const live = await nokiaDeviceSwapDate(request);
    return { ...live.data, trace: live.trace };
  }
  const response = await simulateDeviceSwapDate(request, email);
  return {
    ...response,
    trace: trace("device-swap", "/device-swap/v1/retrieve-date", mode, request, response),
  };
}

export async function nacVerifyNumber(phone: string, email: string) {
  const request = { phoneNumber: e164(phone) };
  const mode = nacEffectiveMode(request.phoneNumber);
  if (mode === "live") {
    const live = await nokiaNumberVerify(request);
    return { ...live.data, trace: live.trace };
  }
  const response = await simulateNumberVerify(request, email);
  return {
    ...response,
    trace: trace("number-verification", "/number-verification/v1/verify", mode, request, response),
  };
}

export async function nacVerifyLocation(
  phone: string,
  email: string,
  store: { lat: number; lng: number },
) {
  const request = {
    device: { phoneNumber: e164(phone) },
    area: {
      areaType: "CIRCLE" as const,
      center: { latitude: store.lat, longitude: store.lng },
      radius: STORE_RADIUS_METERS,
    },
  };
  const mode = nacEffectiveMode(request.device.phoneNumber);
  if (mode === "live") {
    const live = await nokiaLocationVerify(request);
    return { ...live.data, trace: live.trace };
  }
  const response = await simulateLocationVerify(request, email);
  return {
    ...response,
    trace: trace("location-verification", "/location-verification/v1/verify", mode, request, response),
  };
}

// Re-export for tests / docs — Smart Guard contract types unchanged.
export type {
  CamaraDeviceSwapCheckResponse,
  CamaraDeviceSwapDateResponse,
  CamaraLocationVerifyResponse,
  CamaraNumberVerifyResponse,
  CamaraSimSwapCheckResponse,
  CamaraSimSwapDateResponse,
};

export { DEVICE_SWAP_MAX_AGE_HOURS, STORE_RADIUS_METERS };
