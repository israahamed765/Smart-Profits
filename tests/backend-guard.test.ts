import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { POST as nextEvaluate } from "@/app/api/smart-guard/evaluate/route";
import { GET as nextLogs } from "@/app/api/smart-guard/logs/route";
import { POST as backendEvaluate } from "@/backend/src/http/guard-evaluate";
import { GET as backendLogs } from "@/backend/src/http/guard-logs";
import { GET as backendDemoGet, POST as backendDemoPost } from "@/backend/src/http/guard-demo";
import { POST as backendStepUpSend } from "@/backend/src/http/guard-stepup-send";
import { POST as backendStepUpVerify } from "@/backend/src/http/guard-stepup-verify";
import { POST as backendRegister } from "@/backend/src/http/auth-register";
import { createBackendServer } from "@/backend/src/http/server";
import { bindRepoRoot } from "@/backend/src/config/paths";
import { guardApi } from "@/backend/src/services/guard";
import { createMerchantToken } from "@/server/crypto/session-core";
import { merchantRequest } from "./helpers";

bindRepoRoot();

const FRONTEND = "http://localhost:3000";
let seq = 0;

function uniqueMerchant() {
  seq += 1;
  const stamp = `${Date.now()}${seq}`.slice(-7);
  return {
    fullName: "P125 Merchant",
    storeName: "P125 Store",
    email: `p125-${Date.now()}-${seq}@test.com`,
    phone: `+97059${stamp}`,
    password: "Secret#123",
  };
}

function ipHeaders() {
  seq += 1;
  return { "x-forwarded-for": `198.51.100.${(seq % 200) + 1}` };
}

function cookieHeader(response: Response) {
  const list = response.headers.getSetCookie?.() ?? [];
  return list[0] || response.headers.get("set-cookie") || "";
}

function sessionFromSetCookie(header: string) {
  const match = /(?:^|,\s*)sp_session=([^;]*)/.exec(header);
  return match ? decodeURIComponent(match[1]) : "";
}

async function registerMerchant() {
  const merchant = uniqueMerchant();
  const response = await backendRegister(
    await merchantRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: ipHeaders(),
      body: JSON.stringify(merchant),
    }),
  );
  assert.equal(response.status, 200);
  const token = sessionFromSetCookie(cookieHeader(response));
  assert.ok(token);
  return { merchant, token };
}

async function listen(server: ReturnType<typeof createBackendServer>) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return addr.port;
}

describe("P12.5 Smart Guard + Step-Up boundary", () => {
  it("evaluate without a session is 401", async () => {
    const response = await backendEvaluate(
      await merchantRequest("http://localhost:3000/api/smart-guard/evaluate", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ action: "file_upload" }),
      }),
    );
    assert.equal(response.status, 401);
    const body = (await response.json()) as { error?: string; verdict?: { decision?: string } };
    assert.equal(body.error, "يجب تسجيل الدخول أولاً.");
    assert.notEqual(body.verdict?.decision, "allow");
  });

  it("evaluate with a valid session returns the previous allow contract", async () => {
    const { merchant } = await registerMerchant();
    const viaBackend = await backendEvaluate(
      await merchantRequest("http://localhost:3000/api/smart-guard/evaluate", {
        method: "POST",
        email: merchant.email,
        headers: ipHeaders(),
        body: JSON.stringify({ action: "file_upload" }),
      }),
    );
    const viaNext = await nextEvaluate(
      await merchantRequest("http://localhost:3000/api/smart-guard/evaluate", {
        method: "POST",
        email: merchant.email,
        headers: ipHeaders(),
        body: JSON.stringify({ action: "file_upload" }),
      }),
    );
    assert.equal(viaBackend.status, 200);
    assert.equal(viaNext.status, 200);
    const body = (await viaBackend.json()) as { verdict?: { decision?: string; action?: string } };
    assert.equal(body.verdict?.decision, "allow");
    assert.equal(body.verdict?.action, "file_upload");
  });

  it("unknown or missing action is 400, not allow", async () => {
    const { merchant } = await registerMerchant();
    const missing = await backendEvaluate(
      await merchantRequest("http://localhost:3000/api/smart-guard/evaluate", {
        method: "POST",
        email: merchant.email,
        headers: ipHeaders(),
        body: JSON.stringify({ email: merchant.email }),
      }),
    );
    const unknown = await backendEvaluate(
      await merchantRequest("http://localhost:3000/api/smart-guard/evaluate", {
        method: "POST",
        email: merchant.email,
        headers: ipHeaders(),
        body: JSON.stringify({ action: "wire_transfer" }),
      }),
    );
    assert.equal(missing.status, 400);
    assert.equal(unknown.status, 400);
    const missingBody = (await missing.json()) as { error?: string; verdict?: { decision?: string } };
    const unknownBody = (await unknown.json()) as { error?: string; verdict?: { decision?: string } };
    assert.equal(missingBody.error, "إجراء غير صالح.");
    assert.equal(unknownBody.error, "إجراء غير صالح.");
    assert.notEqual(missingBody.verdict?.decision, "allow");
    assert.notEqual(unknownBody.verdict?.decision, "allow");
  });

  it("dependency failure fail-closes to freeze + check_failed (503)", async () => {
    const restore = mock.method(guardApi, "evaluateSensitiveAction", async () => {
      throw new Error("dependency down");
    });
    try {
      const token = await createMerchantToken({ email: "p125-failclose@test.com", fullName: "Fail" });
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
    } finally {
      restore.mock.restore();
    }
  });

  it("logs without auth is 401; GET without Origin is not CSRF-rejected", async () => {
    const none = await backendLogs(
      new Request(`${FRONTEND}/api/smart-guard/logs`, { headers: { host: "localhost:3000" } }),
    );
    assert.equal(none.status, 401);
    assert.equal(((await none.json()) as { error?: string }).error, "يجب تسجيل الدخول أولاً.");
    assert.equal(
      (await nextLogs(new Request(`${FRONTEND}/api/smart-guard/logs`, { headers: { host: "localhost:3000" } }))).status,
      401,
    );
  });

  it("demo GET/POST require the merchant session", async () => {
    const getAnon = await backendDemoGet(
      new Request(`${FRONTEND}/api/smart-guard/demo`, { headers: { host: "localhost:3000" } }),
    );
    const postAnon = await backendDemoPost(
      await merchantRequest("http://localhost:3000/api/smart-guard/demo", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ simSwapRecent: true }),
      }),
    );
    assert.equal(getAnon.status, 401);
    assert.equal(postAnon.status, 401);

    const { merchant } = await registerMerchant();
    const getAuthed = await backendDemoGet(
      new Request(`${FRONTEND}/api/smart-guard/demo`, {
        headers: {
          host: "localhost:3000",
          cookie: `sp_session=${await createMerchantToken({ email: merchant.email, fullName: merchant.fullName })}`,
        },
      }),
    );
    const postAuthed = await backendDemoPost(
      await merchantRequest("http://localhost:3000/api/smart-guard/demo", {
        method: "POST",
        email: merchant.email,
        headers: ipHeaders(),
        body: JSON.stringify({ simSwapRecent: true, locationOutside: false, numberMatch: true }),
      }),
    );
    assert.equal(getAuthed.status, 200);
    assert.equal(postAuthed.status, 200);
    const saved = (await postAuthed.json()) as { ok?: boolean; flags?: { simSwapRecent?: boolean } };
    assert.equal(saved.ok, true);
    assert.equal(saved.flags?.simSwapRecent, true);
  });

  it("step-up send without a session keeps the previous pre-auth contract", async () => {
    const loginMissingEmail = await backendStepUpSend(
      await merchantRequest("http://localhost:3000/api/smart-guard/step-up/send", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ action: "login" }),
      }),
    );
    const sensitive = await backendStepUpSend(
      await merchantRequest("http://localhost:3000/api/smart-guard/step-up/send", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ action: "file_upload", email: "victim@store.com" }),
      }),
    );
    assert.equal(loginMissingEmail.status, 400);
    assert.equal(((await loginMissingEmail.json()) as { error?: string }).error, "البريد مطلوب لهذا الإجراء.");
    assert.equal(sensitive.status, 401);
    assert.equal(((await sensitive.json()) as { error?: string }).error, "يجب تسجيل الدخول أولاً.");
  });

  it("step-up send with a session uses session.email, not body.email", async () => {
    const { merchant } = await registerMerchant();
    const response = await backendStepUpSend(
      await merchantRequest("http://localhost:3000/api/smart-guard/step-up/send", {
        method: "POST",
        email: merchant.email,
        headers: ipHeaders(),
        body: JSON.stringify({
          action: "file_upload",
          email: "victim-p125@store.com",
        }),
      }),
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok?: boolean; demoCode?: string; maskedPhone?: string };
    assert.equal(body.ok, true);
    assert.match(body.demoCode ?? "", /^\d{6}$/);
    assert.match(body.maskedPhone ?? "", /\*\*\*\*/);
  });

  it("OTP is accepted once, then replay and wrong codes are rejected", async () => {
    const { merchant } = await registerMerchant();
    const send = await backendStepUpSend(
      await merchantRequest("http://localhost:3000/api/smart-guard/step-up/send", {
        method: "POST",
        email: merchant.email,
        headers: ipHeaders(),
        body: JSON.stringify({ action: "file_upload" }),
      }),
    );
    assert.equal(send.status, 200);
    const sent = (await send.json()) as { demoCode?: string };
    assert.match(sent.demoCode ?? "", /^\d{6}$/);

    const first = await backendStepUpVerify(
      await merchantRequest("http://localhost:3000/api/smart-guard/step-up/verify", {
        method: "POST",
        email: merchant.email,
        headers: ipHeaders(),
        body: JSON.stringify({ action: "file_upload", code: sent.demoCode }),
      }),
    );
    assert.equal(first.status, 200);
    const firstBody = (await first.json()) as { ok?: boolean; verdict?: { decision?: string } };
    assert.equal(firstBody.ok, true);
    assert.ok(firstBody.verdict);

    const replay = await backendStepUpVerify(
      await merchantRequest("http://localhost:3000/api/smart-guard/step-up/verify", {
        method: "POST",
        email: merchant.email,
        headers: ipHeaders(),
        body: JSON.stringify({ action: "file_upload", code: sent.demoCode }),
      }),
    );
    assert.equal(replay.status, 403);

    const { merchant: other } = await registerMerchant();
    const otherSend = await backendStepUpSend(
      await merchantRequest("http://localhost:3000/api/smart-guard/step-up/send", {
        method: "POST",
        email: other.email,
        headers: ipHeaders(),
        body: JSON.stringify({ action: "file_upload" }),
      }),
    );
    assert.equal(otherSend.status, 200);
    const wrong = await backendStepUpVerify(
      await merchantRequest("http://localhost:3000/api/smart-guard/step-up/verify", {
        method: "POST",
        email: other.email,
        headers: ipHeaders(),
        body: JSON.stringify({ action: "file_upload", code: "000000" }),
      }),
    );
    assert.equal(wrong.status, 403);
  });

  it("CSRF: evaluate POST without Origin or with an evil Origin is 403", async () => {
    const token = await createMerchantToken({ email: "p125-csrf@test.com", fullName: "Csrf" });
    const missing = await backendEvaluate(
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
    const evil = await backendEvaluate(
      new Request(`${FRONTEND}/api/smart-guard/evaluate`, {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "https://evil.example",
          "content-type": "application/json",
          cookie: `sp_session=${token}`,
          ...ipHeaders(),
        },
        body: JSON.stringify({ action: "file_upload" }),
      }),
    );
    assert.equal(missing.status, 403);
    assert.equal(evil.status, 403);
  });

  it("standalone backend CORS echoes the allowlisted origin and never uses *", async () => {
    const server = createBackendServer();
    const port = await listen(server);
    const origin = FRONTEND;
    try {
      const unauth = await fetch(`http://127.0.0.1:${port}/api/smart-guard/evaluate`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", ...ipHeaders() },
        body: JSON.stringify({ action: "file_upload" }),
      });
      assert.equal(unauth.status, 401);
      assert.equal(unauth.headers.get("access-control-allow-origin"), origin);
      assert.equal(unauth.headers.get("access-control-allow-credentials"), "true");
      assert.notEqual(unauth.headers.get("access-control-allow-origin"), "*");

      const { merchant, token } = await registerMerchant();
      const authed = await fetch(`http://127.0.0.1:${port}/api/smart-guard/evaluate`, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: `sp_session=${token}`,
          ...ipHeaders(),
        },
        body: JSON.stringify({ action: "file_upload" }),
      });
      assert.equal(authed.status, 200);
      assert.equal(authed.headers.get("access-control-allow-origin"), origin);
      const authedBody = (await authed.json()) as { verdict?: { decision?: string } };
      assert.equal(authedBody.verdict?.decision, "allow");

      const invalid = await fetch(`http://127.0.0.1:${port}/api/smart-guard/evaluate`, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: `sp_session=${token}`,
          ...ipHeaders(),
        },
        body: JSON.stringify({ action: "not-an-action" }),
      });
      assert.equal(invalid.status, 400);

      const logsGet = await fetch(`http://127.0.0.1:${port}/api/smart-guard/logs`, {
        headers: { cookie: `sp_session=${token}` },
      });
      assert.equal(logsGet.status, 200);

      const send = await fetch(`http://127.0.0.1:${port}/api/smart-guard/step-up/send`, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: `sp_session=${token}`,
          ...ipHeaders(),
        },
        body: JSON.stringify({ action: "file_upload", email: "ignored-victim@store.com" }),
      });
      assert.equal(send.status, 200);
      const sent = (await send.json()) as { demoCode?: string };
      const verify = await fetch(`http://127.0.0.1:${port}/api/smart-guard/step-up/verify`, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: `sp_session=${token}`,
          ...ipHeaders(),
        },
        body: JSON.stringify({ action: "file_upload", code: sent.demoCode }),
      });
      assert.equal(verify.status, 200);

      const csrf = await fetch(`http://127.0.0.1:${port}/api/smart-guard/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `sp_session=${token}`, ...ipHeaders() },
        body: JSON.stringify({ action: "file_upload" }),
      });
      assert.equal(csrf.status, 403);

      const preflight = await fetch(`http://127.0.0.1:${port}/api/smart-guard/evaluate`, {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "POST" },
      });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get("access-control-allow-origin"), origin);

      const evilPreflight = await fetch(`http://127.0.0.1:${port}/api/smart-guard/evaluate`, {
        method: "OPTIONS",
        headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
      });
      assert.equal(evilPreflight.status, 403);
      assert.equal(evilPreflight.headers.get("access-control-allow-origin"), null);

      void merchant;
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
