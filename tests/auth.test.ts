import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, isHashedPassword, verifyPassword } from "@/server/crypto/password";
import { loginSchema } from "@/server/validators/auth.validator";
import { publicAccount, type StoredAccount } from "@/server/repositories/user.repository";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { GET as meGet } from "@/app/api/auth/me/route";
import { merchantRequest } from "./helpers";

describe("password hashing", () => {
  it("hashes with scrypt and verifies the same password", async () => {
    const hash = await hashPassword("Secret#123");
    assert.equal(isHashedPassword(hash), true);
    assert.equal(await verifyPassword("Secret#123", hash), true);
    assert.equal(await verifyPassword("wrong-password", hash), false);
  });
});

describe("login validation", () => {
  it("rejects malformed email and short passwords", () => {
    assert.equal(loginSchema.safeParse({ email: "not-an-email", password: "123456" }).success, false);
    assert.equal(loginSchema.safeParse({ email: "a@b.com", password: "123" }).success, false);
    assert.equal(loginSchema.safeParse({ email: "a@b.com", password: "123456" }).success, true);
  });

  it("rejects SQL-looking payloads that are not valid emails", () => {
    assert.equal(loginSchema.safeParse({ email: "a' OR 1=1--", password: "123456" }).success, false);
  });
});

describe("publicAccount", () => {
  it("never returns the password hash", () => {
    const account: StoredAccount = {
      fullName: "A",
      storeName: "S",
      email: "a@b.com",
      phone: "+970599000000",
      password: "scrypt$salt$hash",
      createdAt: new Date().toISOString(),
    };
    const published = publicAccount(account);
    assert.equal("password" in published, false);
    assert.equal(JSON.stringify(published).includes("scrypt$"), false);
  });
});

describe("auth routes", () => {
  it("rejects login for an unknown email", async () => {
    const request = await merchantRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "nobody-does-not-exist@store.test", password: "12345678" }),
    });
    const response = await loginPost(request);
    assert.equal(response.status, 401);
  });

  it("rejects /api/auth/me without a session", async () => {
    const request = new Request("http://localhost:3000/api/auth/me", {
      method: "GET",
      headers: { host: "localhost:3000" },
    });
    const response = await meGet(request);
    assert.equal(response.status, 401);
  });

  it("rejects /api/auth/me with a cookie for a non-existent merchant", async () => {
    const request = await merchantRequest("http://localhost:3000/api/auth/me", {
      method: "GET",
      email: "ghost-session@store.test",
    });
    const response = await meGet(request);
    assert.equal(response.status, 404);
  });
});
