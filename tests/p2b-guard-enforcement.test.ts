import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { failClosedVerdict } from "@/server/smart-guard/fail-closed";
import { enforceAllow, GuardDeniedError, isGuardDeniedError, wrapGuardFailure } from "@/server/smart-guard/enforce";
import { allowSimulatorDemoCode, nacMode } from "@/server/smart-guard/nac-env";
import { createNetworkChallenge } from "@/server/smart-guard/network-code";

describe("Phase 2b Guard enforcement", () => {
  it("H11: dependency throw fail-closes to freeze + 503, never allow", () => {
    assert.throws(
      () => wrapGuardFailure("login", new Error("Could not read accounts from the database")),
      (error: unknown) => {
        assert.equal(isGuardDeniedError(error), true);
        const denied = error as GuardDeniedError;
        assert.equal(denied.status, 503);
        assert.equal(denied.verdict.decision, "freeze");
        assert.equal(denied.verdict.reason, "check_failed");
        return true;
      },
    );
  });

  it("H10: freeze and step_up do not proceed; allow does", () => {
    assert.throws(
      () =>
        enforceAllow({
          ...failClosedVerdict("file_upload"),
          decision: "freeze",
          reason: "sim_swap",
        }),
      (error: unknown) => {
        assert.equal(isGuardDeniedError(error), true);
        assert.equal((error as GuardDeniedError).status, 403);
        assert.equal((error as GuardDeniedError).verdict.decision, "freeze");
        return true;
      },
    );
    const allowed = enforceAllow({
      ...failClosedVerdict("login"),
      decision: "allow",
      reason: "clean",
    });
    assert.equal(allowed.decision, "allow");
  });

  it("H13: production without NAC_API_KEY is a configuration error, not simulator demoCode", () => {
    assert.equal(allowSimulatorDemoCode("production", ""), false);
    assert.throws(() => nacMode("production", ""), /NAC_API_KEY is required in production/);
    assert.equal(allowSimulatorDemoCode("test", ""), true);
    assert.equal(nacMode("test", ""), "simulator");
    assert.equal(nacMode("production", "live-key"), "live");
    assert.equal(allowSimulatorDemoCode("production", "live-key"), false);
    assert.equal(allowSimulatorDemoCode("development", "live-key"), true);
    assert.equal(allowSimulatorDemoCode("test", "live-key"), false);
  });

  it("H13: non-production simulator may still return demoCode", () => {
    const prevKey = process.env.NAC_API_KEY;
    delete process.env.NAC_API_KEY;
    try {
      assert.notEqual(process.env.NODE_ENV, "production");
      assert.equal(nacMode(), "simulator");
      const created = createNetworkChallenge(`demo-${Date.now()}@test.com`, "+970599000001");
      assert.equal(created.ok, true);
      if (created.ok) assert.match(created.demoCode ?? "", /^\d{6}$/);
    } finally {
      if (prevKey === undefined) delete process.env.NAC_API_KEY;
      else process.env.NAC_API_KEY = prevKey;
    }
  });
});
