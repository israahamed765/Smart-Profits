# P9 Architecture Inventory

**Date:** 2026-08-23  
**Rule:** this document records the tree **before** any P9 code change. No files were moved to produce it.  
**Baseline after P8:** `npm test` 63 passed / 0 failed. `next build` PASS. Client bundle: no xlsx / unpdf / tesseract / secrets.

**Monolith:** one Next.js 16 app. Do **not** create independent `frontend/` + `backend/` applications in P9. Do **not** move `app/` into `frontend/`.

---

## Current layout

```text
smart-profit/
├── app/                 pages (RSC + "use client") + app/api (HTTP)
├── components/          UI
├── context/             client state
├── lib/                 mixed: UI, client-safe engine, shims, a few leftover server files
├── server/              backend layers (http, services, repositories, db, guard, parser)
├── tests/
├── docs/
├── data/                JSON store (do not delete or rewrite)
├── middleware.ts        Edge: /api/admin/* except login
├── docker-compose.yml   local Postgres 16
└── public/
```

There is **no** top-level `frontend/`, `backend/`, or `shared/` yet. Client-safe shared pieces live under `lib/shared/` and `lib/financial-engine/`.

---

## 1. Folder classification

| Path | Layer | Notes |
| --- | --- | --- |
| `app/**/page.tsx`, `layout.tsx` | UI / Frontend | Mix of client pages and thin RSC shells |
| `app/api/**` | Backend HTTP | 27 route files. Must stay at these URLs |
| `components/` | UI | `"use client"` almost everywhere |
| `context/` | Frontend state | 6 contexts |
| `lib/financial-engine/core/` | Financial engine (client-safe) | analytics, advisor, forecast, … |
| `lib/financial-engine/types/` | Shared types | no I/O |
| `lib/financial-engine/serialization/` | Shared (browser-safe JSON) | sanitizes via integrity |
| `server/financial-engine/parser/` | Server-only ingest | xlsx, papaparse, unpdf, tesseract |
| `server/financial-engine/analysis/` | Backend analysis entry | parse + `runFullAnalysis` |
| `server/financial-engine/upload/` | Server-only | `analyzeUploadedFile`; unused by the route |
| `server/services/` | Backend business | auth, profile, admin, workspace, track, guard |
| `server/repositories/` | Database | user, workspace, event, guard-log, demo |
| `server/db/postgres.ts` | Database | `pg` Pool, `DATABASE_URL` |
| `server/storage/json-store.ts` | Database / filesystem | `data/` or `/tmp` on Vercel |
| `server/crypto/` | Authentication | session HMAC cookies, scrypt |
| `server/middleware/` | Auth / CSRF / rate limit | |
| `server/validators/` | Shared-safe Zod | currently under server; no Node APIs |
| `server/smart-guard/` | Guard engine | run, NAC, identity, OTP maps |
| `lib/smart-guard/client.ts` | Frontend Guard HTTP | fetch + geolocation; fail-closed client |
| `lib/smart-guard/policy.ts` | Guard business logic (pure) | used by server `run` and NAC mock gate |
| `lib/shared/math.ts` | Utilities / shared | already client-safe |
| `lib/shared/smart-guard.ts` | Shared types/constants | |
| `lib/shared/nac-contract.ts` | Shared contracts | no secrets (`nac-env.ts` holds keys) |
| `lib/ui/cn.ts` | UI | Tailwind; must not enter engine/shared math |
| `lib/server/send-password-email.ts` | Authentication / SMTP | **still the live implementation** |
| `lib/db/postgres.ts` | Dangerous leftover shim | re-exports server Postgres; **zero importers** |
| `data/*.json` | Database data | out of P9 |

---

## 2. Import / dependency graph (high level)

```text
FRONTEND ("use client")
  components / context / app pages
    → lib/engine, advisor, opex, serialize, classify, format, i18n, ui/cn
    → lib/smart-guard/client + types (HTTP only)
    → fetch /api/*

API (app/api)
  → server/http + middleware
  → server/services/*          (auth, workspace, guard, admin, track, profile)
  → server/financial-engine/analysis   (analyze only)
  → server/crypto/session      (cookie attach/clear on auth routes)
  → server/smart-guard/nac-simulator | nokia-mock   (NAC routes; no domain service)

SERVICES
  → repositories → postgres + json-store
  → server/smart-guard/run (guard.service)
  → lib/server/send-password-email (auth.service only)

FINANCIAL
  Client: core/analytics (one formula source)
  Server: analysis → parser → core/analytics (same source)
```

No `"use client"` file imports `@/server/*`, `@/lib/server/*`, or `@/lib/db/*` (static scan, P8 tests).

Server does not import `@/components` or `@/lib/ui`.

---

## 3. File-by-file layer map (engine + backend + shared)

### Client-only (UI / session state / localStorage)

| Area | Files |
| --- | --- |
| UI | `components/**`, most `app/**/page.tsx` with `"use client"` |
| Contexts | `analysis-context`, `auth-context`, `admin-auth`, `admin-portal`, `appearance`, `smart-guard-context` |
| Browser storage | `lib/tenant.ts`, `lib/taxonomy.ts`, `lib/admin/track.ts` |
| Display | `lib/format.ts`, `lib/i18n.ts`, `lib/localize-advisor.ts`, `lib/ui/cn.ts`, `lib/chart-theme.ts` |
| Guard HTTP | `lib/smart-guard/client.ts` |
| Admin display | `lib/admin/money.ts`, `lib/admin/types.ts`, `lib/admin/config.ts` (also type-imported by server) |

### Server-only

| Area | Files |
| --- | --- |
| HTTP | `app/api/**/route.ts`, `server/http.ts`, `middleware.ts` |
| Auth | `server/crypto/*`, `server/middleware/authenticate.ts`, `authorize.ts`, `lib/server/send-password-email.ts` |
| Data | `server/db/postgres.ts`, `server/storage/json-store.ts`, `server/repositories/*` |
| Guard impl | `server/smart-guard/{run,camara,nac-client,nac-env,network-code,nokia-mock,nac-simulator,identity,demo}` |
| Ingest | `server/financial-engine/parser/*`, `upload/` |

### Shared (safe both sides today)

| File | Why |
| --- | --- |
| `lib/financial-engine/types` | types + `FileParseError` class; no I/O |
| `lib/shared/math.ts` | pure numerics |
| `lib/shared/smart-guard.ts` | actions, verdict types, demo flags |
| `lib/shared/nac-contract.ts` | CAMARA request/response shapes; **no API keys** |
| `server/validators/*.ts` | Zod only |
| `lib/smart-guard/policy.ts` | pure decision table (business logic — **not** a candidate for a dump-into-shared of secrets, but it is isomorphic). P9 should **not** treat policy as database/auth. |

### Database

`server/db/postgres.ts`, `server/storage/json-store.ts`, five repositories. Dual-write JSON + Postgres remains. **No schema/data change in P9.**

### Authentication

Cookies `sp_session` / `sp_admin` (httpOnly HMAC). Secrets: `SESSION_SECRET`, `ADMIN_EMAIL` / `ADMIN_PASSWORD`, SMTP env, `NAC_API_KEY`. All reads are under `server/` except SMTP still in `lib/server/send-password-email.ts`.

### Business logic

Services under `server/services/`. Guard policy in `lib/smart-guard/policy.ts`. Financial KPIs in `lib/financial-engine/core/analytics.ts`.

### Financial engine

Client-safe core under `lib/financial-engine/`. Server parser under `server/financial-engine/parser/`. **Do not move parser into shared or frontend.** Core still imports `lib/format.ts` (month labels) — so it is **not** a clean `shared/financial-engine/` candidate until format is split. **Keep `lib/financial-engine/` in P9.**

### Smart Guard

Client: `client.ts` + types. Server: `server/smart-guard/*` + `guard.service.ts`. Fail-closed freeze lives in `app/api/smart-guard/evaluate/route.ts` (must stay). Policy is pure.

### Utilities

`lib/shared/math.ts`, `lib/phone.ts`, `lib/dates.ts` (shim → core).

---

## 4. Targeted leak hunt (before P9)

### Server imports inside Client

**None found.** `"use client"` files do not import `@/server`, `@/lib/server`, `@/lib/db`.

### Client imports inside Server

Server does not import React components. It **type-imports** `AdminFacts` from `lib/admin/metrics.ts` (a module that also contains `localStorage` helpers). Type-only — acceptable; moving the `AdminFacts` type later would be cleaner.

### Database imports inside UI

**None.** `lib/db/postgres.ts` is unused but **still a live re-export** of `queryPostgres`. Any future Client import would leak `pg` + `DATABASE_URL`.

### Secrets inside Client / `process.env` inside Client

No `process.env` in `components/`, `context/`, or `"use client"` pages. All `process.env` hits are tests, `server/*`, `json-store`, or SMTP.

`lib/i18n.ts` contains the **string** `"DATABASE_URL"` in a translation (`guard.logs.postgresDown`). It does not read the env var.

### Circular dependencies

No A↔B cycles found among `server/services` ↔ `repositories` ↔ `db`.  
`lib/smart-guard/types` → `lib/shared/smart-guard` (one way).  
`lib/financial-engine/core/*` import each other in a DAG (analytics → advisor/forecast/opex, not back).

### Legacy shims

| Shim | Kind | Importers | Risk |
| --- | --- | --- | --- |
| `lib/types.ts` … `lib/engine.ts` (P8) | client-safe re-export | **many** (UI + tests) | keep |
| `lib/shared/math.ts` | client-safe | engine core, `lib/utils.ts` | keep or retarget to `shared/` |
| `lib/smart-guard/types.ts` | client-safe re-export | client + server | keep |
| `lib/smart-guard/{run,demo,camara,…}` | `export {}` stubs | none | keep stubs (do not fill) |
| `lib/parser.ts`, `engine-upload.ts`, `pdf-extract`, `ocr`, `table-extract` | `export {}` stubs | none | keep |
| `lib/server/guard-log.ts` | `export {}` stub | none | keep |
| `lib/db/postgres.ts` | **re-exports Postgres** | **none** | neutralize (stub) — landmine |
| `lib/server/json-store.ts` | **re-exports fs** | **none** | neutralize |
| `lib/server/workspaces.ts` | **re-exports repo** | **none** | neutralize |
| `lib/server/events.ts` | **re-exports repo** | **none** | neutralize |
| `lib/server/accounts.ts` | **re-exports repo** | **none** | neutralize |
| `lib/server/request-meta.ts` | re-exports `server/http` | **none** | neutralize |
| `lib/server/send-password-email.ts` | **live SMTP** | `auth.service.ts` | move under `server/`, then stub |
| `lib/utils.ts` | cn + math | `export-report.ts` only for math | keep; retarget report to math |

### Barrels that mix Client + Server

`lib/smart-guard/index.ts` exports **policy + types only** (not `run`). Safe.  
`lib/db/postgres.ts` is the remaining dangerous barrel (unused).

### Imports from `lib/server`

Only `auth.service.ts` → `send-password-email.ts`. Other `lib/server/*` have **zero** importers.

### Stale P8 paths

`@/lib/parser` is a stub. Live parse is `@/server/financial-engine/parser`.  
`POST /api/analyze` already uses `@/server/financial-engine/analysis`.  
Tests and UI still use `@/lib/analytics` shims (intentional).

---

## 5. API → Service → Repository (today)

| Route | Service | Direct repo/db? |
| --- | --- | --- |
| `/api/auth/*` | `auth.service` | no (cookies via `server/crypto/session` in the route) |
| `/api/workspace` | `workspace.service` | no |
| `/api/track` | `track.service` | no |
| `/api/admin/*` | `admin.service` | no (cookies in login/logout routes) |
| `/api/smart-guard/evaluate` | `guard.service` | no; fail-closed **in the route** |
| `/api/smart-guard/logs|demo|step-up/*` | `guard.service` | identity helper in route (session), not repo |
| `/api/analyze` | **no `*.service.ts`** | uses `server/financial-engine/analysis` (parser + core) |
| `/api/nac/*` | **no domain service** | `nac-simulator` / `nokia-mock` (intentional since P6) |

Cookie attach/clear at the route is HTTP-adapter work, not a repository leak.

---

## 6. P9 target (this phase — still one Next.js app)

```text
shared/           types, contracts, constants, validation (isomorphic)
lib/financial-engine/   KEEP (depends on lib/format)
server/                 KEEP (do not rename to backend/)
app/ + components/      KEEP (do not move to frontend/)
```

**Out of P9:** split into two apps, move `app/` → `frontend/`, migrate Postgres, delete JSON, change APIs/cookies/formulas.

---

## 7. Safe P9 moves (planned after this inventory)

1. Create `shared/{types,contracts,constants,validation}/` from already-isomorphic modules.
2. Do **not** move parser, SMTP secrets, postgres, or Guard `run` into `shared/`.
3. Do **not** move `lib/financial-engine/core` into `shared/` (format coupling).
4. Neutralize unused server re-export shims (`lib/db/postgres`, unused `lib/server/*`).
5. Move SMTP implementation to `server/mail/`.
6. Optional thin `analyze.service.ts` so `/api/analyze` matches API → Service.
7. Architecture tests that fail the build if Client imports Server/DB/Node ingest.
