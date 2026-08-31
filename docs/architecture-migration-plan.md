# Smart Profits — Architecture Migration Plan

**Status:** P1/P2 done. **P3:** Postgres client lives in `server/db/postgres.ts`; `lib/db/postgres.ts` is a re-export. JSON store and Guard untouched.  
**Date:** 2026-08-21  
**Baseline tests:** 51 passed / 0 failed (`npm test`)  
**Stack that must stay:** one Next.js 16 + TypeScript app. Financial engine stays TypeScript. Public URLs stay `/api/*`.

This document is the design for a **later**, gradual move **inside the same repo**. It is not permission to start moving files. Start a move only after explicit approval of this plan, one micro-phase at a time, with `npm test` after every phase.

---

## Current Architecture

This is a **Next.js monolith**, not four applications.

```text
smart-profit/
├── app/                  pages (UI) + app/api/**/route.ts (HTTP)
├── components/           React UI
├── context/              client state
├── lib/                  MIXED: UI helpers + engine + Smart Guard + server I/O
├── server/               HTTP helpers, crypto, middleware, services, some repos
├── data/                 JSON fallback (users, workspaces, events, guard)
├── middleware.ts         Edge gate for /api/admin/*
├── tests/                51 Node tests
└── docs/
```

### How a request actually flows today

```text
Browser (app pages, components, context)
  → fetch /api/*
       → app/api/**/route.ts
            → server/http (CSRF) + middleware (session, rate limit)
            → server/services + server/smart-guard/identity
            → server/repositories  OR  lib/server/*  OR  lib/db/postgres
            → lib/analytics + lib/parser          (/api/analyze)
            → lib/smart-guard/run                 (/api/smart-guard/evaluate)
```

Verified **non-edges** (do not invent them later):

- No `"use client"` file imports `@/server/*`, `@/lib/server/*`, or `@/lib/db/*`.
- No Python engine. `lib/parser.ts` is only imported by `app/api/analyze/route.ts` and (indirectly) by `lib/engine.ts`.
- Cookies `sp_session` / `sp_admin` are set only in `server/crypto/session.ts` from API routes.

### Layer map as the code exists (not as we wish it)

| Layer | What it is today | Where it lives |
| --- | --- | --- |
| Frontend/UI | Pages, components, context | `app/` (non-api), `components/`, `context/` |
| API | Next.js Route Handlers | `app/api/**/route.ts` (27 files). **Do not relocate these in early phases.** |
| Server/Backend | Session, CSRF, services, validators | `server/` **and** `lib/server/` |
| Financial Engine | Parse + KPIs + advisor + forecast | `lib/analytics.ts`, `parser.ts`, `advisor.ts`, `forecast.ts`, `classify.ts`, `opex.ts`, `mapping.ts`, `financial-integrity.ts`, `engine.ts`, plus helpers |
| Database / data access | Postgres pool + JSON files | `lib/db/postgres.ts`, `lib/server/json-store.ts`, `lib/server/workspaces.ts`, `lib/server/events.ts`, `lib/server/guard-log.ts`, `server/repositories/user.repository.ts` |
| Security / Auth | Cookies, scrypt, CSRF, Guard identity | `server/crypto/*`, `server/middleware/*`, `server/smart-guard/identity.ts`, `middleware.ts`, `lib/smart-guard/policy.ts` + `run.ts` |

`lib/` is the crowded floor: UI, engine, Guard client, Guard server, and disk/Postgres all share one prefix.

---

## Target Architecture

Stay **inside this Next.js app**. Do not create `frontend/`, `backend/`, `financial-engine/` (Python), or `database/` as separate deployables.

```text
smart-profit/                          # still one Next.js project
├── app/                               # pages + API routes (URLs frozen)
├── components/                        # UI only
├── context/                           # client state only
├── lib/
│   ├── shared/                        # types, serialize, phone, tenant, math
│   ├── ui/                            # i18n, cn, chart-theme, format display
│   ├── engine/                        # TypeScript financial engine (pure)
│   └── smart-guard/                   # client.ts, types.ts, policy.ts only
├── server/
│   ├── db/postgres.ts
│   ├── storage/json-store.ts
│   ├── repositories/                  # real implementations (not shims)
│   ├── services/
│   ├── middleware/
│   ├── crypto/
│   ├── http.ts
│   └── smart-guard/                   # run, demo, nac, network-code, identity
├── middleware.ts                      # must stay at repo root (Next.js)
├── data/                              # JSON stays; no schema migration in this plan
└── tests/
```

**Hard target rules**

- One process, one origin, same cookies.
- `app/api/**` paths never change (`/api/auth/login`, `/api/workspace`, `/api/analyze`, `/api/smart-guard/*`, `/api/nac/*`, `/api/admin/*`, `/api/track`).
- Engine stays TypeScript. Parser stays TypeScript.
- JSON + Postgres dual-write stays as-is until a later, separate data project.
- Every move uses a **re-export shim** at the old path until tests and importers are updated.

---

## Dependency Rules

Allowed direction (after migration):

```text
UI  →  lib/shared, lib/ui, lib/smart-guard/{client,types,policy}
UI  →  fetch /api/* only for secrets, persistence, Guard evaluate, analyze-from-file

API routes  →  server/*  →  repositories/db
API routes  →  lib/engine  (analyze, integrity)
API routes  →  lib/smart-guard/policy + server/smart-guard/run

lib/engine  →  lib/shared only
lib/smart-guard/policy  →  lib/smart-guard/types only

server/repositories  →  server/db + server/storage
server/services  →  repositories + crypto + lib/shared
```

Forbidden:

```text
UI            ↛  server/*, lib/server/*, lib/db/*, parser.ts, run.ts, json-store, postgres
lib/engine    ↛  server/*, React, next/headers, cookies
lib/shared    ↛  server/*, engine/, components/
repositories  ↛  services/, route.ts, React
policy.ts     ↛  postgres, json-store, fetch to NaC
```

`analyzeParsed` on the client is **allowed as a compatibility behavior today** (dashboard recomputes from sanitized `parseResult`). Moving `parser.ts` into the client bundle is **not** allowed. That is why `lib/engine.ts` must later split demo glue from `analyzeUploadedFile`.

---

## Import Rules

1. Client files (`"use client"`, `components/*`, `context/*`, `app/**/page.tsx`) may import:
   - `@/components/*`, `@/context/*`
   - `@/lib/ui/*`, `@/lib/shared/*`
   - `@/lib/smart-guard/client`, `types`, `policy`
   - `@/lib/engine` **only** for demo data + `analyzeParsed` until a later UI phase (not parser)
2. API `route.ts` files may import `@/server/*` and `@/lib/engine/*` and `@/lib/shared/*`. They must not contain business formulas inline.
3. Never import `@/lib/smart-guard` (barrel). Today `lib/smart-guard/index.ts` re-exports `run.ts`, which pulls Postgres. No production file imports the barrel **yet**; it is a landmine. Future phase: stop exporting `run` from the barrel **or** delete the barrel after a shim.
4. `server/repositories/*` must not import `app/api`.
5. Tests may import any layer. They are not a production layer.
6. During a move: keep `export * from "@/new/path"` at the old path so existing `@/lib/...` imports keep working.

---

## Dependency Map (from current imports)

### Frontend → mixed `lib`

| Importer | Imports | Risk |
| --- | --- | --- |
| `context/analysis-context.tsx` | `lib/engine` (`analyzeParsed`, `demoParseResult`), `opex`, `classify`, `serialize`, `sample-data` | Pulls **full analytics** (and `engine.ts` also imports **parser**) into the client graph |
| `components/advisor/what-if.tsx` | `lib/advisor.simulateWhatIf` | Formula on client (presentation) |
| `components/advisor/ask-box.tsx` | `lib/qa`, `lib/advisor-knowledge` | `qa` → `runFullAnalysis` |
| `components/dashboard/opex-insights.tsx` | `lib/opex` compute helpers | Formula on client |
| `app/(app)/settings/page.tsx` | `lib/export-report` | `export-report` → `advisor` + `analytics` |
| Guard UI | `lib/smart-guard/client` + `types` | Allowed |
| Auth/admin UI | `lib/admin/track`, `lib/admin/config`, `lib/phone` | `ADMIN_LOGIN_HINT_EMAIL` is a hint string, not the password |

### API → server + engine + lib/server

| Route group | Downstream |
| --- | --- |
| `/api/auth/*` | `server/http`, validators, `auth.service`, `session` |
| `/api/workspace` | `workspace.service` → serialize + `lib/server/workspaces` |
| `/api/analyze` | `parser` + `runFullAnalysis` + `requireMerchant` |
| `/api/smart-guard/evaluate` | `identity` + `lib/smart-guard/run` |
| `/api/smart-guard/step-up/*` | `identity` + `network-code` + `demo` + `lib/server/accounts` |
| `/api/admin/*` | `admin.service` + `requireAdmin`; Edge `middleware.ts` also reads admin cookie |
| `/api/track` | `track.service` → `lib/server/events` |
| `/api/nac/*` | `lib/smart-guard/nokia-mock` (simulator HTTP) |

### Server shims (two homes for the same I/O)

```text
server/repositories/workspace.repository.ts  →  lib/server/workspaces.ts  →  postgres + json-store
server/repositories/event.repository.ts      →  lib/server/events.ts
lib/server/accounts.ts                       →  server/repositories/user.repository.ts  →  postgres + json-store
lib/smart-guard/run.ts                       →  lib/server/accounts + lib/server/guard-log
```

`user.repository` is the real merchant store. Workspace/events still live under `lib/server` with a thin `server/repositories` facade.

### Engine internal graph (acyclic)

```text
parser → mapping, classify, dates, sheets, types
analytics → financial-integrity, advisor, classify, forecast, opex, format, dates, sheets, utils
advisor → utils, types
qa → analytics → advisor
engine → analytics + parser + sample-data
serialize → financial-integrity → types, utils
```

### Data access

```text
lib/db/postgres.ts
  ↑
user.repository, workspaces.ts, events.ts, guard-log.ts
  ↑
json-store.ts (filesystem /tmp on Vercel)
```

---

## Circular Dependencies

**No TypeScript import cycle** was found among production modules.

**Alias / barrel hazards** (not cycles, but they behave like one at bundle time):

| Hazard | What happens |
| --- | --- |
| `lib/server/accounts.ts` ↔ `server/repositories/user.repository.ts` | One-way re-export. Two import names for the same module. Easy to create a real cycle later. |
| `lib/smart-guard/index.ts` exports `run.ts` | Any future `from "@/lib/smart-guard"` on the client would pull Postgres + json-store. **No current importer of the barrel.** |
| `lib/engine.ts` imports `parser.ts` | `analysis-context` imports `engine`, so the client module graph includes the parser even though uploads go to `/api/analyze`. |
| `serialize.ts` → `financial-integrity.ts` | One-way. Safe. Do not import `serialize` from `financial-integrity`. |

---

## Files in the wrong layer

These are the files a later migration should relocate (via shim first). UI pages/components that already live in `app/` / `components/` / `context/` are **in the right place** and must not be moved in engine/server phases.

| File | Current layer | Correct layer | Why it is wrong |
| --- | --- | --- | --- |
| `lib/db/postgres.ts` | `lib/` | `server/db` | Secrets + `pg` Pool |
| `lib/server/json-store.ts` | `lib/` | `server/storage` | Filesystem I/O |
| `lib/server/workspaces.ts` | `lib/` | `server/repositories` | Persistence |
| `lib/server/events.ts` | `lib/` | `server/repositories` | Persistence |
| `lib/server/guard-log.ts` | `lib/` | `server/repositories` | Persistence |
| `lib/server/send-password-email.ts` | `lib/` | `server/` | SMTP + secrets |
| `lib/server/request-meta.ts` | `lib/` | `server/` | Request IP/UA |
| `lib/server/accounts.ts` | `lib/` | delete after callers switch | Reverse shim of `user.repository` |
| `server/repositories/workspace.repository.ts` | facade | keep as the **real** module after move | Empty re-export today |
| `server/repositories/event.repository.ts` | facade | same | Empty re-export today |
| `lib/smart-guard/run.ts` | mixed Guard folder | `server/smart-guard` | Uses accounts + guard-log |
| `lib/smart-guard/demo.ts` | mixed | `server/smart-guard` | json-store |
| `lib/smart-guard/camara.ts` | mixed | `server/smart-guard` | NaC I/O |
| `lib/smart-guard/nac-client.ts` | mixed | `server/smart-guard` | `NAC_API_KEY` |
| `lib/smart-guard/nac-simulator.ts` | mixed | `server/smart-guard` | server sim |
| `lib/smart-guard/network-code.ts` | mixed | `server/smart-guard` | in-memory OTP |
| `lib/smart-guard/nokia-mock.ts` | mixed | `server/smart-guard` or stay next to `/api/nac` | Used only by API |
| `lib/smart-guard/index.ts` | barrel | trim or remove | Re-exports `run` |
| `lib/parser.ts` | mixed `lib` | `lib/engine` | Engine; must not ride `engine.ts` into the client |
| `lib/analytics.ts` | mixed `lib` | `lib/engine` | Engine |
| `lib/advisor.ts` | mixed `lib` | `lib/engine` | Engine |
| `lib/forecast.ts` | mixed `lib` | `lib/engine` | Engine |
| `lib/classify.ts` | mixed `lib` | `lib/engine` | Engine |
| `lib/opex.ts` | mixed `lib` | `lib/engine` (+ small UI wrappers later) | Engine math |
| `lib/mapping.ts` | mixed `lib` | `lib/engine` | Parser support |
| `lib/pdf-extract.ts`, `ocr.ts`, `table-extract.ts`, `sheets.ts`, `column-roles.ts` | mixed `lib` | `lib/engine` | Parse pipeline |
| `lib/financial-integrity.ts` | mixed `lib` | `lib/engine` or `lib/shared` | Used by engine + serialize; keep isomorphic |
| `lib/sample-data.ts` | mixed `lib` | `lib/engine` | Demo transactions |
| `lib/engine.ts` | mixed glue | split | Client should not import `parseFinancialFile` |
| `lib/qa.ts` | mixed `lib` | `lib/engine` | Calls `runFullAnalysis` |
| `lib/export-report.ts` | used from settings page | stay UI-adjacent **or** later `/api/export` | Pulls advisor+analytics into client |
| `lib/utils.ts` | mixed | split `cn` vs `round2/clamp` | Tailwind + KPI math |
| `lib/admin/config.ts` | mixed | types → shared; hint email can stay UI | Types used by repos + a public hint constant |

**Leave in place (correct enough):** `components/**`, `context/**`, `app/**/page.tsx`, `app/api/**/route.ts`, `server/crypto`, `server/middleware`, `server/services`, `server/validators`, `server/smart-guard/identity.ts`, `middleware.ts`, `lib/types.ts`, `lib/serialize.ts`, `lib/smart-guard/client.ts`, `lib/smart-guard/types.ts`, `lib/smart-guard/policy.ts`, `lib/i18n.ts`, `lib/format.ts` (until a tiny shared split).

---

## Migration Order

Each phase is one concern. **Stop the phase if `npm test` fails.** Do not batch.

| Phase | Name | What we do | What we do **not** do |
| --- | --- | --- | --- |
| **P0** | This plan | Document only | No file moves |
| **P1** | Shim policy | Agree: new file + `export *` from old path | No importer rewrites yet |
| **P2** | Split `lib/utils` math | Add `lib/shared/math.ts`; `utils.ts` re-exports | No formula change |
| **P3** | Move Postgres | `server/db/postgres.ts` + re-export `lib/db/postgres.ts` | No schema, no `.env` change |
| **P4** | Move json-store | `server/storage/json-store.ts` + re-export | No JSON rewrite |
| **P5** | Collapse workspace/events repos | Body into `server/repositories/*`; `lib/server/*` becomes re-export | No API/JSON shape change |
| **P6** | Point `lib/server/accounts.ts` callers at `user.repository` | Then keep accounts as re-export | No auth cookie change |
| **P7** | Move Guard **server** files | `server/smart-guard/{run,demo,nac-*}` + re-exports under `lib/smart-guard/` | `client.ts` / `policy.ts` stay; no Guard behavior change |
| **P8** | Neutralize barrel | `lib/smart-guard/index.ts` must not export `run` | If anything imported the barrel, fix that first |
| **P9** | Engine folder, **one file per PR** | e.g. `lib/engine/parser.ts` + `lib/parser.ts` re-export | No formula edits |
| **P10** | Split `lib/engine.ts` | `demoParseResult` + `analyzeParsed` vs server-only `analyzeUploadedFile` | Keep `/api/analyze` URL |
| **P11** | Retarget tests/importers to new paths | Then delete shims **last**, one at a time | Never delete shims and move in the same step |
| **Later (not this program)** | Client formula isolation | Optional `/api/what-if` or `/api/export` | **New** routes only; existing URLs stay. Requires a separate product decision |

**Never in this program:** Python rewrite, second HTTP server, cookie domain change, Postgres-only cutover, deleting `data/*.json`.

---

## File-by-File Migration Table

| Current | Proposed | Why | What can break | Tests that gate the move |
| --- | --- | --- | --- | --- |
| `lib/db/postgres.ts` | `server/db/postgres.ts` (old path re-exports) | Data access is not UI `lib` | Pool import path; Vercel `pg` | All 51 (repos used by auth/workspace routes in tests) |
| `lib/server/json-store.ts` | `server/storage/json-store.ts` | Disk I/O | `/tmp` on Vercel; JSON files | Auth + workspace tests; manual login smoke |
| `lib/server/workspaces.ts` | `server/repositories/workspace.repository.ts` (implementation) | Repo should own persistence | Dual-write JSON+PG | `authorization-idor`, `integrity` TEST 8–9; workspace GET 401 |
| `lib/server/events.ts` | `server/repositories/event.repository.ts` | Same | Track POST | Track is not heavily tested — add a tiny test **before** this move if missing |
| `lib/server/guard-log.ts` | `server/repositories/guard-log.repository.ts` | Same | Guard logs UI | evaluate fail-closed tests |
| `lib/server/accounts.ts` | delete after rewire | Duplicate entry to users | `run.ts`, step-up send | step-up + evaluate + auth |
| `lib/server/send-password-email.ts` | `server/mail/send-password-email.ts` | SMTP secret | Forgot-password email | auth validators; manual reset |
| `lib/server/request-meta.ts` | `server/http/request-meta.ts` | Request parsing | Guard log IP | evaluate route tests |
| `lib/smart-guard/run.ts` | `server/smart-guard/run.ts` | Must not be client-importable | Fail-closed evaluate | `smart-guard-policy`, evaluate 400/freeze |
| `lib/smart-guard/demo.ts` | `server/smart-guard/demo.ts` | json-store | Demo flags / step-up mark | step-up tests |
| `lib/smart-guard/network-code.ts` | `server/smart-guard/network-code.ts` | OTP store | Replay/wrong code | `step-up.test.ts` |
| `lib/smart-guard/nac-*.ts`, `camara.ts` | `server/smart-guard/` | Secrets / network | Simulator vs live NaC | policy tests; `/api/nac` smoke |
| `lib/smart-guard/index.ts` | export types+policy+client only | Barrel poison | Accidental client import of `run` | Guard tests + `next build` |
| `lib/parser.ts` | `lib/engine/parser.ts` | Engine boundary | `/api/analyze` | financial-engine + integrity TEST 10 |
| `lib/analytics.ts` | `lib/engine/analytics.ts` | Engine boundary | KPI numbers | financial-engine, forgery, integrity 1–2, 10 |
| `lib/advisor.ts` | `lib/engine/advisor.ts` | Engine boundary | What-if verdict | what-if tests; `sim.v.belowCost` |
| `lib/forecast.ts` | `lib/engine/forecast.ts` | Engine boundary | Series length | financial-engine forecast assertion |
| `lib/classify.ts` | `lib/engine/classify.ts` | Engine boundary | `originalAmount` forge | integrity TEST 2 |
| `lib/opex.ts` | `lib/engine/opex.ts` | Engine boundary | Net 600 opex case | financial-engine opex test |
| `lib/mapping.ts` | `lib/engine/mapping.ts` | Parser support | Column detect | analyze smoke |
| `lib/financial-integrity.ts` | `lib/engine/integrity.ts` or `lib/shared/integrity.ts` | Shared kernel | KPI trust | all integrity tests |
| `lib/sample-data.ts` | `lib/engine/sample-data.ts` | Demo txs | Demo dashboard | visual; engine tests don’t load full demo |
| `lib/engine.ts` | `lib/engine/index.ts` (client-safe) + `lib/engine/from-file.ts` (server) | Stop parser in client bundle | `analysis-context` demo + analyzeParsed | integrity TEST 9–10; dashboard load |
| `lib/qa.ts` | `lib/engine/qa.ts` | Uses `runFullAnalysis` | Ask box | no dedicated test today — **write one golden Q/A test before this move** |
| `lib/export-report.ts` | keep until P11+ | HTML export uses engine | Settings export button | no unit test — add snapshot of totals before move |
| `lib/utils.ts` | `lib/ui/cn.ts` + `lib/shared/math.ts` | Mixed UI/engine | Tailwind classes vs `round2` | all engine tests + visual buttons |
| `lib/pdf-extract.ts`, `ocr.ts`, `table-extract.ts` | `lib/engine/parse/` | Parser-only | PDF upload | analyze route; no current unit test — add one fixture CSV first (CSV is enough) |

API `route.ts` files: **proposed place = current place.** Reason: Next.js requires `app/api` for these URLs. Moving them is not architecture cleanup; it is an App Router rewrite.

---

## Risk Assessment

| Risk | Level | Mitigation |
| --- | --- | --- |
| Client bundle starts importing `run.ts` / `postgres` | High | Never export them from a barrel; ESLint `no-restricted-imports` after P7 |
| Move without shim → 51 tests fail on `@/lib/analytics` | High | Shim first, retarget importers later |
| Dual-write JSON/PG broken by path change | High | P3–P5 only change module location, not `writeJsonFile` relative names |
| Cookie `httpOnly` break if session module moves carelessly | High | Do not move `server/crypto/session.ts` in early phases |
| KPI drift while “just moving” engine files | High | Forbidden to edit formulas in a move PR. Gate: TEST 10 golden 700/280/420/60 |
| `qa` / export-report untested | Medium | Add tests **before** those files move |
| Edge `middleware.ts` importing session | Medium | Keep file at repo root; do not move |
| Apparent “migration success” because `next build` works | Process | Build is not the gate. **`npm test` is the gate.** |

---

## Rollback Plan

1. Each phase is one git commit (when you ask to commit).
2. If `npm test` fails: **stop**. `git revert` that commit (or restore the shim). Do not “fix forward” by changing formulas or APIs.
3. Shims mean production imports (`@/lib/parser`, `@/lib/server/workspaces`) keep working even if the body moved. Rollback of a **retarget** commit is easier than rollback of a **delete-old-path** commit. Delete shims last and only after a green test run.
4. Do not roll back by deleting `data/*.json` or dropping Postgres tables.
5. Do not use `git reset --hard` on shared history unless you explicitly ask for it.

---

## Test Gates

**Command (unchanged):** `npm test`

**Rule:** after every phase, required result is **51+ tests, 0 fail**. If a phase adds tests, those must pass too. If any **existing** test fails, the phase is rejected.

| Gate | Protects |
| --- | --- |
| `tests/financial-engine.test.ts` | Revenue 700, COGS 280, net 420, margin 60%, opex net 600, USD no convert, what-if below cost, forecast series |
| `tests/parse-result-forgery.test.ts` | Client `kpis` ignored; price×qty wins over forged revenue |
| `tests/integrity-security.test.ts` | TEST 1–10: fake parseResult, forged revenue, negatives, Infinity/NaN, extra fields, IDOR, legitimate save/analysis |
| `tests/auth.test.ts` | scrypt, login 401, `/me` 401/404, no password leak |
| `tests/authorization-idor.test.ts` | Session email wins; workspace GET 401; save uses `session.email` |
| `tests/csrf.test.ts` | Origin required on POST |
| `tests/smart-guard-policy.test.ts` | Allow clean; freeze SIM swap; evaluate missing action 400; fail-closed source |
| `tests/step-up.test.ts` | Replay, wrong code, session-bound identity |

**Missing tests to add *before* the related move (not in P0):**

- Track event POST (before P5 events move)
- One CSV round-trip through `parseFinancialFile` (before parser folder move)
- Ask-box / `qa` golden answer (before `qa.ts` move)
- Export report uses engine totals 700/280/420 (before `export-report.ts` move)

`next build` is a **secondary** check after tests, never a substitute.

---

## Data Safety Rules

1. Do not run a Postgres schema migration as part of folder moves.
2. Do not rewrite or delete `data/users.json`, `data/workspaces/*.json`, `data/events.json`, `data/guard-decisions.json`, `data/nac-demo.json`.
3. Dual-write (JSON + JSONB) stays. A move of `workspaces.ts` must keep the same `INSERT ... ON CONFLICT` and the same relative JSON path `workspaces/{email}.json`.
4. Do not change `PersistedWorkspace` JSON shape in a move PR (`version: 2`, `files[].parseResult`, etc.).
5. `.env` / `SESSION_SECRET` / `DATABASE_URL` / admin password stay server-only. No `NEXT_PUBLIC_` for those.
6. Integrity sanitizer behavior is **not** “architecture.” Do not disable it while moving files.

---

## Security Invariants

These must remain true after every future phase. If a move would violate one, **stop and redesign**.

1. **Secrets never reach the client.** No `SESSION_SECRET`, `ADMIN_PASSWORD`, `DATABASE_URL`, `NAC_API_KEY`, `MAIL_APP_PASSWORD` in `"use client"` modules or `NEXT_PUBLIC_*`.
2. **API authorization remains server-side.** `requireMerchant` / `requireAdmin` stay in Route Handlers / `server/middleware`. UI checks are not authorization.
3. **Session identity remains authoritative.** Workspace, profile, Guard `file_upload` / `report_export` / `price_change`, and step-up (when logged in) use `session.email`, never `body.email` / `?email=`.
4. **parseResult KPIs are never trusted from the client.** `runFullAnalysis` and workspace save sanitize; client `kpis` / `advisor` blobs are dropped.
5. **transaction.revenue cannot override the authoritative calculation** when `sellingPrice ≠ 0` (`sellingPrice × (quantity \|\| 1)`). Expense rows with `sellingPrice = 0` keep `expense` as truth and `revenue = 0`.
6. **Smart Guard remains fail-closed.** Evaluate catch returns `freeze` / `check_failed` / 503, never `allow`. Client has no allow-fallback.
7. **Step-Up remains bound to session identity** when a merchant session exists. Pre-auth `login` / `password_reset` may use `body.email` only for those actions.
8. **httpOnly cookies remain functional.** `sp_session` / `sp_admin` still set from API routes via `server/crypto/session.ts` (`sameSite=lax`, `httpOnly`).
9. **Existing API routes remain unchanged.** Same paths, same methods, same cookie names. New URLs are additive only, and not part of P1–P11.

Additional invariants already in force:

- CSRF `assertSameOrigin` on non-GET `/api/*` except `/api/nac`.
- Admin API gated by Edge `middleware.ts` plus `requireAdmin`.
- `/api/analyze` remains the file-ingest authority (bytes on the server, not a client-only parser path).

---

## What this round did **not** do

- No production file moved or deleted.
- No frontend/backend split.
- No Python engine.
- No API contract change.
- No cookie/auth change.
- No database migration.
- No JSON rewrite.
- No Financial Engine formula change.

**Next step (only after you approve this plan):** P1 shim policy, then P2 `lib/utils` split, `npm test` after each.
