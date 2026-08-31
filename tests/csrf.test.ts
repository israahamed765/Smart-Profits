import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AppError, isAppError } from "@/server/errors";
import { assertSameOrigin } from "@/server/middleware/csrf";

describe("CSRF origin check", () => {
  it("allows same-origin POST", () => {
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { origin: "http://localhost:3000", host: "localhost:3000" },
    });
    assert.doesNotThrow(() => assertSameOrigin(request));
  });

  it("blocks POST without Origin/Referer", () => {
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { host: "localhost:3000" },
    });
    assert.throws(() => assertSameOrigin(request), AppError);
  });

  it("blocks a cross-site Origin", () => {
    const request = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { origin: "https://evil.example", host: "localhost:3000" },
    });
    assert.throws(() => assertSameOrigin(request), AppError);
  });

  it("skips the Origin check for existing /api/nac POST routes", () => {
    const request = new Request("http://localhost:3000/api/nac/sim-swap/v1/check", {
      method: "POST",
      headers: { host: "localhost:3000" },
    });
    assert.doesNotThrow(() => assertSameOrigin(request));
  });

  it("does not apply the check to GET", () => {
    const request = new Request("http://localhost:3000/api/auth/me", {
      method: "GET",
      headers: { host: "localhost:3000" },
    });
    assert.doesNotThrow(() => assertSameOrigin(request));
  });

  it("allows the configured frontend origin when the API host is the backend", () => {
    const request = new Request("http://localhost:4000/api/track", {
      method: "POST",
      headers: { origin: "http://localhost:3000", host: "localhost:4000" },
    });
    assert.doesNotThrow(() => assertSameOrigin(request));
  });

  it("recognizes AppError even when instanceof would fail across module copies", () => {
    const detached = Object.assign(new Error("يجب تسجيل الدخول أولاً."), { name: "AppError", status: 401 });
    assert.equal(isAppError(detached), true);
    assert.equal(isAppError(new AppError("طلب غير مسموح.", 403)), true);
    assert.equal(isAppError(new Error("nope")), false);
  });
});
