/**
 * Cookie/session verification without Next.js.
 * Cookie attach/clear stay in session.ts (NextResponse). Do not duplicate HMAC logic.
 */

export const MERCHANT_COOKIE = "sp_session";
export const ADMIN_COOKIE = "sp_admin";
const DAY = 60 * 60 * 24;

export type SessionRole = "merchant" | "admin";

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  role: SessionRole;
  exp: number;
}

function sessionSecret() {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (!fromEnv) {
    throw new Error("SESSION_SECRET is required. Set it in environment variables.");
  }
  return fromEnv;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sign(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return toBase64Url(new Uint8Array(signature));
}

async function encodeSession(payload: SessionPayload) {
  const secret = sessionSecret();
  if (!secret) throw new Error("SESSION_SECRET is required in production.");
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await sign(secret, body);
  return `${body}.${signature}`;
}

async function decodeSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const secret = sessionSecret();
  if (!secret) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = await sign(secret, body);
  if (expected.length !== signature.length) return null;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  if (mismatch !== 0) return null;
  try {
    const json = new TextDecoder().decode(fromBase64Url(body));
    const payload = JSON.parse(json) as SessionPayload;
    if (!payload?.email || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") || "";
  const parts = header.split(";");
  for (const part of parts) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export async function createMerchantToken(
  user: { email: string; fullName: string },
  expiresAtMs = Date.now() + 7 * DAY * 1000,
) {
  return encodeSession({
    sub: user.email,
    email: user.email,
    name: user.fullName,
    role: "merchant",
    exp: expiresAtMs,
  });
}

export async function createAdminToken(
  admin: { email: string; name: string },
  expiresAtMs = Date.now() + 2 * DAY * 1000,
) {
  return encodeSession({
    sub: admin.email,
    email: admin.email,
    name: admin.name,
    role: "admin",
    exp: expiresAtMs,
  });
}

export async function readMerchantSession(request: Request) {
  const payload = await decodeSession(readCookie(request, MERCHANT_COOKIE));
  return payload?.role === "merchant" ? payload : null;
}

export async function readAdminSession(request: Request) {
  const payload = await decodeSession(readCookie(request, ADMIN_COOKIE));
  return payload?.role === "admin" ? payload : null;
}

export function cookieOptions(maxAge = 7 * DAY) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export const ADMIN_COOKIE_MAX_AGE = 2 * DAY;
export const MERCHANT_COOKIE_MAX_AGE = 7 * DAY;

/** Serialize Set-Cookie. No Domain (host-only). SameSite stays Lax. */
export function serializeSessionCookie(name: string, value: string, maxAge: number) {
  const opts = cookieOptions(maxAge);
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
  ];
  if (opts.httpOnly) parts.push("HttpOnly");
  parts.push(`SameSite=${opts.sameSite.charAt(0).toUpperCase()}${opts.sameSite.slice(1)}`);
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

function withSetCookie(response: Response, cookie: string) {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
}

export function appendMerchantSessionCookie(response: Response, token: string) {
  return withSetCookie(response, serializeSessionCookie(MERCHANT_COOKIE, token, MERCHANT_COOKIE_MAX_AGE));
}

export function clearMerchantSessionCookie(response: Response) {
  return withSetCookie(response, serializeSessionCookie(MERCHANT_COOKIE, "", 0));
}

export function appendAdminSessionCookie(response: Response, token: string) {
  return withSetCookie(response, serializeSessionCookie(ADMIN_COOKIE, token, ADMIN_COOKIE_MAX_AGE));
}

export function clearAdminSessionCookie(response: Response) {
  return withSetCookie(response, serializeSessionCookie(ADMIN_COOKIE, "", 0));
}
