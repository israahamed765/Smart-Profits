# P12.1 — API contract inventory

**Date:** 2026-08-23  
**Rule:** inventory only. Paths, methods, bodies, cookies, and status behavior were **not** changed.

**Counts:** 27 `route.ts` files, **30** HTTP handlers.

**CSRF (default):** `apiRoute` → `assertSameOrigin` on non-GET except `/api/nac*`.  
**Admin extra:** `middleware.ts` requires `sp_admin` on `/api/admin/*` except `POST /api/admin/login`.  
**Sensitive data:** never return password hashes (`publicAccount` / `toAuthUser`).

**Service column:** domain services under `server/services/`. Cookie-only and NAC mock exceptions are listed as-is (wrap in P12.2+ without URL changes).

---

## Auth

### POST `/api/auth/login`

| Field | Value |
| --- | --- |
| Auth | none |
| Authorization | email+password via `loginMerchant` |
| Body | `{ email, password }` (`loginSchema`) |
| Response | `{ ok, user, account }` + `Set-Cookie: sp_session` |
| Status | 200; 400 Zod; 401 bad creds / inactive; 429; 403 CSRF |
| CSRF | yes |
| Rate limit | `auth-login` 10 / 60s |
| Service | `auth.service` |
| Repository | `user.repository` (via service) |
| External | none |
| Sensitive | password in; hash never out; session cookie |

### POST `/api/auth/register`

| Field | Value |
| --- | --- |
| Auth | none |
| Body | `{ fullName, storeName, email, phone, password }` |
| Response | `{ ok, user, account }` + `sp_session` |
| Status | 200; 400; 409-class via AppError if duplicate; 429; 403 |
| CSRF | yes |
| Rate limit | `auth-register` 8 / 60s |
| Service | `auth.service` |
| Repository | `user.repository` |
| External | none |
| Sensitive | password in; cookie out |

### POST `/api/auth/logout`

| Field | Value |
| --- | --- |
| Auth | none (clears cookie anyway) |
| Body | none |
| Response | `{ ok: true }` + clear `sp_session` |
| Status | 200; 403 CSRF |
| CSRF | yes |
| Rate limit | none |
| Service | **none** (HTTP cookie adapter only) |
| Repository | none |
| External | none |
| Sensitive | cookie cleared |

### GET `/api/auth/me`

| Field | Value |
| --- | --- |
| Auth | merchant session required |
| Body | none |
| Response | `{ user, account }` |
| Status | 200; 401; 404 if account gone |
| CSRF | n/a (GET) |
| Rate limit | none |
| Service | `auth.service` `currentMerchant` |
| Repository | `user.repository` |
| Sensitive | account profile, no password |

### GET `/api/auth/profile`

| Field | Value |
| --- | --- |
| Auth | merchant session |
| Response | profile object from `getProfile` |
| Status | 200; 401 |
| CSRF | n/a |
| Service | `profile.service` |
| Repository | `user.repository` |

### POST `/api/auth/profile`

| Field | Value |
| --- | --- |
| Auth | merchant session |
| Body | `{ fullName?, storeName?, phone?, homeLat?, homeLng? }` |
| Response | `{ ok, account }` |
| Status | 200; 400; 401 |
| CSRF | yes |
| Service | `profile.service` |
| Repository | `user.repository` |
| Sensitive | phone, home coordinates |

### POST `/api/auth/forgot-password`

| Field | Value |
| --- | --- |
| Auth | none |
| Body | `{ email }` |
| Response | `{ ok, emailed, demoCode?, message }` — `demoCode` omitted in production |
| Status | 200 (does not reveal if email exists beyond message); 429; 403 |
| CSRF | yes |
| Rate limit | `auth-forgot` 5 / 60s |
| Service | `auth.service` |
| Repository | `user.repository` |
| External | SMTP if configured |
| Sensitive | reset code (demo only non-prod); email |

### POST `/api/auth/reset-password`

| Field | Value |
| --- | --- |
| Auth | none |
| Body | `{ email, code, password }` |
| Response | `{ ok, user }` + `sp_session` |
| Status | 200; 400; 401/403 invalid code; 429 |
| CSRF | yes |
| Rate limit | `auth-reset` 8 / 60s |
| Service | `auth.service` |
| Repository | `user.repository` |
| Sensitive | new password; cookie |

---

## Admin

### POST `/api/admin/login`

| Field | Value |
| --- | --- |
| Auth | none (middleware skips this path) |
| Body | `{ email, password }` |
| Response | `{ ok, admin }` + `sp_admin` (2d) |
| Status | 200; 401; 503 if admin env unset; 429; 403 |
| CSRF | yes |
| Rate limit | `admin-login` 8 / 60s |
| Service | `admin.service` `loginAdmin` |
| Repository | none for login (env credentials) |
| Sensitive | admin password |

### POST `/api/admin/logout`

Cookie clear only (`sp_admin`). CSRF yes. No service.

### GET `/api/admin/me`

Admin session. `{ admin: { email, name } }`. Middleware + `requireAdmin`. No service (session payload).

### GET `/api/admin/snapshot`

Admin session. Body: snapshot KPIs/users from `adminSnapshot()`. Service `admin.service`. Repos: users, workspaces, events.

### POST `/api/admin/users`

| Field | Value |
| --- | --- |
| Auth | admin session |
| Body | `{ email, plan?, status? }` |
| Response | `{ ok, account }` |
| CSRF | yes |
| Service | `admin.service` `patchMerchantAccount` |
| Repository | `user.repository` |
| Sensitive | merchant status/plan (IDOR: admin-only, not merchant self) |

---

## Workspace / track / analyze

### GET `/api/workspace`

Merchant session. `{ workspace }` or null workspace. Service `workspace.service`. Repo `workspace.repository`. **Authorization:** `session.email` only.

### POST `/api/workspace`

Merchant session. Body `{ workspace }` (`workspaceSaveSchema`; `parseResult` untrusted, sanitized in service). `{ ok: true }`. CSRF yes. Same service/repo. Saves under **session email**.

### POST `/api/track`

Optional merchant. Body `{ type, at, label? }`. `{ ok: true }`. CSRF yes. Service `track.service`. Repo `event.repository`. Email from session if present (not body).

### POST `/api/analyze`

| Field | Value |
| --- | --- |
| Auth | merchant session |
| Body | `multipart/form-data`: `file`, optional `settings`, `taxonomy` JSON |
| Response | `{ parsed, result }` |
| Status | 200; 400 parse/size; 401; 429; 403 |
| CSRF | yes |
| Rate limit | `analyze` 12 / 60s |
| Service | `analyze.service` → parser + **core** analytics |
| Repository | none |
| External | none (xlsx/unpdf/tesseract in-process) |
| Sensitive | merchant ledger file contents |

Max file **8MB**.

---

## Smart Guard

### POST `/api/smart-guard/evaluate`

| Field | Value |
| --- | --- |
| Auth | identity via `resolveGuardIdentity` (session wins; pre-auth login/reset may use body.email) |
| Body | `{ action, email?, phone?, fileBytes?, fileName? }` |
| Response | `{ verdict }` or 503 `{ verdict: freeze/check_failed }` |
| Status | 200; 400 unknown action; 401 some actions; **503 fail-closed**; 429; 403 CSRF |
| CSRF | yes |
| Rate limit | `smart-guard-evaluate` 20 / 60s |
| Service | `guard.service` `evaluateSensitiveAction` → `runSmartGuard` |
| Repository | user, guard-log, demo (via run) |
| External | Nokia NaC if `NAC_API_KEY`, else simulator |
| Sensitive | phone, IP/UA in logs, decision |

### GET `/api/smart-guard/logs`

Merchant session. Query `limit` (default 40). JSON list from `listMerchantGuardLogs(session.email)`. Service `guard.service`. Repo `guard-log.repository`.

### GET `/api/smart-guard/demo`

Merchant. `{ flags }`. Service `guard.service`. Repo `demo.repository`.

### POST `/api/smart-guard/demo`

Merchant. Body demo flags. `{ ok, flags }`. CSRF yes. Same service/repo.

### POST `/api/smart-guard/step-up`

**Stub.** `{ error: "A network code is required…" }` **400**. Does **not** use `apiRoute` (no CSRF wrapper). No service. Kept for old clients.

### POST `/api/smart-guard/step-up/send`

Identity `resolveStepUpIdentity`. Body `{ action?, email?, phone? }`. Response challenge metadata (`maskedPhone`, `demoCode` non-prod, etc.). Rate `smart-guard-send` 5 / 60s. Service `sendStepUpNetworkCode`. Repo `user.repository`. CSRF yes.

### POST `/api/smart-guard/step-up/verify`

`resolveGuardIdentity`. Body `{ action, email?, phone?, code }`. `{ verdict }` or AppError. Rate `smart-guard-verify` 10 / 60s. Service `verifyStepUpNetworkCode`. CSRF yes.

---

## Nokia NaC mock (CSRF exempt)

Hackathon CAMARA-shaped routes. **No merchant session. No repositories. No domain service yet.**

| Method | Path | Body | Response | Status | External |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/nac` | — | mock catalog + dummy numbers | 200 | none |
| POST | `/api/nac/mock/gate` | `{ phoneNumber, action?, email? }` | gate + CAMARA blobs | 200/400/500 | simulator/mock |
| POST | `/api/nac/sim-swap/v1/check` | `{ phoneNumber, maxAge? }` | sim-swap check | 200/400 | simulator |
| POST | `/api/nac/sim-swap/v1/retrieve-date` | `{ phoneNumber }` | latest SIM change | 200/400 | simulator |
| POST | `/api/nac/number-verification/v1/verify` | `{ phoneNumber }` | number verify | 200/400 | simulator |
| POST | `/api/nac/location-verification/v1/verify` | `{ device.phoneNumber, area.center, radius? }` | location verify | 200/400 | simulator |

Header `x-merchant-email` is used by some simulators for demo flags — not a session cookie.

---

## What moves later (not now)

All **30** handlers stay at these URLs. A future Backend process would host the same paths. Frontend would `fetch` that origin with credentials **only after** CORS/cookie work (`docs/p12-cors-plan.md`).
