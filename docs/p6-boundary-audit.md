# P6 Boundary Audit

**Date:** 2026-08-21  
**Baseline:** 54 tests pass. `next build` passes. Dual-write JSON + Postgres stays.  
**Goal:** API → Service → Repository → Adapter. No data/schema/API/auth/Guard-rule/engine changes.

---

## Allowed (not violations)

| Layer | May import |
| --- | --- |
| API route | `server/http`, middleware (auth, CSRF, rate-limit), validators, **services**, identity helpers, cookie attach/clear, engine (`/api/analyze`) |
| Service | repositories, crypto, mail, `server/smart-guard` **implementation** (run, network-code, session maps) |
| Repository | `server/db/postgres`, `server/storage/json-store` |
| Adapter | `pg`, `fs`, env |
| Guard engine (`run.ts`) | repositories (not HTTP) |

---

## 1. API routes (`app/api/**`)

### Already correct: Route → Service

| Route | Service |
| --- | --- |
| `/api/auth/login`, `register`, `me`, `forgot-password`, `reset-password` | `auth.service` |
| `/api/auth/profile` | `profile.service` |
| `/api/workspace` | `workspace.service` |
| `/api/track` | `track.service` |
| `/api/admin/login`, `snapshot`, `users` | `admin.service` |

Cookie attach/clear stays in the route (`server/crypto/session`). That is HTTP, not data access.

`/api/admin/me`, `/api/admin/logout`, `/api/auth/logout` — session only, no store.

`POST /api/analyze` — parser + `runFullAnalysis`. Not a persistence shortcut.

`POST /api/smart-guard/step-up` — static 400. No store.

### Violations (P6)

| Route | Imports | Violation |
| --- | --- | --- |
| `POST /api/smart-guard/step-up/send` | `user.repository.findAccount` | **API → Repository** |
| `GET /api/smart-guard/logs` | `server/smart-guard/logs` → `guard-log.repository` | **API → Repository** (via 1-line re-export) |
| `GET/POST /api/smart-guard/demo` | `server/smart-guard/demo` → `demo.repository` | **API bypasses domain service** for persistence |
| `POST /api/smart-guard/evaluate` | `runSmartGuard` + `lib/server/request-meta` | no service; **API → lib/server** |
| `POST /api/smart-guard/step-up/verify` | `network-code`, `demo`, `run`, `lib/server/request-meta` | no service; **API → lib/server** |

### Documented, not P6 merchant-data shortcuts

| Route | Imports | Decision |
| --- | --- | --- |
| `/api/nac`, `/api/nac/mock/gate`, CAMARA mock POSTs | `nokia-mock` / `nac-simulator`, client-safe `policy`/`types` | Mock NaC HTTP. Not user/workspace/event JSON. Wrapping each in a “service” would be ceremony. **Leave.** |

---

## 2. Services (`server/services/**`)

| Service | Repositories | Bypass? |
| --- | --- | --- |
| `auth.service` | `user.repository` | Mail via `lib/server/send-password-email` (SMTP, not a store). **Leave in P6.** |
| `profile.service` | `user.repository` | no |
| `admin.service` | user + workspace + event | no |
| `workspace.service` | `workspace.repository` | no |
| `track.service` | `event.repository` | no |

**Missing domain service:** Smart Guard HTTP (evaluate, logs, demo flags, step-up send/verify).

---

## 3. Repositories (`server/repositories/**`)

All five use adapters only:

| Repository | Adapter |
| --- | --- |
| `user.repository` | postgres + json-store |
| `workspace.repository` | postgres + json-store |
| `event.repository` | postgres + json-store |
| `guard-log.repository` | postgres + json-store |
| `demo.repository` | json-store only |

No repository imports `lib/server/*` implementation. **No P6 repo work except consumption from a new service.**

---

## 4. Smart Guard (`server/smart-guard/**`)

| File | Data access | P6 |
| --- | --- | --- |
| `run.ts` | `user.repository`, `guard-log.repository` | Keep. Engine → repository is correct. HTTP must not call this directly after P6. |
| `demo.ts` | re-exports `demo.repository`; owns in-memory NV/step-up maps | HTTP demo flags → service → repository. Maps stay here for `run`/`camara`/`verify`. |
| `logs.ts` | re-export `listGuardDecisions` | Route should stop using this. File may remain as a shim. |
| `network-code.ts` | in-memory OTP | Called from the new service, not from the route. |
| `identity.ts` | session only | Stay on the route (auth boundary). |
| `nokia-mock.ts` | `readDemoFlags` via `demo.ts` | Simulator, not an API persistence shortcut. Leave. |

---

## 5. Adapters (`server/storage/**`, `server/db/**`)

`json-store.ts` and `postgres.ts` are only imported by repositories (and shims). **No API/service bypass.**

---

## 6. `lib/server/**`

| File | Role | P6 |
| --- | --- | --- |
| `json-store.ts`, `workspaces.ts`, `events.ts`, `accounts.ts` | re-export shims | keep |
| `guard-log.ts` | empty stub (not a re-export) | keep |
| `request-meta.ts` | **live helper**; imported by evaluate + verify | **Move implementation to `server/http.ts`.** Old path becomes a shim. No new logic in `lib/server`. |
| `send-password-email.ts` | SMTP used by `auth.service` | remaining; not a JSON/PG shortcut |

---

## P6 fix list (smallest)

1. Add `server/services/guard.service.ts`: logs, demo flags, step-up send, evaluate (`runSmartGuard`), step-up verify. Same errors, same payloads.
2. Point the five Smart Guard mutating/read routes at that service.
3. Keep fail-closed freeze **in** `evaluate/route.ts` (source test). Service only runs the engine.
4. Keep `resolveGuardIdentity` / `resolveStepUpIdentity` / `rateLimit` / `requireMerchant` on the route.
5. Move `requestMeta` onto `server/http.ts`; shim `lib/server/request-meta.ts`.
6. Do not change NAC mock routes, analyze, cookies, SQL, JSON files, or dual-write order.

**Do not create** extra repositories or adapters. Reuse existing ones.

---

## After P6

Merchant and Guard HTTP persistence now:

```text
app/api/smart-guard/{evaluate,logs,demo,step-up/send,step-up/verify}
  → server/services/guard.service.ts
    → repositories + run/network-code/demo session maps
      → server/db/postgres + server/storage/json-store
```

Fail-closed freeze remains in `evaluate/route.ts`. Identity and rate limits remain on the route.

Left on purpose: `/api/nac/*` mock adapters; `/api/analyze` engine; cookie helpers on auth routes; `auth.service` → `lib/server/send-password-email`; `run.ts` → repositories; `nokia-mock` → demo flags.

