import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decideSmartGuard } from "@/lib/smart-guard/policy";
import type { GuardInput } from "@/lib/smart-guard/types";
import { parseSensitiveAction } from "@/server/smart-guard/identity";
import { merchantRequest } from "./helpers";
import { POST } from "@/backend/src/http/guard-evaluate";

function baseInput(over: Partial<GuardInput> = {}): GuardInput {
  return {
    action: "file_upload",
    nacMode: "simulator",
    simSwap: { swapped: false, hoursAgo: null, recent: false, latestSimChange: null },
    deviceSwap: { swapped: false, hoursAgo: null, recent: false, latestDeviceChange: null },
    location: { match: true, reason: "ok", verificationResult: "TRUE", matchRate: 100 },
    number: { verified: true },
    merchant: {
      email: "a@b.com",
      phone: "+970599000000",
      alreadyFrozen: false,
      stepUpVerified: false,
      accountAgeHours: 100,
      suspicious: false,
    },
    ...over,
  };
}

describe("Smart Guard policy", () => {
  it("allows a clean file_upload", () => {
    const verdict = decideSmartGuard(baseInput());
    assert.equal(verdict.decision, "allow");
    assert.equal(verdict.action, "file_upload");
  });

  it("freezes on a recent SIM swap and does not allow", () => {
    const verdict = decideSmartGuard(
      baseInput({
        simSwap: { swapped: true, hoursAgo: 2, recent: true, latestSimChange: new Date().toISOString() },
      }),
    );
    assert.equal(verdict.decision, "freeze");
    assert.equal(verdict.reason, "sim_swap");
    assert.equal(verdict.inputs.triggers.sim_swap_detected, true);
    assert.equal(verdict.inputs.triggers.device_swap_detected, false);
    assert.notEqual(verdict.decision, "allow");
  });

  it("freezes on a recent device swap", () => {
    const verdict = decideSmartGuard(
      baseInput({
        deviceSwap: {
          swapped: true,
          hoursAgo: 2,
          recent: true,
          latestDeviceChange: new Date().toISOString(),
        },
      }),
    );
    assert.equal(verdict.decision, "freeze");
    assert.equal(verdict.reason, "device_swap");
    assert.equal(verdict.inputs.triggers.device_swap_detected, true);
    assert.equal(verdict.inputs.triggers.sim_swap_detected, false);
  });

  it("freezes when both SIM and device swap are recent", () => {
    const verdict = decideSmartGuard(
      baseInput({
        simSwap: { swapped: true, hoursAgo: 1, recent: true, latestSimChange: new Date().toISOString() },
        deviceSwap: {
          swapped: true,
          hoursAgo: 1,
          recent: true,
          latestDeviceChange: new Date().toISOString(),
        },
      }),
    );
    assert.equal(verdict.decision, "freeze");
    assert.equal(verdict.reason, "sim_swap");
    assert.equal(verdict.inputs.triggers.sim_swap_detected, true);
    assert.equal(verdict.inputs.triggers.device_swap_detected, true);
  });

  it("requires a valid sensitive action string", () => {
    assert.throws(() => parseSensitiveAction(""));
    assert.doesNotThrow(() => parseSensitiveAction("login"));
  });
});

describe("Smart Guard evaluate route", () => {
  it("does not fail-open in source: catch path freezes instead of allow", () => {
    const source = readFileSync(new URL("../backend/src/http/guard-evaluate.ts", import.meta.url), "utf8");
    const closed = readFileSync(new URL("../server/smart-guard/fail-closed.ts", import.meta.url), "utf8");
    assert.match(source, /blocking action/);
    assert.match(source, /failClosedVerdict/);
    assert.match(closed, /check_failed/);
    assert.match(closed, /decision: "freeze"/);
    assert.doesNotMatch(source, /allowing action/);
  });

  it("rejects a missing action with 400, not allow", async () => {
    const request = await merchantRequest("http://localhost:3000/api/smart-guard/evaluate", {
      method: "POST",
      email: "alice@store.com",
      body: JSON.stringify({ email: "alice@store.com" }),
    });
    const response = await POST(request);
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error?: string; verdict?: { decision: string } };
    assert.notEqual(body.verdict?.decision, "allow");
  });
});
