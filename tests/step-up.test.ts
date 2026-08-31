import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createNetworkChallenge, verifyNetworkChallenge } from "@/server/smart-guard/network-code";
import { resolveGuardIdentity, resolveStepUpIdentity } from "@/server/smart-guard/identity";
import { merchantRequest } from "./helpers";

describe("step-up codes", () => {
  it("accepts the correct code once and rejects replay", () => {
    const email = `replay-${Date.now()}@store.com`;
    const created = createNetworkChallenge(email, "+970599000001");
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.match(created.demoCode ?? "", /^\d{6}$/);

    const first = verifyNetworkChallenge(email, created.demoCode as string);
    assert.equal(first.ok, true);

    const second = verifyNetworkChallenge(email, created.demoCode as string);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.error, "missing");
  });

  it("rejects a wrong code", () => {
    const email = `wrong-${Date.now()}@store.com`;
    const created = createNetworkChallenge(email, "+970599000002");
    assert.equal(created.ok, true);
    const check = verifyNetworkChallenge(email, "000000");
    assert.equal(check.ok, false);
    if (!check.ok) assert.equal(check.error, "mismatch");
  });

  it("binds step-up send identity to the session when present", async () => {
    const request = await merchantRequest("http://localhost:3000/api/smart-guard/step-up/send", {
      method: "POST",
      email: "alice@store.com",
      body: JSON.stringify({ action: "file_upload", email: "bob@store.com" }),
    });
    const resolved = await resolveStepUpIdentity(request, { action: "file_upload", email: "bob@store.com" });
    assert.equal(resolved.email, "alice@store.com");
  });

  it("allows pre-auth login step-up to use body.email when there is no session", async () => {
    const request = new Request("http://localhost:3000/api/smart-guard/step-up/verify", {
      method: "POST",
      headers: { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json" },
      body: "{}",
    });
    const resolved = await resolveGuardIdentity(request, { action: "login", email: "login-user@store.com" });
    assert.equal(resolved.email, "login-user@store.com");
    assert.equal(resolved.session, null);
  });
});
