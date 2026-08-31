import { readDemoFlags } from "./demo";
import {
  DEVICE_SWAP_MAX_AGE_HOURS,
  SIM_SWAP_MAX_AGE_HOURS,
  type CamaraDeviceSwapCheckRequest,
  type CamaraDeviceSwapCheckResponse,
  type CamaraDeviceSwapDateRequest,
  type CamaraDeviceSwapDateResponse,
  type CamaraLocationVerifyRequest,
  type CamaraLocationVerifyResponse,
  type CamaraNumberVerifyRequest,
  type CamaraNumberVerifyResponse,
  type CamaraSimSwapCheckRequest,
  type CamaraSimSwapCheckResponse,
  type CamaraSimSwapDateRequest,
  type CamaraSimSwapDateResponse,
} from "@/shared/contracts/nac-contract";

export type MockGate = "allow" | "deny" | "step_up";

export interface NokiaMockProfile {
  phoneNumber: string;
  labelAr: string;
  labelEn: string;
  gate: MockGate;
  simSwap: boolean;
  simChangeHoursAgo: number;
  deviceSwap: boolean;
  deviceChangeHoursAgo: number;
  numberVerified: boolean;
  location: "TRUE" | "FALSE" | "PARTIAL";
  matchRate: number;
}

/**
 * Nokia NaC simulator numbers (official docs):
 * https://networkascode.nokia.io/_docs/sim-swap/sim-swap#simulated-sim-swap-scenario-responses
 * https://networkascode.nokia.io/_docs/device-swap/device-swap#simulated-device-swap-scenario-responses
 * +99999991000 → swap occurred · +99999991001 → no swap
 * +99999991002 is a local Step-up profile for location mismatch demos.
 */
export const NOKIA_MOCK_PROFILES: NokiaMockProfile[] = [
  {
    phoneNumber: "+99999991000",
    labelAr: "مرفوض — تبديل شريحة/جهاز + موقع بعيد",
    labelEn: "Denied — SIM/device swap + far location",
    gate: "deny",
    simSwap: true,
    simChangeHoursAgo: 3,
    deviceSwap: true,
    deviceChangeHoursAgo: 3,
    numberVerified: false,
    location: "FALSE",
    matchRate: 12,
  },
  {
    phoneNumber: "+99999991001",
    labelAr: "مسموح — إشارات سليمة",
    labelEn: "Allowed — clean signals",
    gate: "allow",
    simSwap: false,
    simChangeHoursAgo: 720,
    deviceSwap: false,
    deviceChangeHoursAgo: 720,
    numberVerified: true,
    location: "TRUE",
    matchRate: 94,
  },
  {
    phoneNumber: "+99999991002",
    labelAr: "تحقق إضافي — موقع غير مطابق قليلاً",
    labelEn: "Step-up — slight location mismatch",
    gate: "step_up",
    simSwap: false,
    simChangeHoursAgo: 400,
    deviceSwap: false,
    deviceChangeHoursAgo: 400,
    numberVerified: true,
    location: "PARTIAL",
    matchRate: 58,
  },
];

function hoursAgoIso(hours: number) {
  return new Date(Date.now() - hours * 36e5).toISOString();
}

export function findNokiaMockProfile(phoneNumber: string) {
  return NOKIA_MOCK_PROFILES.find((row) => row.phoneNumber === phoneNumber) ?? null;
}

export async function mockSimSwapCheck(
  body: CamaraSimSwapCheckRequest,
  email: string,
): Promise<CamaraSimSwapCheckResponse> {
  const profile = findNokiaMockProfile(body.phoneNumber);
  const maxAge = body.maxAge || SIM_SWAP_MAX_AGE_HOURS;
  if (profile) return { swapped: profile.simSwap && maxAge >= 1 };
  const demo = await readDemoFlags(email);
  return { swapped: Boolean(demo.simSwapRecent) && maxAge >= 1 };
}

export async function mockSimSwapDate(
  body: CamaraSimSwapDateRequest,
  email: string,
): Promise<CamaraSimSwapDateResponse> {
  const profile = findNokiaMockProfile(body.phoneNumber);
  if (profile) return { latestSimChange: hoursAgoIso(profile.simChangeHoursAgo) };
  const demo = await readDemoFlags(email);
  if (demo.simSwapRecent) return { latestSimChange: hoursAgoIso(6) };
  return { latestSimChange: hoursAgoIso(400) };
}

export async function mockNumberVerify(
  body: CamaraNumberVerifyRequest,
  email: string,
): Promise<CamaraNumberVerifyResponse> {
  const profile = findNokiaMockProfile(body.phoneNumber);
  if (profile) return { devicePhoneNumberVerified: profile.numberVerified };
  const demo = await readDemoFlags(email);
  return { devicePhoneNumberVerified: demo.numberMatch !== false };
}

export async function mockLocationVerify(
  body: CamaraLocationVerifyRequest,
  email: string,
): Promise<CamaraLocationVerifyResponse> {
  const now = new Date().toISOString();
  const profile = findNokiaMockProfile(body.device.phoneNumber);
  if (profile) {
    return { verificationResult: profile.location, lastLocationTime: now, matchRate: profile.matchRate };
  }
  const demo = await readDemoFlags(email);
  if (demo.locationOutside) {
    return { verificationResult: "PARTIAL", lastLocationTime: now, matchRate: 58 };
  }
  return { verificationResult: "TRUE", lastLocationTime: now, matchRate: 91 };
}

export async function mockDeviceSwapCheck(
  body: CamaraDeviceSwapCheckRequest,
  email: string,
): Promise<CamaraDeviceSwapCheckResponse> {
  const profile = findNokiaMockProfile(body.phoneNumber);
  const maxAge = body.maxAge || DEVICE_SWAP_MAX_AGE_HOURS;
  if (profile) return { swapped: profile.deviceSwap && maxAge >= 1 };
  const demo = await readDemoFlags(email);
  return { swapped: Boolean(demo.simSwapRecent) && maxAge >= 1 };
}

export async function mockDeviceSwapDate(
  body: CamaraDeviceSwapDateRequest,
  email: string,
): Promise<CamaraDeviceSwapDateResponse> {
  const profile = findNokiaMockProfile(body.phoneNumber);
  if (profile) return { latestDeviceChange: hoursAgoIso(profile.deviceChangeHoursAgo) };
  const demo = await readDemoFlags(email);
  if (demo.simSwapRecent) return { latestDeviceChange: hoursAgoIso(6) };
  return { latestDeviceChange: hoursAgoIso(400) };
}

export function mockGateLabel(gate: MockGate, locale: "ar" | "en" = "ar") {
  if (gate === "allow") return locale === "ar" ? "مسموح" : "Allowed";
  if (gate === "deny") return locale === "ar" ? "مرفوض" : "Denied";
  return locale === "ar" ? "تحقق إضافي" : "Step-up";
}

export function decisionToGate(decision: "allow" | "step_up" | "freeze"): MockGate {
  if (decision === "freeze") return "deny";
  if (decision === "step_up") return "step_up";
  return "allow";
}
