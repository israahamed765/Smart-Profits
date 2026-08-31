# P12.1 — Environment boundary

**Date:** 2026-08-23  
**Rule:** classify only. Values in `.env` / `.env.example` were **not** changed. No `NEXT_PUBLIC_` secrets exist in the repo.

Sources: `.env.example`, `process.env.*` reads in `server/` and `tests/setup.ts`. Client modules do not read these keys.

---

## Classification

| Variable | Class | Secret? | Read in | Notes |
| --- | --- | --- | --- | --- |
| `SESSION_SECRET` | **AUTH** / **SERVER-ONLY** | **yes** | `server/crypto/session.ts` | Required. HMAC key. Never `NEXT_PUBLIC_`. |
| `ADMIN_EMAIL` | **AUTH** / **SERVER-ONLY** | credential | `server/services/admin.service.ts` | Login identity. UI hint `ADMIN_LOGIN_HINT_EMAIL` is a **separate** public constant. |
| `ADMIN_PASSWORD` | **AUTH** / **SERVER-ONLY** | **yes** | `admin.service.ts` | Timing-safe compare. |
| `ADMIN_NAME` | **AUTH** / **SERVER-ONLY** | no | `admin.service.ts` | Display name for admin session. |
| `DATABASE_URL` | **DATABASE** / **SERVER-ONLY** | **yes** (connection string) | `server/db/postgres.ts` | Empty → JSON-only. i18n string `"DATABASE_URL"` is not this value. |
| `NAC_API_KEY` | **NAC** / **SERVER-ONLY** | **yes** | `server/smart-guard/nac-env.ts` | Absent → simulator mode. Sent as `X-RapidAPI-Key` only from server. |
| `NAC_RAPIDAPI_HOST` | **NAC** / **SERVER-ONLY** | no | `nac-env.ts` | Host header for live NaC. |
| `NAC_BASE_URL` | **NAC** / **SERVER-ONLY** | no | `nac-env.ts` | Default RapidAPI NaC base. |
| `MAIL_HOST` | **SMTP** / **SERVER-ONLY** | no | `server/mail/send-password-email.ts` | Default `smtp.gmail.com`. |
| `MAIL_PORT` | **SMTP** / **SERVER-ONLY** | no | mail | Default `587`. |
| `MAIL_USER` | **SMTP** / **SERVER-ONLY** | **yes** | mail | |
| `MAIL_APP_PASSWORD` | **SMTP** / **SERVER-ONLY** | **yes** | mail | Preferred password env. |
| `MAIL_PASS` | **SMTP** / **SERVER-ONLY** | **yes** | mail | Alias fallback. |
| `APP_URL` | **OTHER** / **SERVER-ONLY** | no | `server/middleware/csrf.ts` | Extra allowed Origin host. Public URL, still not bundled as `NEXT_PUBLIC_`. |
| `NODE_ENV` | **BUILD-TIME** / **OTHER** | no | session `secure` flag; auth demo reset code | Platform. |
| `VERCEL` | **OTHER** / **SERVER-ONLY** | no | json-store path `/tmp`; repo persist-fail on PG down | Platform. |

**CLIENT-SAFE:** none of the above. A future Frontend may use a non-secret public API origin (today same-origin `/api/*`). That would be a **new** `NEXT_PUBLIC_API_URL` in P12.2+ — **not added now**.

---

## `NEXT_PUBLIC_` audit

Grep of `*.ts` / `*.tsx` / `*.js`: **zero** `NEXT_PUBLIC_` usage.

---

## Split implication (not implemented)

| Future Frontend | Future Backend |
| --- | --- |
| optional public API origin only | all rows in the table |
| never `SESSION_SECRET`, `DATABASE_URL`, `ADMIN_PASSWORD`, SMTP, `NAC_API_KEY` | cookies set only from Backend |
