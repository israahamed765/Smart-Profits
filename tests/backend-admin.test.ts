import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { POST as nextAdminLogin } from "@/app/api/admin/login/route";
import { GET as nextAdminMe } from "@/app/api/admin/me/route";
import { POST as backendAdminLogin } from "@/backend/src/http/admin-login";
import { GET as backendAdminMe } from "@/backend/src/http/admin-me";
import { POST as backendAdminLogout } from "@/backend/src/http/admin-logout";
import { GET as backendAdminSnapshot } from "@/backend/src/http/admin-snapshot";
import { POST as backendAdminUsers } from "@/backend/src/http/admin-users";
import { GET as backendWorkspace } from "@/backend/src/http/workspace-get";
import { createBackendServer } from "@/backend/src/http/server";
import { bindRepoRoot } from "@/backend/src/config/paths";
import { createAdminToken, createMerchantToken } from "@/server/crypto/session-core";
import { merchantRequest } from "./helpers";

bindRepoRoot();

const FRONTEND = "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@test.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AdminTestPass123!";
const ADMIN_NAME = process.env.ADMIN_NAME || "Test Admin";

let seq = 0;
function ipHeaders() {
  seq += 1;
  return { "x-forwarded-for": `198.51.100.${(seq % 200) + 1}` };
}

function cookieHeader(response: Response) {
  const list = response.headers.getSetCookie?.() ?? [];
  return list[0] || response.headers.get("set-cookie") || "";
}

function tokenFrom(header: string, name: string) {
  const match = new RegExp(`(?:^|,\\s*)${name}=([^;]*)`).exec(header);
  return match ? decodeURIComponent(match[1]) : "";
}

async function listen(server: ReturnType<typeof createBackendServer>) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return addr.port;
}

async function adminLoginRequest() {
  return merchantRequest("http://localhost:3000/api/admin/login", {
    method: "POST",
    headers: ipHeaders(),
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
}

describe("P12.4 admin boundary", () => {
  it("wrong password and non-admin email are 401 with the same message; no secrets in the body", async () => {
    const wrong = await backendAdminLogin(
      await merchantRequest("http://localhost:3000/api/admin/login", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ email: ADMIN_EMAIL, password: "not-the-admin-password" }),
      }),
    );
    const merchantTry = await backendAdminLogin(
      await merchantRequest("http://localhost:3000/api/admin/login", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ email: "merchant@store.test", password: "Secret#123" }),
      }),
    );
    assert.equal(wrong.status, 401);
    assert.equal(merchantTry.status, 401);
    const wrongBody = (await wrong.json()) as Record<string, unknown>;
    const merchantBody = (await merchantTry.json()) as Record<string, unknown>;
    assert.equal(wrongBody.error, "بيانات دخول الإدارة غير صحيحة.");
    assert.equal(merchantBody.error, wrongBody.error);
    assert.equal("password" in wrongBody, false);
    assert.doesNotMatch(JSON.stringify(wrongBody), /ADMIN_PASSWORD|SESSION_SECRET|AdminTestPass/);
  });

  it("admin login 200 sets host-only HttpOnly Lax sp_admin; Next matches backend", async () => {
    const viaBackend = await backendAdminLogin(await adminLoginRequest());
    const viaNext = await nextAdminLogin(await adminLoginRequest());
    assert.equal(viaBackend.status, 200);
    assert.equal(viaNext.status, 200);
    const cookie = cookieHeader(viaBackend);
    assert.match(cookie, /sp_admin=/);
    assert.doesNotMatch(cookie, /sp_session=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.doesNotMatch(cookie, /SameSite=None/i);
    assert.doesNotMatch(cookie, /Domain=/i);
    const body = (await viaBackend.json()) as { admin?: { email?: string; name?: string }; password?: string };
    assert.equal(body.admin?.email, ADMIN_EMAIL);
    assert.equal(body.admin?.name, ADMIN_NAME);
    assert.equal("password" in body, false);
  });

  it("GET /api/admin/me: missing, forged, expired, and merchant cookies are 401", async () => {
    const none = await backendAdminMe(
      new Request(`${FRONTEND}/api/admin/me`, { headers: { host: "localhost:3000" } }),
    );
    const forged = await backendAdminMe(
      new Request(`${FRONTEND}/api/admin/me`, {
        headers: { host: "localhost:3000", cookie: "sp_admin=not-a-real-token" },
      }),
    );
    const expiredToken = await createAdminToken({ email: ADMIN_EMAIL, name: ADMIN_NAME }, Date.now() - 1000);
    const expired = await backendAdminMe(
      new Request(`${FRONTEND}/api/admin/me`, {
        headers: { host: "localhost:3000", cookie: `sp_admin=${expiredToken}` },
      }),
    );
    const merchantToken = await createMerchantToken({ email: "merchant-admin-idor@test.com", fullName: "Merchant" });
    const merchant = await backendAdminMe(
      new Request(`${FRONTEND}/api/admin/me`, {
        headers: { host: "localhost:3000", cookie: `sp_session=${merchantToken}` },
      }),
    );
    assert.equal(none.status, 401);
    assert.equal(forged.status, 401);
    assert.equal(expired.status, 401);
    assert.equal(merchant.status, 401);
    assert.equal(
      (await nextAdminMe(new Request(`${FRONTEND}/api/admin/me`, { headers: { host: "localhost:3000" } }))).status,
      401,
    );
    const message = ((await none.json()) as { error?: string }).error;
    assert.equal(message, "غير مصرح. سجّلي دخول الإدارة.");
  });

  it("admin cookie does not grant merchant workspace; logout clears only sp_admin", async () => {
    const login = await backendAdminLogin(await adminLoginRequest());
    const adminToken = tokenFrom(cookieHeader(login), "sp_admin");
    assert.ok(adminToken);

    const me = await backendAdminMe(
      new Request(`${FRONTEND}/api/admin/me`, {
        headers: { host: "localhost:3000", cookie: `sp_admin=${adminToken}` },
      }),
    );
    assert.equal(me.status, 200);
    assert.equal(((await me.json()) as { admin?: { email?: string } }).admin?.email, ADMIN_EMAIL);

    const workspace = await backendWorkspace(
      new Request(`${FRONTEND}/api/workspace`, {
        headers: { host: "localhost:3000", cookie: `sp_admin=${adminToken}` },
      }),
    );
    assert.equal(workspace.status, 401);

    const snapshot = await backendAdminSnapshot(
      new Request(`${FRONTEND}/api/admin/snapshot`, {
        headers: { host: "localhost:3000", cookie: `sp_admin=${adminToken}` },
      }),
    );
    assert.equal(snapshot.status, 200);
    const snapBody = (await snapshot.json()) as { users?: unknown; events?: unknown };
    assert.equal(Array.isArray(snapBody.users), true);
    assert.doesNotMatch(JSON.stringify(snapBody), /ADMIN_PASSWORD|SESSION_SECRET|scrypt\$/);

    const merchantToken = await createMerchantToken({ email: "merchant-vs-users@test.com", fullName: "M" });
    const usersAsMerchant = await backendAdminUsers(
      await merchantRequest("http://localhost:3000/api/admin/users", {
        method: "POST",
        headers: { cookie: `sp_session=${merchantToken}`, ...ipHeaders() },
        body: JSON.stringify({ email: "victim@test.com", status: "inactive" }),
      }),
    );
    assert.equal(usersAsMerchant.status, 401);

    const logout = await backendAdminLogout(
      await merchantRequest("http://localhost:3000/api/admin/logout", { method: "POST", headers: ipHeaders() }),
    );
    assert.equal(logout.status, 200);
    const cleared = cookieHeader(logout);
    assert.match(cleared, /sp_admin=/);
    assert.match(cleared, /Max-Age=0/i);
    assert.doesNotMatch(cleared, /sp_session=/);
  });

  it("CSRF: admin login without Origin or with evil Origin is 403", async () => {
    const missing = await backendAdminLogin(
      new Request(`${FRONTEND}/api/admin/login`, {
        method: "POST",
        headers: { host: "localhost:3000", "content-type": "application/json", ...ipHeaders() },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      }),
    );
    const evil = await backendAdminLogin(
      new Request(`${FRONTEND}/api/admin/login`, {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "https://evil.example",
          "content-type": "application/json",
          ...ipHeaders(),
        },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      }),
    );
    assert.equal(missing.status, 403);
    assert.equal(evil.status, 403);
  });

  it("standalone backend: login → me → snapshot → users → logout → me 401", async () => {
    const server = createBackendServer();
    const port = await listen(server);
    const origin = FRONTEND;
    try {
      const login = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", ...ipHeaders() },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      });
      assert.equal(login.status, 200);
      assert.equal(login.headers.get("access-control-allow-origin"), origin);
      const token = tokenFrom(cookieHeader(login), "sp_admin");
      assert.ok(token);

      const me = await fetch(`http://127.0.0.1:${port}/api/admin/me`, {
        headers: { origin, cookie: `sp_admin=${token}` },
      });
      assert.equal(me.status, 200);

      const snapshot = await fetch(`http://127.0.0.1:${port}/api/admin/snapshot`, {
        headers: { origin, cookie: `sp_admin=${token}` },
      });
      assert.equal(snapshot.status, 200);

      const users = await fetch(`http://127.0.0.1:${port}/api/admin/users`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", cookie: `sp_admin=${token}`, ...ipHeaders() },
        body: JSON.stringify({ email: "p124-admin-patch@test.com", plan: "free" }),
      });
      assert.equal(users.status, 200);

      const merchantToken = await createMerchantToken({ email: "p124-merchant@test.com", fullName: "M" });
      const meAsMerchant = await fetch(`http://127.0.0.1:${port}/api/admin/me`, {
        headers: { origin, cookie: `sp_session=${merchantToken}` },
      });
      assert.equal(meAsMerchant.status, 401);

      const logout = await fetch(`http://127.0.0.1:${port}/api/admin/logout`, {
        method: "POST",
        headers: { origin, ...ipHeaders() },
      });
      assert.equal(logout.status, 200);
      assert.match(cookieHeader(logout), /Max-Age=0/i);

      const meAfter = await fetch(`http://127.0.0.1:${port}/api/admin/me`, { headers: { origin } });
      assert.equal(meAfter.status, 401);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
