# Smart Guard Migration Inventory (before P4)

**Date:** 2026-08-21  
**Phase:** P4 — architecture refactor only. No security rewrite.  
**Rule:** this file is the audit. Implementation follows it. Do not delete files. Do not change API, schema, auth, cookies, rate limits, NAC behavior, or Fail-Closed.

Target after P4:

```text
app/api/smart-guard/*          HTTP only (URLs frozen)
        ↓
server/smart-guard/*           Guard implementation
        ↓
server/repositories/*          Guard data access
        ↓
server/db/postgres.ts          Postgres (already moved in P3)
lib/server/json-store.ts       JSON fallback (not moved in P4)
```

Client-safe types/constants: `lib/shared/*`  
Client fetch + policy: `lib/smart-guard/{client,policy}`  
Barrel `lib/smart-guard/index.ts` must **not** export `run.ts` or any server module.

---

## Legend

| Column | Meaning |
| --- | --- |
| Client / Server | Who may import it after P4 |
| Secrets | Reads `NAC_*`, `DATABASE_URL`, `SESSION_SECRET`, SMTP, or similar |
| Filesystem | `json-store` / `data/*.json` |
| Postgres | `queryPostgres` / `postgresConfigured` |
| Session/auth | Cookie session, `requireMerchant`, `optionalMerchant`, `findAccount` |
| Route imports | An `app/api/**/route.ts` imports this file **directly** |
| Leak risk | Could pull server-only code into a Client bundle if imported from `"use client"` or a client graph |

---

## 1–10. Current Smart Guard files

### A. Already on the server (keep; retarget types only if needed)

| File | Importers | Client/Server | Secrets | FS | Postgres | Session/auth | Route imports | Move-with | Leak |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `server/smart-guard/identity.ts` | evaluate, send, verify; tests (policy, step-up, IDOR, integrity) | Server | no | no | no | yes (`optionalMerchant`) | yes (3 Guard routes) | stays; types from client-safe module | none if not imported by client. **No client importer today.** |

### B. Client-safe — stay under `lib/smart-guard` (types/constants also copied to `lib/shared`)

| File | Importers | Client/Server | Secrets | FS | Postgres | Session/auth | Route imports | Move-with | Leak |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `lib/smart-guard/types.ts` | client, policy, demo, run, camara, identity, evaluate, overlay, context, demo-panel, log-panel, nac mock gate, guard-log | **Client-safe** | no | no | no | no | evaluate (types only), nac mock gate | copy canonical to `lib/shared/smart-guard.ts`; old path re-exports (safe) | none |
| `lib/smart-guard/client.ts` | `"use client"` pages/components/context (login, settings, overlay, what-if, file-dropzone, recommendations, analysis-context, smart-guard-context) | **Client** | no | no | no | no (fetch only) | no | stay. Depends on `types` only | none. Fail-closed `denyFallback` must not change |
| `lib/smart-guard/policy.ts` | run, camara, nac mock gate, `tests/smart-guard-policy.test.ts` | **Client-safe** (pure) | no | no | no | no | nac mock gate | stay. Depends on `types` + `SIM_SWAP_MAX_AGE_HOURS` | **today:** imports `nac-contract.ts` which **also** defines `nacHeaders()` (secret helper). If a client ever imported `policy`, the whole `nac-contract` module (including secret-reading functions) would enter the client graph. **No client imports policy today.** P4 splits secrets out of `nac-contract`. |

### C. Mixed module — must split (landmine)

| File | Importers | Client/Server | Secrets | FS | Postgres | Session/auth | Route imports | Move-with | Leak |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `lib/smart-guard/nac-contract.ts` | policy (constant only), nac-client, nokia-mock, network-code, run, nac sim-swap check route, nac mock gate | **Mixed** | **yes** (`nacMode`, `nacBaseUrl`, `nacHeaders` → `NAC_API_KEY`, `NAC_BASE_URL`, `NAC_RAPIDAPI_HOST`) | no | no | no | yes (2 NAC routes: constant only) | **Split:** constants + CAMARA types → `lib/shared/nac-contract.ts`. Env helpers → `server/smart-guard/nac-env.ts`. Old path may re-export **constants/types only**. | **High if policy stays coupled to the mixed file.** After split: low. |

### D. Server-only under `lib/smart-guard` — move to `server/smart-guard/*`

| File | Importers | Client/Server | Secrets | FS | Postgres | Session/auth | Route imports | Move-with | Leak |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `lib/smart-guard/run.ts` | evaluate, step-up/verify; **barrel `index.ts`** | Server | indirect (`NAC_*` via camara; `DATABASE_URL` via guard-log) | via demo + guard-log | via guard-log | yes (`findAccount` / `upsertAccount`) | yes (evaluate, verify) | camara, demo, policy, types, nac-env, accounts/user.repository, guard-log | **Critical via barrel.** No production importer of `@/lib/smart-guard` (index) found. Do **not** re-export `run` from `lib/` |
| `lib/smart-guard/demo.ts` | run, camara, nokia-mock, demo route, verify (`markStepUpVerified`) | Server | no | **yes** `nac-demo.json` via json-store | no | keyed by email (not cookie) | yes (`/api/smart-guard/demo`) | json-store, types | High if client imported it. **Do not shim from `lib/`** |
| `lib/smart-guard/camara.ts` | run only | Server | via nac-client | via demo session maps | no | no | no | nac-client, demo, policy, nac-contract constants | High if imported from client. **Do not shim** |
| `lib/smart-guard/nac-client.ts` | camara only | Server | **yes** live `fetch` + `nacHeaders()` | no (simulator path hits nokia-mock → demo FS) | no | no | no | nac-env, nac-simulator, `lib/phone` | **Secrets.** Do not shim |
| `lib/smart-guard/nokia-mock.ts` | nac-simulator, `/api/nac`, `/api/nac/mock/gate` | Server | no | via `readDemoFlags` | no | no | yes (2 NAC routes) | demo, nac-contract types | Static `NOKIA_MOCK_PROFILES` is data-only, but file imports demo (FS). Move whole file. **Do not shim** |
| `lib/smart-guard/nac-simulator.ts` | nac-client; `/api/nac/sim-swap/*`, `number-verification`, `location-verification` | Server | no | via nokia-mock | no | no | yes (4 NAC routes) | nokia-mock | Re-export only. Move with nokia-mock. **Do not shim** |
| `lib/smart-guard/network-code.ts` | send, verify; `tests/step-up.test.ts` | Server | no (`nacMode()` only to decide `demoCode`) | no | no | no (in-memory Map) | yes (send, verify) | nac-env; Node `crypto` | **Do not shim.** Node `crypto` + OTP store must not enter client |
| `lib/smart-guard/index.ts` | **none in production/tests** | Barrel | via `run` | via `run` | via `run` | via `run` | no | must drop `run` export | **Highest landmine:** `export { runSmartGuard } from "./run"` would pull Postgres + secrets into any future `from "@/lib/smart-guard"`. **Split the barrel. Do not re-export run.** |

### E. Guard data access — move to `server/repositories`

| File | Importers | Client/Server | Secrets | FS | Postgres | Session/auth | Route imports | Move-with | Leak |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `lib/server/guard-log.ts` | run (`appendGuardDecision`); logs route (`listGuardDecisions`) | Server | `DATABASE_URL` via postgres | **yes** `guard-decisions.json` | **yes** `guard_decisions` | no (email argument; logs route adds session) | yes (`GET /api/smart-guard/logs`) | `server/db/postgres`, json-store, types | **Do not shim from `lib/server`.** Postgres in client bundle = STOP |

### F. Adjacent (not Guard implementation; do **not** move in P4)

| File | Why listed | P4 action |
| --- | --- | --- |
| `lib/server/json-store.ts` | demo + guard-log filesystem | leave (later storage phase) |
| `lib/server/accounts.ts` | run + step-up/send `findAccount` | leave shim; callers may retarget `user.repository` (same functions) |
| `lib/server/request-meta.ts` | evaluate + verify IP/UA for logs | leave |
| `lib/db/postgres.ts` | P3 re-export of `server/db/postgres.ts` | leave; new guard-log imports `@/server/db/postgres` |
| `lib/phone.ts` | nac-client E.164 | leave (client-safe helper) |
| `server/middleware/rate-limit.ts` | evaluate / send / verify | **do not change limits** |
| `server/http.ts` CSRF `apiRoute` | Guard mutating routes | **do not change** |
| `server/middleware/authenticate.ts` | logs, demo, identity | **do not change** |

---

## API routes (URLs frozen — P4 retargets imports only)

| Route | Current Guard imports | After P4 |
| --- | --- | --- |
| `POST /api/smart-guard/evaluate` | `types`, `run`, identity, request-meta | `run` → `@/server/smart-guard/run` |
| `GET /api/smart-guard/logs` | `guard-log`, `requireMerchant` | `listGuardDecisions` → repository via `@/server/smart-guard` or repository |
| `GET/POST /api/smart-guard/demo` | `demo` | `@/server/smart-guard/demo` |
| `POST /api/smart-guard/step-up` | none (400 stub) | unchanged |
| `POST /api/smart-guard/step-up/send` | `network-code`, accounts, identity | `@/server/smart-guard/network-code` |
| `POST /api/smart-guard/step-up/verify` | `network-code`, `demo`, `run`, identity | all three → `server/smart-guard/*` |
| `GET /api/nac` | nokia-mock | `@/server/smart-guard/nokia-mock` |
| `POST /api/nac/mock/gate` | types, policy, nokia-mock, nac-contract constant | mock → server; policy/types stay client-safe |
| `POST /api/nac/sim-swap/v1/check` | nac-contract constant, nac-simulator | simulator → server |
| `POST /api/nac/sim-swap/v1/retrieve-date` | nac-simulator | server |
| `POST /api/nac/number-verification/v1/verify` | nac-simulator | server |
| `POST /api/nac/location-verification/v1/verify` | nac-simulator | server |

Client Guard UI continues to call the **same** `/api/smart-guard/*` URLs via `lib/smart-guard/client.ts`.

---

## Client importers today (must keep this graph)

All of these import **only** `client.ts` and/or `types.ts`:

- `context/smart-guard-context.tsx`
- `context/analysis-context.tsx`
- `components/guard/smart-guard-overlay.tsx`
- `components/guard/smart-guard-demo-panel.tsx`
- `components/guard/smart-guard-log-panel.tsx`
- `components/dashboard/file-dropzone.tsx`
- `components/forecasts/recommendations.tsx`
- `components/advisor/what-if.tsx`
- `app/login/page.tsx`
- `app/forgot-password/page.tsx`
- `app/(app)/settings/page.tsx`

**No** `"use client"` file imports `run`, `demo`, `camara`, `nac-client`, `nokia-mock`, `network-code`, `guard-log`, or `@/lib/smart-guard` (barrel).

---

## Compatibility re-export policy for P4

| Path | Re-export allowed? | Why |
| --- | --- | --- |
| `lib/smart-guard/types.ts` → `lib/shared/smart-guard.ts` | **yes** | types/constants only |
| `lib/smart-guard/nac-contract.ts` → `lib/shared/nac-contract.ts` (constants/types **only**) | **yes** | after secrets removed |
| `lib/smart-guard/index.ts` → policy + types | **yes**, without `run` | split barrel |
| `lib/smart-guard/run.ts` → `server/smart-guard/run.ts` | **no** | would make Postgres importable from `lib/` |
| `lib/smart-guard/demo.ts` → server | **no** | filesystem |
| `lib/smart-guard/camara.ts` / `nac-client.ts` / `nokia-mock.ts` / `nac-simulator.ts` / `network-code.ts` | **no** | secrets / Node crypto / FS |
| `lib/server/guard-log.ts` → repository | **no** | Postgres |

Old files stay on disk as **stubs** (`export {}` + comment). They are not deleted.

---

## Out of scope (must remain 0)

- API contracts, response shapes, status codes
- Postgres schema / `CREATE TABLE` SQL
- JSON data in `data/`
- Authentication cookies (`sp_session`, `sp_admin`)
- Authorization / step-up identity rules
- Rate limits, CSRF, Fail-Closed freeze on evaluate error
- Financial engine
- P5+ (json-store move, workspace collapse, engine folder, etc.)
