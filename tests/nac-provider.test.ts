import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapLiveLocationVerify,
  mapLiveNumberVerify,
  mapLiveSimSwapCheck,
} from "@/server/smart-guard/nac-live-mapper";
import { nacEffectiveMode } from "@/server/smart-guard/nac-client";
import { NacProviderError, NOKIA_LIVE_ENDPOINTS, providerLogLine } from "@/shared/contracts/nac-provider";

describe("Nokia provider adapter", () => {
  it("NAC_API_KEY absent → nacEffectiveMode is simulator", () => {
    const prevKey = process.env.NAC_API_KEY;
    delete process.env.NAC_API_KEY;
    try {
      assert.equal(nacEffectiveMode(), "simulator");
    } finally {
      if (prevKey === undefined) delete process.env.NAC_API_KEY;
      else process.env.NAC_API_KEY = prevKey;
    }
  });

  it("maps live Nokia JSON to Smart Guard contract without inventing fields", () => {
    assert.deepEqual(mapLiveSimSwapCheck({ swapped: true }), { swapped: true });
    assert.deepEqual(mapLiveNumberVerify({ devicePhoneNumberVerified: false }), {
      devicePhoneNumberVerified: false,
    });
    const loc = mapLiveLocationVerify({
      verificationResult: "PARTIAL",
      lastLocationTime: "2026-01-01T00:00:00.000Z",
      matchRate: 58,
    });
    assert.equal(loc.verificationResult, "PARTIAL");
    assert.equal(loc.matchRate, 58);
  });

  it("401/403/404 on Number Verification are recoverable — step-up, not fake success", () => {
    const err = new NacProviderError({
      kind: "auth",
      status: 403,
      endpoint: NOKIA_LIVE_ENDPOINTS.numberVerify,
      api: "number-verification",
      latencyMs: 12,
      request: { phoneNumber: "+99999991001" },
    });
    assert.equal(err.recoverableForNumberVerification(), true);
    assert.equal(err.trace.provider?.outcome, "auth");
    assert.equal(err.trace.mode, "live");
  });

  it("404 on Number Verification is recoverable; SIM swap provider errors are not", () => {
    const nv = new NacProviderError({
      kind: "not_found",
      status: 404,
      endpoint: NOKIA_LIVE_ENDPOINTS.numberVerify,
      api: "number-verification",
      latencyMs: 5,
      request: {},
    });
    const sim = new NacProviderError({
      kind: "rate_limit",
      status: 429,
      endpoint: NOKIA_LIVE_ENDPOINTS.simSwapCheck,
      api: "sim-swap",
      latencyMs: 5,
      request: {},
    });
    assert.equal(nv.recoverableForNumberVerification(), true);
    assert.equal(sim.recoverableForNumberVerification(), false);
  });

  it("provider log line includes audit fields and never secrets", () => {
    const line = providerLogLine(
      {
        provider: "Nokia",
        transport: "RapidAPI",
        nacMode: "live",
        endpoint: NOKIA_LIVE_ENDPOINTS.simSwapCheck,
        status: 200,
        latencyMs: 42,
        outcome: "success",
        requestId: "corr-1",
      },
      "sim-swap",
    );
    assert.match(line, /nacMode=live/);
    assert.match(line, /provider=Nokia/);
    assert.match(line, /transport=RapidAPI/);
    assert.match(line, /endpoint=\/passthrough\/camara/);
    assert.match(line, /status=200/);
    assert.match(line, /latencyMs=42/);
    assert.doesNotMatch(line, /NAC_API_KEY|X-RapidAPI-Key/);
  });
});
