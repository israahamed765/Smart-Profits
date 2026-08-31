import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { GET as nextNacCatalog } from "@/app/api/nac/route";
import { GET as backendNacCatalog } from "@/backend/src/http/nac-catalog";
import { POST as backendMockGate } from "@/backend/src/http/nac-mock-gate";
import { POST as backendSimSwapCheck } from "@/backend/src/http/nac-sim-swap-check";
import { POST as backendSimSwapDate } from "@/backend/src/http/nac-sim-swap-date";
import { POST as backendNumberVerify } from "@/backend/src/http/nac-number-verify";
import { POST as backendLocationVerify } from "@/backend/src/http/nac-location-verify";
import { POST as backendEvaluate } from "@/backend/src/http/guard-evaluate";
import { createBackendServer } from "@/backend/src/http/server";
import { bindRepoRoot } from "@/backend/src/config/paths";
import { guardApi } from "@/backend/src/services/guard";
import { createMerchantToken } from "@/server/crypto/session-core";
import { merchantRequest } from "./helpers";

bindRepoRoot();

const FRONTEND = "http://localhost:3000";
const DENY = "+99999991000";
const ALLOW = "+99999991001";
const STEP = "+99999991002";

let seq = 0;
function ipHeaders() {
  seq += 1;
  return { "x-forwarded-for": `198.51.100.${(seq % 200) + 1}` };
}

async function listen(server: ReturnType<typeof createBackendServer>) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return addr.port;
}

function jsonBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("P12.6 NAC boundary", () => {
  it("GET /api/nac catalog needs no auth and matches Next", async () => {
    const viaBackend = await backendNacCatalog(
      new Request(`${FRONTEND}/api/nac`, { headers: { host: "localhost:3000" } }),
    );
    const viaNext = await nextNacCatalog(
      new Request(`${FRONTEND}/api/nac`, { headers: { host: "localhost:3000" } }),
    );
    assert.equal(viaBackend.status, 200);
    assert.equal(viaNext.status, 200);
    const body = await jsonBody(viaBackend);
    assert.equal(body.mode, "simulator");
    assert.equal(Array.isArray(body.numbers), true);
    assert.doesNotMatch(JSON.stringify(body), /X-RapidAPI-Key|SESSION_SECRET=|ADMIN_PASSWORD=|postgresql:\/\//);
  });

  it("CAMARA check succeeds without a session; forged cookies are ignored", async () => {
    const none = await backendSimSwapCheck(
      await merchantRequest("http://localhost:3000/api/nac/sim-swap/v1/check", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ phoneNumber: ALLOW, maxAge: 24 }),
      }),
    );
    const forged = await backendSimSwapCheck(
      await merchantRequest("http://localhost:3000/api/nac/sim-swap/v1/check", {
        method: "POST",
        headers: { cookie: "sp_session=not-a-token", ...ipHeaders() },
        body: JSON.stringify({ phoneNumber: ALLOW, maxAge: 24 }),
      }),
    );
    assert.equal(none.status, 200);
    assert.equal(forged.status, 200);
    assert.equal((await jsonBody(none)).swapped, false);
  });

  it("missing CAMARA fields are 400, not allow", async () => {
    const check = await backendSimSwapCheck(
      await merchantRequest("http://localhost:3000/api/nac/sim-swap/v1/check", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({}),
      }),
    );
    const date = await backendSimSwapDate(
      await merchantRequest("http://localhost:3000/api/nac/sim-swap/v1/retrieve-date", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({}),
      }),
    );
    const number = await backendNumberVerify(
      await merchantRequest("http://localhost:3000/api/nac/number-verification/v1/verify", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({}),
      }),
    );
    const location = await backendLocationVerify(
      await merchantRequest("http://localhost:3000/api/nac/location-verification/v1/verify", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ device: {}, area: {} }),
      }),
    );
    assert.equal(check.status, 400);
    assert.equal(date.status, 400);
    assert.equal(number.status, 400);
    assert.equal(location.status, 400);
    assert.equal((await jsonBody(check)).error, "phoneNumber is required");
    assert.equal((await jsonBody(location)).error, "device.phoneNumber and area.center are required");
  });

  it("valid CAMARA retrieve-date, number, and location keep previous shapes", async () => {
    const date = await backendSimSwapDate(
      await merchantRequest("http://localhost:3000/api/nac/sim-swap/v1/retrieve-date", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ phoneNumber: DENY }),
      }),
    );
    const number = await backendNumberVerify(
      await merchantRequest("http://localhost:3000/api/nac/number-verification/v1/verify", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ phoneNumber: ALLOW }),
      }),
    );
    const location = await backendLocationVerify(
      await merchantRequest("http://localhost:3000/api/nac/location-verification/v1/verify", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({
          device: { phoneNumber: STEP },
          area: { areaType: "CIRCLE", center: { latitude: 31.5017, longitude: 34.4668 }, radius: 2000 },
        }),
      }),
    );
    assert.equal(date.status, 200);
    assert.equal(number.status, 200);
    assert.equal(location.status, 200);
    const dateBody = await jsonBody(date);
    const numberBody = await jsonBody(number);
    const locBody = await jsonBody(location);
    assert.equal(typeof dateBody.latestSimChange, "string");
    assert.equal(numberBody.devicePhoneNumberVerified, true);
    assert.equal(locBody.verificationResult, "PARTIAL");
  });

  it("mock gate dummy numbers: allow / freeze / step_up — never fail-open", async () => {
    const allow = await backendMockGate(
      await merchantRequest("http://localhost:3000/api/nac/mock/gate", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ phoneNumber: ALLOW, action: "file_upload" }),
      }),
    );
    const deny = await backendMockGate(
      await merchantRequest("http://localhost:3000/api/nac/mock/gate", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ phoneNumber: DENY, action: "file_upload" }),
      }),
    );
    const step = await backendMockGate(
      await merchantRequest("http://localhost:3000/api/nac/mock/gate", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ phoneNumber: STEP, action: "file_upload" }),
      }),
    );
    assert.equal(allow.status, 200);
    assert.equal(deny.status, 200);
    assert.equal(step.status, 200);
    const allowBody = await jsonBody(allow);
    const denyBody = await jsonBody(deny);
    const stepBody = await jsonBody(step);
    assert.equal(allowBody.decision, "allow");
    assert.equal(allowBody.allowed, true);
    assert.equal(denyBody.decision, "freeze");
    assert.equal(denyBody.allowed, false);
    assert.notEqual(denyBody.decision, "allow");
    assert.equal(stepBody.decision, "step_up");
    assert.equal(stepBody.gate, "step_up");
  });

  it("mock gate missing phone or unknown action is 400", async () => {
    const missing = await backendMockGate(
      await merchantRequest("http://localhost:3000/api/nac/mock/gate", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ action: "file_upload" }),
      }),
    );
    const unknown = await backendMockGate(
      await merchantRequest("http://localhost:3000/api/nac/mock/gate", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ phoneNumber: ALLOW, action: "wire_transfer" }),
      }),
    );
    assert.equal(missing.status, 400);
    assert.equal(unknown.status, 400);
    assert.equal((await jsonBody(missing)).error, "phoneNumber is required.");
    assert.equal((await jsonBody(unknown)).error, "Unknown action.");
  });

  it("malformed JSON on mock gate is 500, not allow", async () => {
    const response = await backendMockGate(
      await merchantRequest("http://localhost:3000/api/nac/mock/gate", {
        method: "POST",
        headers: ipHeaders(),
        body: "{not-json",
      }),
    );
    assert.equal(response.status, 500);
    const body = await jsonBody(response);
    assert.equal(body.error, "Nokia mock gate failed.");
    assert.notEqual(body.decision, "allow");
  });

  it("NAC POST without Origin keeps the previous skip; Guard POST still 403", async () => {
    const nac = await backendSimSwapCheck(
      new Request(`${FRONTEND}/api/nac/sim-swap/v1/check`, {
        method: "POST",
        headers: { host: "localhost:3000", "content-type": "application/json", ...ipHeaders() },
        body: JSON.stringify({ phoneNumber: ALLOW }),
      }),
    );
    const token = await createMerchantToken({ email: "p126-csrf@test.com", fullName: "Csrf" });
    const guard = await backendEvaluate(
      new Request(`${FRONTEND}/api/smart-guard/evaluate`, {
        method: "POST",
        headers: {
          host: "localhost:3000",
          "content-type": "application/json",
          cookie: `sp_session=${token}`,
          ...ipHeaders(),
        },
        body: JSON.stringify({ action: "file_upload" }),
      }),
    );
    assert.equal(nac.status, 200);
    assert.equal(guard.status, 403);
  });

  it("Smart Guard still fail-closes when a NAC dependency throws", async () => {
    const restore = mock.method(guardApi, "evaluateSensitiveAction", async () => {
      throw new Error("nac timeout");
    });
    try {
      const token = await createMerchantToken({ email: "p126-failclose@test.com", fullName: "Fail" });
      const response = await backendEvaluate(
        await merchantRequest("http://localhost:3000/api/smart-guard/evaluate", {
          method: "POST",
          headers: { cookie: `sp_session=${token}`, ...ipHeaders() },
          body: JSON.stringify({ action: "file_upload" }),
        }),
      );
      assert.equal(response.status, 503);
      const body = (await response.json()) as { verdict?: { decision?: string; reason?: string } };
      assert.equal(body.verdict?.decision, "freeze");
      assert.equal(body.verdict?.reason, "check_failed");
      assert.notEqual(body.verdict?.decision, "allow");
    } finally {
      restore.mock.restore();
    }
  });

  it("standalone backend CORS: allowed origin echoed, foreign OPTIONS 403, never *", async () => {
    const server = createBackendServer();
    const port = await listen(server);
    const origin = FRONTEND;
    try {
      const catalog = await fetch(`http://127.0.0.1:${port}/api/nac`, { headers: { origin } });
      assert.equal(catalog.status, 200);
      assert.equal(catalog.headers.get("access-control-allow-origin"), origin);
      assert.equal(catalog.headers.get("access-control-allow-credentials"), "true");

      const check = await fetch(`http://127.0.0.1:${port}/api/nac/sim-swap/v1/check`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", ...ipHeaders() },
        body: JSON.stringify({ phoneNumber: DENY, maxAge: 24 }),
      });
      assert.equal(check.status, 200);
      assert.equal((await check.json()).swapped, true);
      assert.equal(check.headers.get("access-control-allow-origin"), origin);

      const gate = await fetch(`http://127.0.0.1:${port}/api/nac/mock/gate`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", ...ipHeaders() },
        body: JSON.stringify({ phoneNumber: DENY, action: "file_upload" }),
      });
      assert.equal(gate.status, 200);
      const gateBody = (await gate.json()) as { decision?: string };
      assert.equal(gateBody.decision, "freeze");

      const preflight = await fetch(`http://127.0.0.1:${port}/api/nac/mock/gate`, {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "POST" },
      });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get("access-control-allow-origin"), origin);

      const evilPreflight = await fetch(`http://127.0.0.1:${port}/api/nac/mock/gate`, {
        method: "OPTIONS",
        headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
      });
      assert.equal(evilPreflight.status, 403);
      assert.equal(evilPreflight.headers.get("access-control-allow-origin"), null);
      assert.notEqual(catalog.headers.get("access-control-allow-origin"), "*");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
