# P12.1 — Auth / cookie boundary

**Date:** 2026-08-23  
**Rule:** document only. Cookie names, flags, signing, and TTLs were **not** changed.

Implementation: `server/crypto/session.ts`. Set/cleared only from API route handlers.

---

## Cookies

| | Merchant | Admin |
| --- | --- | --- |
| **Name** | `sp_session` | `sp_admin` |
| **httpOnly** | `true` | `true` |
| **sameSite** | `lax` | `lax` |
| **secure** | `true` when `NODE_ENV === "production"` | same |
| **path** | `/` | `/` |
| **domain** | **unset** (host-only current origin) | unset |
| **maxAge** | 7 days | 2 days |
| **payload `exp`** | `Date.now() + 7d` | `Date.now() + 2d` |

Token format: `base64url(JSON payload) + "." + HMAC-SHA-256` using `SESSION_SECRET`. Compare is length-checked then XOR (not `===` on strings).

Payload fields: `sub`, `email`, `name`, `role` (`merchant` | `admin`), `exp` (epoch ms). Invalid signature / missing email / expired → `null` session.

---

## Verification

| Helper | Used by |
| --- | --- |
| `readMerchantSession` | `requireMerchant` / `optionalMerchant` |
| `readAdminSession` | `requireAdmin`; root `middleware.ts` for `/api/admin/*` except `/api/admin/login` |
| `createMerchantToken` / `attachMerchantCookie` | login, register, reset-password |
| `createAdminToken` / `attachAdminCookie` | admin login |
| `clearMerchantCookie` / `clearAdminCookie` | logout routes (`maxAge: 0`) |

UI checks are **not** authorization. Workspace / profile / Guard identity use **session email**, not `body.email`, when a merchant session exists.

---

## Refresh

**None.** No refresh token, no sliding expiration, no rotation. When `exp` passes, the cookie is ignored until the user logs in again.

---

## CSRF (related, unchanged)

Non-GET `/api/*` except `/api/nac*` require `Origin` or `Referer` whose host is the request `Host` or `APP_URL` host (`server/middleware/csrf.ts` via `apiRoute`).

---

## Split implication (not implemented)

A physical Frontend on another origin **cannot** keep host-only cookies working without:

1. Backend `Set-Cookie` with an explicit shared `Domain` **or** a BFF on the Frontend origin, and
2. `credentials: "include"` plus a CORS allowlist (see `docs/p12-cors-plan.md`).

P12.1 does **not** set `Domain`, does **not** add CORS, and does **not** change `sameSite`.
