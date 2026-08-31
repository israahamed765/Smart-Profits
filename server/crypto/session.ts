import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE,
  MERCHANT_COOKIE,
  cookieOptions,
} from "./session-core";

export {
  ADMIN_COOKIE,
  MERCHANT_COOKIE,
  createAdminToken,
  createMerchantToken,
  readAdminSession,
  readMerchantSession,
  type SessionPayload,
  type SessionRole,
} from "./session-core";

export function attachMerchantCookie(response: NextResponse, token: string) {
  response.cookies.set(MERCHANT_COOKIE, token, cookieOptions());
  return response;
}

export function attachAdminCookie(response: NextResponse, token: string) {
  response.cookies.set(ADMIN_COOKIE, token, cookieOptions(ADMIN_COOKIE_MAX_AGE));
  return response;
}

export function clearMerchantCookie(response: NextResponse) {
  response.cookies.set(MERCHANT_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
  return response;
}

export function clearAdminCookie(response: NextResponse) {
  response.cookies.set(ADMIN_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
  return response;
}
