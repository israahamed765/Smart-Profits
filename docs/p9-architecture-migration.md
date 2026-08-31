# P9 Architecture Migration

**Date:** 2026-08-23  
**Scope:** internal layering inside the same Next.js monolith. No `frontend/` / `backend/` apps. No P10.

Inventory (before any code): `docs/p9-architecture-inventory.md`.

---

## 1. Status before P9

One Next.js 16 app after P8:

- Client-safe financial core in `lib/financial-engine/`
- Server parser in `server/financial-engine/parser/`
- Shared-ish pieces still under `lib/shared/`
- Dangerous unused re-exports: `lib/db/postgres.ts`, several `lib/server/*` files still `export *` from Postgres/fs/repos
- SMTP implementation still in `lib/server/send-password-email.ts`
- `/api/analyze` called `server/financial-engine/analysis` directly (no service wrapper)
- Tests: 63 passed. Build: PASS. Client bundle clean.

---

## 2. Files moved (implementation relocated)

| From | To |
| --- | --- |
| `lib/financial-engine/types/index.ts` | `shared/types/financial.ts` |
| `lib/shared/math.ts` | `shared/constants/math.ts` |
| `lib/shared/smart-guard.ts` | `shared/types/smart-guard.ts` |
| `lib/shared/nac-contract.ts` | `shared/contracts/nac-contract.ts` |
| `server/validators/*.ts` (bodies) | `shared/validation/{auth,workspace,track,admin,profile}.ts` |
| `lib/server/send-password-email.ts` | `server/mail/send-password-email.ts` |

Old paths remain as shims or empty stubs (see §5).

**Not moved (intentional):**

- `app/` pages and `app/api` URLs
- `components/`, `context/`
- `lib/financial-engine/core/*` (still imports `lib/format.ts` month labels)
- `server/financial-engine/parser/` (xlsx / unpdf / tesseract)
- `server/db`, `server/repositories`, `server/storage`
- `data/` JSON files

---

## 3. Files created

```text
shared/types/financial.ts
shared/types/smart-guard.ts
shared/contracts/nac-contract.ts
shared/constants/math.ts
shared/constants/guard.ts
shared/validation/{auth,workspace,track,admin,profile}.ts
server/mail/send-password-email.ts
server/services/analyze.service.ts
tests/architecture-boundary.test.ts
docs/p9-architecture-inventory.md
docs/p9-architecture-migration.md
```

---

## 4. Files deleted

None. Dangerous shims were emptied (`export {}`), not removed, so a stray old import fails loudly instead of pulling Postgres into a Client graph.

---

## 5. Shims that remain

**Client-safe re-exports (still imported by UI/tests):**

- `lib/types.ts`, `lib/analytics.ts`, `lib/advisor.ts`, `lib/forecast.ts`, `lib/opex.ts`, `lib/financial-integrity.ts`, `lib/classify.ts`, `lib/mapping.ts`, `lib/sample-data.ts`, `lib/engine.ts`, `lib/serialize.ts`, `lib/dates.ts`, `lib/sheets.ts`, `lib/scope.ts`
- `lib/financial-engine/types/index.ts` → `@/shared/types/financial`
- `lib/shared/{math,smart-guard,nac-contract}.ts` → `@/shared/...`
- `lib/smart-guard/{types,nac-contract}.ts` → `@/shared/...`
- `lib/utils.ts` → `cn` + shared math
- `server/validators/*.ts` → `@/shared/validation/*`

**Empty stubs (must never be filled with `export * from server`):**

- `lib/db/postgres.ts`
- `lib/server/{json-store,workspaces,events,accounts,request-meta,send-password-email,guard-log}.ts`
- `lib/parser.ts`, `lib/engine-upload.ts`, `lib/pdf-extract.ts`, `lib/ocr.ts`, `lib/table-extract.ts`
- `lib/smart-guard/{run,demo,camara,nac-client,nokia-mock,nac-simulator,network-code}.ts`

---

## 6. Imports that changed

| Caller | Was | Now |
| --- | --- | --- |
| financial core (`analytics`, `advisor`, `opex`, `financial-integrity`) | `@/lib/shared/math` | `@/shared/constants/math` |
| `lib/export-report.ts` | `@/lib/utils` (`safeDivide`) | `@/shared/constants/math` |
| `server/smart-guard/{camara,nac-client,nokia-mock,nac-env}` | `@/lib/shared/nac-contract` | `@/shared/contracts/nac-contract` |
| `server/services/auth.service.ts` | `@/lib/server/send-password-email` | `@/server/mail/send-password-email` |
| `app/api/analyze/route.ts` | `analyzeFinancialFile` from analysis module | `analyzeMerchantFile` from `analyze.service` |
| API/tests using validators | `@/server/validators/*` (unchanged path) | those files re-export `shared/validation` |

UI still imports `@/lib/engine`, `@/lib/advisor`, etc. That is allowed: those shims only reach client-safe core / shared types.

---

## 7. Client / Server boundary

```text
"use client"
  → lib/* shims → lib/financial-engine/core + shared/types + shared/constants
  → lib/smart-guard/client.ts (fetch /api/smart-guard/*)
  ✗ never @/server, @/lib/server, @/lib/db, xlsx, unpdf, tesseract, pg

Server
  app/api → server/http + middleware + services
  ✗ never @/components, @/lib/ui
```

Enforced by `tests/architecture-boundary.test.ts` and the P8 financial-engine boundary tests.

---

## 8. Shared boundary

```text
shared/
  types/       financial + smart-guard (no I/O)
  contracts/   CAMARA request/response shapes (no NAC_API_KEY)
  constants/   math + guard action names
  validation/  Zod schemas
```

Rules: no React, no Next, no `process.env`, no `server/`, no filesystem, no Postgres, no SMTP, no parser.

**Not in shared:** Guard `policy.ts` (decision business logic, still isomorphic at `lib/smart-guard/policy.ts`), financial **formulas** (`lib/financial-engine/core`), parser, mail, sessions.

---

## 9. Database boundary

Unchanged location:

```text
API → services → repositories → server/db/postgres.ts
                               → server/storage/json-store.ts
```

Frontend has no import path to `pg`, `queryPostgres`, or JSON storage. Former `lib/db/postgres.ts` re-export is now an empty stub.

No schema change. No `data/` rewrite.

---

## 10. Authentication boundary

```text
Client: login UI, auth-context, fetch /api/auth/*
Backend: auth.service, crypto/session, password scrypt, CSRF, rate limit
         server/mail/send-password-email.ts (SMTP)
Cookies: sp_session / sp_admin — same httpOnly HMAC behavior
```

Secrets stay in `server/crypto/session.ts`, `admin.service.ts`, `nac-env.ts`, `server/mail/*`.

---

## 11. Architecture tests

`tests/architecture-boundary.test.ts`:

1. Client → server / db / Node ingest — forbidden  
2. Client → secret `process.env.*` — forbidden  
3. Server → UI (`components`, `lib/ui`) — forbidden  
4. `shared/` → server / React / Next / Node I/O — forbidden  
5. Dangerous shims remain `export {}`  
6. Evaluate route still fail-closes (`blocking action`, `freeze`, `check_failed`)  
7. No circular local imports  
8. Financial core math comes from `@/shared/constants/math`

Plus existing auth, IDOR, CSRF, step-up, integrity, and P8 engine tests.

---

## 12. Security verification

| Check | Result |
| --- | --- |
| Fail-closed evaluate | source + test still require freeze / `check_failed` / 503 |
| IDOR (session email wins) | `authorization-idor.test.ts` pass |
| Authentication | `auth.test.ts` pass |
| Step-up | `step-up.test.ts` pass |
| CSRF | `csrf.test.ts` pass |
| Rate limiting | still in `apiRoute` / analyze / auth / evaluate (unchanged) |
| parseResult integrity | integrity + forgery tests pass |
| Golden KPIs | 700 / 280 / 420 / 60%; opex net 600 |

---

## 13. `npm test`

**71 passed / 0 failed** (63 after P8 + 8 architecture tests).

---

## 14. `next build`

**PASS.** Same json-store Turbopack tracing warning as P5–P8 (server-only). All `/api/*` URLs unchanged.

---

## 15. Client bundle (`.next/static`)

- No `tesseract.js` / `unpdf` / `sheet_to_json` / SheetJS  
- No `SESSION_SECRET` / `ADMIN_PASSWORD` / `NAC_API_KEY` / `MAIL_APP_PASSWORD`  
- `DATABASE_URL` only as an i18n string (`guard.logs.postgresDown`)

---

## 16. Remaining risks (not P9 / not P10)

- Filling any empty stub with `export * from "@/server/..."` would recreate a Client leak.
- `lib/financial-engine/core` still depends on `lib/format.ts` (display). Do not copy the core into `shared/` until month labels are split.
- `/api/nac/*` still talks to `nac-simulator` / `nokia-mock` without a domain service (same as P6).
- Dual-write JSON + Postgres is not cut over.
- Cookie attach/clear still lives on some auth routes (`server/crypto/session`) — HTTP adapter, not a repository leak.
- `lib/admin/metrics.ts` is mixed (localStorage helpers + `AdminFacts` type imported by `admin.service`). Type-only on the server today.
- Next.js `middleware.ts` deprecation warning (framework, out of scope).
- **Do not** move `app/` into `frontend/` or split repositories until review.

P9 stops here.
