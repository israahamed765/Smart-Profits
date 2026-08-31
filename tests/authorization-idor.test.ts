import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AppError } from "@/server/errors";
import { parseSensitiveAction, resolveGuardIdentity } from "@/server/smart-guard/identity";
import { GET } from "@/app/api/workspace/route";
import { merchantRequest } from "./helpers";

describe("authorization / IDOR", () => {
  it("binds file_upload identity to the session email, not body.email", async () => {
    const request = await merchantRequest("http://localhost:3000/api/smart-guard/evaluate", {
      method: "POST",
      email: "alice@store.com",
      body: JSON.stringify({ action: "file_upload", email: "bob@store.com" }),
    });
    const resolved = await resolveGuardIdentity(request, { action: "file_upload", email: "bob@store.com" });
    assert.equal(resolved.email, "alice@store.com");
  });

  it("rejects unauthenticated sensitive actions other than login/reset", async () => {
    const request = new Request("http://localhost:3000/api/smart-guard/evaluate", {
      method: "POST",
      headers: { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json" },
    });
    await assert.rejects(
      () => resolveGuardIdentity(request, { action: "file_upload", email: "bob@store.com" }),
      (error: unknown) => error instanceof AppError && error.status === 401,
    );
  });

  it("rejects GET /api/workspace without a session", async () => {
    const request = new Request("http://localhost:3000/api/workspace", {
      method: "GET",
      headers: { host: "localhost:3000" },
    });
    const response = await GET(request);
    assert.equal(response.status, 401);
  });

  it("rejects a forged session cookie on workspace GET", async () => {
    const request = new Request("http://localhost:3000/api/workspace", {
      method: "GET",
      headers: { host: "localhost:3000", cookie: "sp_session=not-a-real-token" },
    });
    const response = await GET(request);
    assert.equal(response.status, 401);
  });

  it("parseSensitiveAction rejects unknown or missing actions", () => {
    assert.throws(() => parseSensitiveAction("not-an-action"), AppError);
    assert.throws(() => parseSensitiveAction(undefined), AppError);
  });

  it("workspace POST saves under session.email, not a client-supplied email", () => {
    const source = readFileSync(new URL("../backend/src/http/workspace-post.ts", import.meta.url), "utf8");
    assert.match(source, /saveMerchantWorkspace\(session\.email/);
    assert.doesNotMatch(source, /saveMerchantWorkspace\(body\.email/);
    assert.doesNotMatch(source, /searchParams\.get\("email"\)/);
  });
});
