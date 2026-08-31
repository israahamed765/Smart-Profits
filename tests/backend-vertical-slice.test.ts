import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GET as nextGet } from "@/app/api/workspace/route";
import { GET as backendGet } from "@/backend/src/http/workspace-get";
import { createBackendServer } from "@/backend/src/http/server";
import { bindRepoRoot } from "@/backend/src/config/paths";
import { merchantRequest } from "./helpers";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function source(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

async function listen(server: ReturnType<typeof createBackendServer>) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return addr.port;
}

describe("P12.2 backend vertical slice GET /api/workspace", () => {
  bindRepoRoot();

  it("Next.js GET and backend handler share the same 401 contract without a session", async () => {
    const request = new Request("http://localhost:3000/api/workspace", {
      method: "GET",
      headers: { host: "localhost:3000" },
    });
    const viaNext = await nextGet(request);
    const viaBackend = await backendGet(request);
    assert.equal(viaNext.status, 401);
    assert.equal(viaBackend.status, 401);
    const nextBody = (await viaNext.json()) as { error?: string };
    const backendBody = (await viaBackend.json()) as { error?: string };
    assert.equal(nextBody.error, backendBody.error);
    assert.equal(nextBody.error, "يجب تسجيل الدخول أولاً.");
  });

  it("standalone backend process serves GET /api/workspace with the same contract", async () => {
    const server = createBackendServer();
    const port = await listen(server);
    try {
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { ok: true });

      const unauth = await fetch(`http://127.0.0.1:${port}/api/workspace`);
      assert.equal(unauth.status, 401);
      const unauthBody = (await unauth.json()) as { error?: string; stack?: string };
      assert.equal(unauthBody.error, "يجب تسجيل الدخول أولاً.");
      assert.equal(unauthBody.stack, undefined);
      assert.doesNotMatch(JSON.stringify(unauthBody), /SESSION_SECRET|postgresql:\/\//);

      const authedReq = await merchantRequest("http://localhost:3000/api/workspace", {
        email: "p12-backend-slice@test.com",
      });
      const cookie = authedReq.headers.get("cookie") || "";
      const authed = await fetch(`http://127.0.0.1:${port}/api/workspace`, { headers: { cookie } });
      assert.equal(authed.status, 200);
      const body = (await authed.json()) as { workspace?: unknown };
      assert.equal("workspace" in body, true);

      const viaNext = await nextGet(authedReq);
      assert.equal(viaNext.status, 200);
      assert.deepEqual(await viaNext.json(), body);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it("does not copy adapters, engine, or Guard into backend/", () => {
    const files = [
      "backend/src/services/workspace.ts",
      "backend/src/repositories/workspace.ts",
      "backend/src/storage/json-store.ts",
      "backend/src/storage/postgres.ts",
      "backend/src/shared/identity.ts",
    ];
    for (const rel of files) {
      const text = source(rel);
      assert.match(text, /export \{/);
      assert.doesNotMatch(text, /CREATE TABLE/);
      assert.doesNotMatch(text, /function dataDir/);
      assert.doesNotMatch(text, /runFullAnalysis/);
      assert.doesNotMatch(text, /decideSmartGuard/);
      assert.doesNotMatch(text, /encodeSession/);
    }
    assert.equal(ROOT.endsWith("smart-profit") || ROOT.includes("smart-profit"), true);
  });
});
