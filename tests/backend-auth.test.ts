import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { POST as nextLogin } from "@/app/api/auth/login/route";
import { GET as nextMe } from "@/app/api/auth/me/route";
import { POST as nextLogout } from "@/app/api/auth/logout/route";
import { POST as nextRegister } from "@/app/api/auth/register/route";
import { GET as nextProfile } from "@/app/api/auth/profile/route";
import { POST as backendLogin } from "@/backend/src/http/auth-login";
import { GET as backendMe } from "@/backend/src/http/auth-me";
import { POST as backendLogout } from "@/backend/src/http/auth-logout";
import { POST as backendRegister } from "@/backend/src/http/auth-register";
import { GET as backendProfile } from "@/backend/src/http/auth-profile";
import { createBackendServer } from "@/backend/src/http/server";
import { bindRepoRoot } from "@/backend/src/config/paths";
import { createMerchantToken } from "@/server/crypto/session-core";
import { merchantRequest } from "./helpers";

bindRepoRoot();

const FRONTEND = "http://localhost:3000";
let seq = 0;

function uniqueMerchant() {
  seq += 1;
  const stamp = `${Date.now()}${seq}`.slice(-7);
  return {
    fullName: "P123 Merchant",
    storeName: "P123 Store",
    email: `p123-${Date.now()}-${seq}@test.com`,
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

async function register(handler: typeof backendRegister, merchant = uniqueMerchant()) {
  const request = await merchantRequest("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: ipHeaders(),
    body: JSON.stringify(merchant),
  });
  const response = await handler(request);
  return { merchant, response };
}

async function listen(server: ReturnType<typeof createBackendServer>) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return addr.port;
}

describe("P12.3 authentication boundary", () => {
  it("unknown email and wrong password both return 401 without leaking existence", async () => {
    const { merchant } = await register(backendRegister);
    const unknown = await backendLogin(
      await merchantRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ email: "missing-p123@test.com", password: "12345678" }),
      }),
    );
    const wrong = await backendLogin(
      await merchantRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ email: merchant.email, password: "not-the-password" }),
      }),
    );
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    const unknownBody = (await unknown.json()) as { error?: string; password?: string };
    const wrongBody = (await wrong.json()) as { error?: string };
    assert.equal(unknownBody.error, "بيانات الدخول غير صحيحة.");
    assert.equal(wrongBody.error, unknownBody.error);
    assert.equal("password" in unknownBody, false);
  });

  it("login success sets host-only httpOnly Lax sp_session; Next matches backend", async () => {
    const { merchant } = await register(backendRegister);
    const viaBackend = await backendLogin(
      await merchantRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ email: merchant.email, password: merchant.password }),
      }),
    );
    const viaNext = await nextLogin(
      await merchantRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ email: merchant.email, password: merchant.password }),
      }),
    );
    assert.equal(viaBackend.status, 200);
    assert.equal(viaNext.status, 200);
    const cookie = cookieHeader(viaBackend);
    assert.match(cookie, /sp_session=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.doesNotMatch(cookie, /SameSite=None/i);
    assert.doesNotMatch(cookie, /Domain=/i);
    const body = (await viaBackend.json()) as { user?: { email?: string }; account?: { password?: string } };
    assert.equal(body.user?.email, merchant.email);
    assert.equal(body.account && "password" in body.account, false);
  });

  it("GET /api/auth/me: no session, forged, and expired are 401", async () => {
    const none = await backendMe(
      new Request(`${FRONTEND}/api/auth/me`, { method: "GET", headers: { host: "localhost:3000" } }),
    );
    const forged = await backendMe(
      new Request(`${FRONTEND}/api/auth/me`, {
        method: "GET",
        headers: { host: "localhost:3000", cookie: "sp_session=not-a-real-token" },
      }),
    );
    const expiredToken = await createMerchantToken({ email: "expired@test.com", fullName: "Expired" }, Date.now() - 1000);
    const expired = await backendMe(
      new Request(`${FRONTEND}/api/auth/me`, {
        method: "GET",
        headers: { host: "localhost:3000", cookie: `sp_session=${expiredToken}` },
      }),
    );
    assert.equal(none.status, 401);
    assert.equal(forged.status, 401);
    assert.equal(expired.status, 401);
    assert.equal((await nextMe(new Request(`${FRONTEND}/api/auth/me`, { headers: { host: "localhost:3000" } }))).status, 401);
  });

  it("login then me then logout: session cookie is cleared; user A cannot read user B", async () => {
    const a = uniqueMerchant();
    const b = uniqueMerchant();
    assert.equal((await register(backendRegister, a)).response.status, 200);
    assert.equal((await register(backendRegister, b)).response.status, 200);

    const loginA = await backendLogin(
      await merchantRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ email: a.email, password: a.password }),
      }),
    );
    const tokenA = sessionFromSetCookie(cookieHeader(loginA));
    assert.ok(tokenA);

    const meA = await backendMe(
      new Request(`${FRONTEND}/api/auth/me`, {
        method: "GET",
        headers: { host: "localhost:3000", cookie: `sp_session=${tokenA}` },
      }),
    );
    assert.equal(meA.status, 200);
    const meABody = (await meA.json()) as { user?: { email?: string } };
    assert.equal(meABody.user?.email, a.email);

    const loginB = await backendLogin(
      await merchantRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: ipHeaders(),
        body: JSON.stringify({ email: b.email, password: b.password }),
      }),
    );
    const tokenB = sessionFromSetCookie(cookieHeader(loginB));
    const profileA = await backendProfile(
      new Request(`${FRONTEND}/api/auth/profile`, {
        method: "GET",
        headers: { host: "localhost:3000", cookie: `sp_session=${tokenA}` },
      }),
    );
    const profileB = await backendProfile(
      new Request(`${FRONTEND}/api/auth/profile`, {
        method: "GET",
        headers: { host: "localhost:3000", cookie: `sp_session=${tokenB}` },
      }),
    );
    assert.equal(profileA.status, 200);
    assert.equal(profileB.status, 200);
    const aProfile = (await profileA.json()) as { email?: string };
    const bProfile = (await profileB.json()) as { email?: string };
    assert.equal(aProfile.email, a.email);
    assert.equal(bProfile.email, b.email);
    assert.notEqual(aProfile.email, bProfile.email);

    const nextProfileA = await nextProfile(
      new Request(`${FRONTEND}/api/auth/profile`, {
        method: "GET",
        headers: { host: "localhost:3000", cookie: `sp_session=${tokenA}` },
      }),
    );
    assert.equal(nextProfileA.status, 200);

    const logout = await backendLogout(
      await merchantRequest("http://localhost:3000/api/auth/logout", { method: "POST", headers: ipHeaders() }),
    );
    assert.equal(logout.status, 200);
    const cleared = cookieHeader(logout);
    assert.match(cleared, /sp_session=/);
    assert.match(cleared, /Max-Age=0/i);
    assert.equal((await nextLogout(await merchantRequest("http://localhost:3000/api/auth/logout", { method: "POST" }))).status, 200);
  });

  it("CSRF and Origin: login without Origin is 403; evil Origin is 403", async () => {
    const missing = await backendLogin(
      new Request(`${FRONTEND}/api/auth/login`, {
        method: "POST",
        headers: { host: "localhost:3000", "content-type": "application/json", ...ipHeaders() },
        body: JSON.stringify({ email: "x@test.com", password: "123456" }),
      }),
    );
    const evil = await backendLogin(
      new Request(`${FRONTEND}/api/auth/login`, {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "https://evil.example",
          "content-type": "application/json",
          ...ipHeaders(),
        },
        body: JSON.stringify({ email: "x@test.com", password: "123456" }),
      }),
    );
    assert.equal(missing.status, 403);
    assert.equal(evil.status, 403);
    assert.equal((await missing.json() as { error?: string }).error, "طلب غير مسموح.");
  });

  it("standalone backend login → me → workspace → logout", async () => {
    const merchant = uniqueMerchant();
    const server = createBackendServer();
    const port = await listen(server);
    const origin = FRONTEND;
    try {
      const registered = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", ...ipHeaders() },
        body: JSON.stringify(merchant),
      });
      assert.equal(registered.status, 200);

      const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", ...ipHeaders() },
        body: JSON.stringify({ email: merchant.email, password: merchant.password }),
      });
      assert.equal(login.status, 200);
      assert.equal(login.headers.get("access-control-allow-origin"), origin);
      assert.equal(login.headers.get("access-control-allow-credentials"), "true");
      const token = sessionFromSetCookie(cookieHeader(login));
      assert.ok(token);

      const me = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
        headers: { origin, cookie: `sp_session=${token}` },
      });
      assert.equal(me.status, 200);
      assert.equal(((await me.json()) as { user?: { email?: string } }).user?.email, merchant.email);

      const workspace = await fetch(`http://127.0.0.1:${port}/api/workspace`, {
        headers: { origin, cookie: `sp_session=${token}` },
      });
      assert.equal(workspace.status, 200);
      assert.equal("workspace" in ((await workspace.json()) as object), true);

      const logout = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
        method: "POST",
        headers: { origin, ...ipHeaders() },
      });
      assert.equal(logout.status, 200);
      assert.match(cookieHeader(logout), /Max-Age=0/i);

      const meNone = await fetch(`http://127.0.0.1:${port}/api/auth/me`, { headers: { origin } });
      assert.equal(meNone.status, 401);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
