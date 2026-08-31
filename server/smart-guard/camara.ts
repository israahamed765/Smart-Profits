import { isLocationBound } from "@/lib/smart-guard/policy";
import {
  nacCheckDeviceSwap,
  nacCheckSimSwap,
  nacRetrieveDeviceSwapDate,
  nacRetrieveSimSwapDate,
  nacVerifyLocation,
  nacVerifyNumber,
} from "./nac-client";
import { DEVICE_SWAP_MAX_AGE_HOURS, SIM_SWAP_MAX_AGE_HOURS, type NacCallTrace } from "@/shared/contracts/nac-contract";
import { sessionNumberVerified, sessionStepUpVerified } from "./demo";
import type { DeviceSwapSignal, LocationSignal, NumberSignal, SensitiveAction, SimSwapSignal } from "@/lib/smart-guard/types";

export interface DeviceCoords {
  lat: number;
  lng: number;
}

export interface CamaraBundle {
  simSwap: SimSwapSignal;
  deviceSwap: DeviceSwapSignal;
  location: LocationSignal;
  number: NumberSignal;
  traces: NacCallTrace[];
  store: DeviceCoords | null;
}

function hoursSince(iso: string | null | undefined) {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, (Date.now() - at) / 36e5);
}

/**
 * Nokia Network-as-Code adapters. Smart Guard calls SIM Swap, Device Swap,
 * Number Verification, and Location Verification. Simulator is used until
 * NAC_API_KEY is set; request bodies stay CAMARA-shaped.
 */
export async function gatherCamaraSignals(input: {
  action: SensitiveAction;
  phone: string;
  email: string;
  store: DeviceCoords | null;
  forceNumberCheck: boolean;
}): Promise<CamaraBundle> {
  const traces: NacCallTrace[] = [];
  const phone = input.phone;

  let simSwap: SimSwapSignal = { swapped: false, hoursAgo: null, recent: false, latestSimChange: null };
  let deviceSwap: DeviceSwapSignal = {
    swapped: false,
    hoursAgo: null,
    recent: false,
    latestDeviceChange: null,
  };
  if (phone) {
    const check = await nacCheckSimSwap(phone, input.email, SIM_SWAP_MAX_AGE_HOURS);
    const dated = await nacRetrieveSimSwapDate(phone, input.email);
    traces.push(check.trace, dated.trace);
    const hoursAgo = hoursSince(dated.latestSimChange);
    simSwap = {
      swapped: Boolean(check.swapped),
      hoursAgo,
      recent: Boolean(check.swapped),
      latestSimChange: dated.latestSimChange,
    };

    const deviceCheck = await nacCheckDeviceSwap(phone, input.email, DEVICE_SWAP_MAX_AGE_HOURS);
    const deviceDated = await nacRetrieveDeviceSwapDate(phone, input.email);
    traces.push(deviceCheck.trace, deviceDated.trace);
    const deviceHoursAgo = hoursSince(deviceDated.latestDeviceChange);
    deviceSwap = {
      swapped: Boolean(deviceCheck.swapped),
      hoursAgo: deviceHoursAgo,
      recent: Boolean(deviceCheck.swapped),
      latestDeviceChange: deviceDated.latestDeviceChange,
    };
  }

  let number: NumberSignal = { verified: false };
  if (!phone) {
    number = { verified: false };
  } else if (sessionStepUpVerified(input.email) || (!input.forceNumberCheck && sessionNumberVerified(input.email))) {
    number = { verified: true };
  } else {
    const nv = await nacVerifyNumber(phone, input.email);
    traces.push(nv.trace);
    number = { verified: Boolean(nv.devicePhoneNumberVerified) };
  }

  let location: LocationSignal = { match: true, reason: "not_required", verificationResult: null };
  if (isLocationBound(input.action)) {
    if (!phone) {
      location = { match: null, reason: "missing_phone", verificationResult: null };
    } else {
      const loc = await nacVerifyLocation(phone, input.email, input.store ?? { lat: 31.5017, lng: 34.4668 });
      traces.push(loc.trace);
      location = {
        match: loc.verificationResult === "TRUE" ? true : loc.verificationResult === "FALSE" ? false : null,
        reason:
          loc.verificationResult === "TRUE"
            ? "inside_store_geofence"
            : loc.verificationResult === "PARTIAL"
              ? "near_store_geofence"
              : "outside_store_geofence",
        verificationResult: loc.verificationResult,
        lastLocationTime: loc.lastLocationTime,
        matchRate: loc.matchRate ?? null,
      };
    }
  }

  return { simSwap, deviceSwap, location, number, traces, store: input.store };
}
