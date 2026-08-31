import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GET as nextWorkspaceGet, POST as nextWorkspacePost } from "@/app/api/workspace/route";
import { POST as nextTrackPost } from "@/app/api/track/route";
import { POST as nextAnalyzePost } from "@/app/api/analyze/route";
import { GET as backendWorkspaceGet } from "@/backend/src/http/workspace-get";
import { POST as backendWorkspacePost } from "@/backend/src/http/workspace-post";
import { POST as backendTrackPost } from "@/backend/src/http/track-post";
import { POST as backendAnalyzePost } from "@/backend/src/http/analyze-post";
import { createBackendServer } from "@/backend/src/http/server";
import { bindRepoRoot } from "@/backend/src/config/paths";
import { createAdminToken } from "@/server/crypto/session-core";
import { apiUrl } from "@/frontend/lib/api/client";
import { merchantRequest } from "./helpers";

bindRepoRoot();

const FRONTEND = "http://localhost:3000";
const BACKEND_ORIGIN = "http://localhost:4000";

function aliceWorkspace(fileName: string) {
  return {
    version: 2,
    files: [
      {
        id: "p12-2-alice",
        fileName,
        parseResult: {
          transactions: [],
          mapping: { mapping: {}, scores: {}, headers: [], unmappedHeaders: [], warnings: [] },
          fileName,
          rowCount: 0,
          skippedRows: 0,
          warnings: [],
          cleaning: {
            sourceRows: 0,
            validRows: 0,
            skippedRows: 0,
            columnsDetected: 0,
            columnsMapped: 0,
            valuesFixed: 0,
            duplicatesRemoved: 0,
            reviewNeeded: 0,
          },
        },
      },
    ],
  };
}

async function listen(server: ReturnType<typeof createBackendServer>) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return addr.port;
}

async function jsonOf(response: Response) {
  return (await response.json()) as { error?: string; ok?: boolean; workspace?: { files?: { fileName?: string }[] } | null };
}

describe("P12.2.1 backend contract — workspace / track / analyze", () => {
  it("frontend API client stays relative when NEXT_PUBLIC_API_BASE_URL is empty", () => {
    assert.equal(apiUrl("/api/workspace"), "/api/workspace");
    assert.equal(apiUrl("api/track"), "/api/track");
  });

  it("GET /api/workspace: unauthenticated is 401 on Next and backend with the same body", async () => {
    const request = new Request(`${FRONTEND}/api/workspace`, {
      method: "GET",
      headers: { host: "localhost:3000" },
    });
    const viaNext = await nextWorkspaceGet(request);
    const viaBackend = await backendWorkspaceGet(request);
    assert.equal(viaNext.status, 401);
    assert.equal(viaBackend.status, 401);
    const nextBody = await jsonOf(viaNext);
    const backendBody = await jsonOf(viaBackend);
    assert.deepEqual(nextBody, backendBody);
    assert.equal(backendBody.error, "يجب تسجيل الدخول أولاً.");
  });

  it("GET /api/workspace: admin cookie is not a merchant session (401)", async () => {
    const token = await createAdminToken({ email: "admin@test.local", name: "Test Admin" });
    const request = new Request(`${FRONTEND}/api/workspace`, {
      method: "GET",
      headers: { host: "localhost:3000", cookie: `sp_admin=${token}` },
    });
    assert.equal((await backendWorkspaceGet(request)).status, 401);
    assert.equal((await nextWorkspaceGet(request)).status, 401);
  });

  it("POST /api/workspace without Origin is CSRF 403 on Next and backend", async () => {
    const request = await merchantRequest("http://localhost:3000/api/workspace", {
      method: "POST",
      email: "p12.2-csrf@test.com",
      body: JSON.stringify({ workspace: aliceWorkspace("csrf.csv") }),
    });
    request.headers.delete("origin");
    const viaNext = await nextWorkspacePost(request);
    const viaBackend = await backendWorkspacePost(
      await merchantRequest("http://localhost:3000/api/workspace", {
        method: "POST",
        email: "p12.2-csrf@test.com",
        body: JSON.stringify({ workspace: aliceWorkspace("csrf.csv") }),
      }).then((req) => {
        req.headers.delete("origin");
        return req;
      }),
    );
    assert.equal(viaNext.status, 403);
    assert.equal(viaBackend.status, 403);
    assert.equal((await jsonOf(viaNext)).error, "طلب غير مسموح.");
  });

  it("POST /api/track without Origin is CSRF 403; with Origin is 200", async () => {
    const blockedHeaders = { host: "localhost:3000", "content-type": "application/json" };
    const blockedInit = { method: "POST" as const, headers: blockedHeaders, body: JSON.stringify({ type: "login", at: Date.now() }) };
    assert.equal((await backendTrackPost(new Request(`${FRONTEND}/api/track`, blockedInit))).status, 403);
    assert.equal(
      (
        await nextTrackPost(
          new Request(`${FRONTEND}/api/track`, {
            method: "POST",
            headers: blockedHeaders,
            body: JSON.stringify({ type: "login", at: Date.now() }),
          }),
        )
      ).status,
      403,
    );

    const allowed = new Request(`${FRONTEND}/api/track`, {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: FRONTEND,
        "content-type": "application/json",
      },
      body: JSON.stringify({ type: "login", at: Date.now() }),
    });
    const viaBackend = await backendTrackPost(allowed);
    const viaNext = await nextTrackPost(
      new Request(`${FRONTEND}/api/track`, {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: FRONTEND,
          "content-type": "application/json",
        },
        body: JSON.stringify({ type: "login", at: Date.now() }),
      }),
    );
    assert.equal(viaBackend.status, 200);
    assert.equal(viaNext.status, 200);
    assert.deepEqual(await jsonOf(viaBackend), { ok: true });
    assert.deepEqual(await jsonOf(viaNext), { ok: true });
  });

  it("POST /api/analyze unauthenticated is 401 (CSRF Origin present)", async () => {
    function analyzeRequest() {
      const form = new FormData();
      form.set("file", new File(["a,b\n1,2"], "x.csv", { type: "text/csv" }));
      return new Request(`${FRONTEND}/api/analyze`, {
        method: "POST",
        headers: { host: "localhost:3000", origin: FRONTEND },
        body: form,
      });
    }
    assert.equal((await backendAnalyzePost(analyzeRequest())).status, 401);
    assert.equal((await nextAnalyzePost(analyzeRequest())).status, 401);
  });

  it("IDOR: user B cannot read user A workspace files; save uses session.email", async () => {
    const marker = `alice-only-${Date.now()}.csv`;
    const saveA = await merchantRequest("http://localhost:3000/api/workspace", {
      method: "POST",
      email: "p12.2-alice@test.com",
      body: JSON.stringify({ workspace: aliceWorkspace(marker) }),
    });
    assert.equal((await backendWorkspacePost(saveA)).status, 200);

    const getA = await merchantRequest("http://localhost:3000/api/workspace", {
      email: "p12.2-alice@test.com",
    });
    const aliceBody = await jsonOf(await backendWorkspaceGet(getA));
    assert.equal(aliceBody.workspace?.files?.some((file) => file.fileName === marker), true);

    const getB = await merchantRequest("http://localhost:3000/api/workspace", {
      email: "p12.2-bob@test.com",
    });
    const bobBody = await jsonOf(await backendWorkspaceGet(getB));
    assert.equal(bobBody.workspace?.files?.some((file) => file.fileName === marker) ?? false, false);

    const steal = await merchantRequest("http://localhost:3000/api/workspace", {
      method: "POST",
      email: "p12.2-bob@test.com",
      body: JSON.stringify({
        workspace: { ...aliceWorkspace("bob-steal.csv"), ownerEmail: "p12.2-alice@test.com" },
      }),
    });
    assert.equal((await backendWorkspacePost(steal)).status, 200);
    const aliceAfter = await jsonOf(
      await backendWorkspaceGet(
        await merchantRequest("http://localhost:3000/api/workspace", { email: "p12.2-alice@test.com" }),
      ),
    );
    assert.equal(aliceAfter.workspace?.files?.some((file) => file.fileName === "bob-steal.csv") ?? false, false);
  });

  it("standalone backend process matches the Next contract for migrated routes", async () => {
    const server = createBackendServer();
    const port = await listen(server);
    try {
      const unauth = await fetch(`http://127.0.0.1:${port}/api/workspace`);
      assert.equal(unauth.status, 401);
      const unauthBody = await jsonOf(unauth);
      assert.equal(unauthBody.error, "يجب تسجيل الدخول أولاً.");
      assert.equal("stack" in unauthBody, false);

      const authedReq = await merchantRequest("http://localhost:3000/api/workspace", {
        email: "p12.2-process@test.com",
      });
      const cookie = authedReq.headers.get("cookie") || "";
      const authed = await fetch(`http://127.0.0.1:${port}/api/workspace`, { headers: { cookie } });
      assert.equal(authed.status, 200);
      assert.equal("workspace" in (await authed.json()), true);

      const csrf = await fetch(`http://127.0.0.1:${port}/api/track`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "login", at: Date.now() }),
      });
      assert.equal(csrf.status, 403);

      const track = await fetch(`http://127.0.0.1:${port}/api/track`, {
        method: "POST",
        headers: {
          origin: FRONTEND,
          "content-type": "application/json",
        },
        body: JSON.stringify({ type: "login", at: Date.now() }),
      });
      assert.equal(track.status, 200);
      assert.deepEqual(await track.json(), { ok: true });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});

describe("P12.2.2 CORS + P12.2.3 auth boundary on the standalone backend", () => {
  it("echoes the exact frontend origin and never uses *", async () => {
    const server = createBackendServer();
    const port = await listen(server);
    try {
      const allowed = await fetch(`http://127.0.0.1:${port}/api/workspace`, {
        headers: { origin: FRONTEND },
      });
      assert.equal(allowed.status, 401);
      assert.equal(allowed.headers.get("access-control-allow-origin"), FRONTEND);
      assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
      assert.notEqual(allowed.headers.get("access-control-allow-origin"), "*");

      const denied = await fetch(`http://127.0.0.1:${port}/api/workspace`, {
        headers: { origin: "https://evil.example" },
      });
      assert.equal(denied.status, 401);
      assert.equal(denied.headers.get("access-control-allow-origin"), null);

      const preflightOk = await fetch(`http://127.0.0.1:${port}/api/workspace`, {
        method: "OPTIONS",
        headers: {
          origin: FRONTEND,
          "access-control-request-method": "GET",
        },
      });
      assert.equal(preflightOk.status, 204);
      assert.equal(preflightOk.headers.get("access-control-allow-origin"), FRONTEND);

      const preflightBad = await fetch(`http://127.0.0.1:${port}/api/track`, {
        method: "OPTIONS",
        headers: {
          origin: "https://evil.example",
          "access-control-request-method": "POST",
        },
      });
      assert.equal(preflightBad.status, 403);
      assert.equal(preflightBad.headers.get("access-control-allow-origin"), null);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it("CORS allowlist does not bypass merchant authorization", async () => {
    const server = createBackendServer();
    const port = await listen(server);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/workspace`, {
        headers: { origin: FRONTEND },
      });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("access-control-allow-origin"), FRONTEND);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it("CSRF still applies when Origin is the frontend and Host is the backend", async () => {
    const blocked = new Request(`${BACKEND_ORIGIN}/api/track`, {
      method: "POST",
      headers: {
        host: "localhost:4000",
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ type: "login", at: Date.now() }),
    });
    assert.equal((await backendTrackPost(blocked)).status, 403);

    const allowed = new Request(`${BACKEND_ORIGIN}/api/track`, {
      method: "POST",
      headers: {
        host: "localhost:4000",
        origin: FRONTEND,
        "content-type": "application/json",
      },
      body: JSON.stringify({ type: "login", at: Date.now() }),
    });
    assert.equal((await backendTrackPost(allowed)).status, 200);
  });
});
