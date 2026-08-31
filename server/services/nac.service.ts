import { SENSITIVE_ACTIONS, type SensitiveAction } from "@/lib/smart-guard/types";
import { decideSmartGuard } from "@/lib/smart-guard/policy";
import { SIM_SWAP_MAX_AGE_HOURS, DEVICE_SWAP_MAX_AGE_HOURS } from "@/shared/contracts/nac-contract";
import {
  NOKIA_MOCK_PROFILES,
  decisionToGate,
  mockDeviceSwapCheck,
  mockDeviceSwapDate,
  mockGateLabel,
  mockLocationVerify,
  mockNumberVerify,
  mockSimSwapCheck,
  mockSimSwapDate,
} from "@/server/smart-guard/nokia-mock";
import {
  simulateDeviceSwapCheck,
  simulateDeviceSwapDate,
  simulateLocationVerify,
  simulateNumberVerify,
  simulateSimSwapCheck,
  simulateSimSwapDate,
} from "@/server/smart-guard/nac-simulator";

export {
  NOKIA_MOCK_PROFILES,
  mockGateLabel,
  simulateDeviceSwapCheck,
  simulateDeviceSwapDate,
  simulateLocationVerify,
  simulateNumberVerify,
  simulateSimSwapCheck,
  simulateSimSwapDate,
};

function hoursSince(iso: string | null | undefined) {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, (Date.now() - at) / 36e5);
}

export function nacCatalog() {
  return {
    name: "Smart Profits — Nokia NaC mock",
    mode: "simulator" as const,
    note: "Official NaC simulator numbers: +99999991000 swap occurred, +99999991001 clean. Set NAC_API_KEY for live RapidAPI.",
    numbers: NOKIA_MOCK_PROFILES.map((row) => ({
      phoneNumber: row.phoneNumber,
      gate: row.gate,
      ar: mockGateLabel(row.gate, "ar"),
      en: mockGateLabel(row.gate, "en"),
      labelAr: row.labelAr,
      labelEn: row.labelEn,
    })),
    endpoints: [
      { method: "POST", path: "/api/nac/sim-swap/v1/check", body: { phoneNumber: "+99999991000", maxAge: 24 } },
      { method: "POST", path: "/api/nac/sim-swap/v1/retrieve-date", body: { phoneNumber: "+99999991000" } },
      { method: "POST", path: "/api/nac/device-swap/v1/check", body: { phoneNumber: "+99999991000", maxAge: 24 } },
      { method: "POST", path: "/api/nac/device-swap/v1/retrieve-date", body: { phoneNumber: "+99999991000" } },
      { method: "POST", path: "/api/nac/number-verification/v1/verify", body: { phoneNumber: "+99999991001" } },
      {
        method: "POST",
        path: "/api/nac/location-verification/v1/verify",
        body: {
          device: { phoneNumber: "+99999991002" },
          area: { areaType: "CIRCLE", center: { latitude: 31.5017, longitude: 34.4668 }, radius: 2000 },
        },
      },
      {
        method: "POST",
        path: "/api/nac/mock/gate",
        body: { phoneNumber: "+99999991000", action: "file_upload", email: "demo@smartprofits.local" },
      },
    ],
  };
}

export async function runNokiaMockGate(input: {
  phoneNumber?: string;
  action?: string;
  email?: string;
  headerEmail?: string;
}) {
  const phoneNumber = String(input.phoneNumber || "").trim();
  const action = (input.action as SensitiveAction) || "file_upload";
  const email = String(input.email || input.headerEmail || "mock@smartprofits.local")
    .trim()
    .toLowerCase();
  if (!phoneNumber) {
    return { status: 400 as const, body: { error: "phoneNumber is required." } };
  }
  if (!SENSITIVE_ACTIONS.includes(action)) {
    return { status: 400 as const, body: { error: "Unknown action." } };
  }

  const [simCheck, simDate, deviceCheck, deviceDate, number, location] = await Promise.all([
    mockSimSwapCheck({ phoneNumber, maxAge: SIM_SWAP_MAX_AGE_HOURS }, email),
    mockSimSwapDate({ phoneNumber }, email),
    mockDeviceSwapCheck({ phoneNumber, maxAge: DEVICE_SWAP_MAX_AGE_HOURS }, email),
    mockDeviceSwapDate({ phoneNumber }, email),
    mockNumberVerify({ phoneNumber }, email),
    mockLocationVerify(
      {
        device: { phoneNumber },
        area: {
          areaType: "CIRCLE",
          center: { latitude: 31.5017, longitude: 34.4668 },
          radius: 2000,
        },
      },
      email,
    ),
  ]);

  const hoursAgo = hoursSince(simDate.latestSimChange);
  const deviceHoursAgo = hoursSince(deviceDate.latestDeviceChange);
  const verdict = decideSmartGuard({
    action,
    nacMode: "simulator",
    simSwap: {
      swapped: Boolean(simCheck.swapped),
      hoursAgo,
      recent: Boolean(simCheck.swapped),
      latestSimChange: simDate.latestSimChange,
    },
    deviceSwap: {
      swapped: Boolean(deviceCheck.swapped),
      hoursAgo: deviceHoursAgo,
      recent: Boolean(deviceCheck.swapped),
      latestDeviceChange: deviceDate.latestDeviceChange,
    },
    location: {
      match: location.verificationResult === "TRUE" ? true : location.verificationResult === "FALSE" ? false : null,
      reason: location.verificationResult === "TRUE" ? "inside_store_geofence" : "mock_location",
      verificationResult: location.verificationResult,
      lastLocationTime: location.lastLocationTime,
      matchRate: location.matchRate ?? null,
    },
    number: { verified: Boolean(number.devicePhoneNumberVerified) },
    merchant: {
      email,
      phone: phoneNumber,
      alreadyFrozen: false,
      stepUpVerified: false,
      accountAgeHours: 48,
      suspicious: false,
    },
  });

  const gate = decisionToGate(verdict.decision);
  return {
    status: 200 as const,
    body: {
      allowed: gate === "allow",
      gate,
      labelAr: mockGateLabel(gate, "ar"),
      labelEn: mockGateLabel(gate, "en"),
      decision: verdict.decision,
      reason: verdict.reason,
      summary: verdict.summary,
      nokia: {
        simSwap: simCheck,
        simSwapDate: simDate,
        deviceSwap: deviceCheck,
        deviceSwapDate: deviceDate,
        numberVerification: number,
        locationVerification: location,
      },
    },
  };
}
