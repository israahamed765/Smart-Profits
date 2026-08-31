# Smart Profits — Architecture Inventory (Phase 0)

**Date:** 2026-08-21  
**Rule:** this document is an audit. No files were moved or deleted to produce it.  
**Stack found:** Next.js 16 App Router + TypeScript. Financial engine is TypeScript (`lib/analytics.ts`, `lib/advisor.ts`, `lib/parser.ts`), **not Python**. Backend is Next.js `app/api`, **not a separate Nest/Express app**.

---

## Current layout (as on disk)

This is a **monolith**, not four packages.

```text
smart-profit/
├── app/                 pages (frontend) + app/api (backend routes)
├── components/          UI
├── context/             client state
├── lib/                 mixed: UI helpers + financial engine + some server modules
├── server/              layered backend (middleware, services, repositories)
├── data/                JSON store (users, workspaces, events, guard logs)
├── middleware.ts        Edge: /api/admin/*
├── docker-compose.yml   local Postgres 16
└── docs/
```

**Decision required before Phase 2:** splitting into `frontend/` + `backend/` packages would change cookie origin, deployment, and imports. Safe migration is **internal folders first**, keep Next.js API URLs identical (`/api/auth/*` etc.). Do not rewrite the engine in Python.

---

## 1. Frontend (`"use client"`)

Pages: `app/page.tsx`, `app/login`, `app/register`, `app/forgot-password`, `app/(app)/*` (dashboard, advisor, data, settings, simulator), `app/admin/*`.

Context: `auth-context`, `admin-auth`, `admin-portal`, `analysis-context`, `appearance`, `smart-guard-context`.

Components: `components/advisor`, `dashboard`, `analysis`, `forecasts`, `guard`, `layout`, `auth`, `admin`, `ui`, `opex`.

**Frontend → API (allowed):** `/api/auth/*`, `/api/workspace`, `/api/analyze`, `/api/track`, `/api/admin/*`, `/api/smart-guard/*`.

**Frontend must not (verified):** no import of `@/server/*`, `@/lib/server/*`, `@/lib/db/*` from client files.

**Frontend still imports financial engine (presentation + remaining trust issue):**

| File | Imports |
| --- | --- |
| `context/analysis-context.tsx` | `lib/engine` (`analyzeParsed`, demo). Upload goes to `/api/analyze`. |
| `components/advisor/what-if.tsx` | `lib/advisor.simulateWhatIf` |
| `lib/export-report.ts` | `lib/advisor` + `lib/analytics` (used from settings, client) |

---

## 2. API routes (`app/api/**/route.ts`) — 27 files

| Group | Routes |
| --- | --- |
| Auth | `login`, `register`, `me`, `logout`, `profile`, `forgot-password`, `reset-password` |
| Admin | `login`, `logout`, `me`, `snapshot`, `users` |
| Workspace | `GET/POST /api/workspace` |
| Analyze | `POST /api/analyze` |
| Track | `POST /api/track` |
| Smart Guard | `evaluate`, `logs`, `demo`, `step-up`, `step-up/send`, `step-up/verify` |
| NAC mock | `nac/route`, `nac/mock/gate`, CAMARA `sim-swap`, `number-verification`, `location-verification` |

Preserve these URLs in any later move (Phase 9).

---

## 3. Server-only code

- `server/` — http, errors, crypto, middleware, validators, services, repositories, smart-guard identity
- `lib/server/` — json-store, accounts re-export, workspaces, events, guard-log, mail, request-meta
- `lib/db/postgres.ts`
- `lib/smart-guard/run.ts` — imported only from API routes (not from `"use client"`)

---

## 4. Database access

**PostgreSQL** (`DATABASE_URL`, `pg` Pool):

- `guard_decisions` (typed columns + `$1…$n`)
- `merchants` (JSONB payload)
- `workspaces` (JSONB payload)
- `track_events` (JSONB payload)

Schema is created at runtime (`CREATE TABLE IF NOT EXISTS`). **No `database/migrations/` folder yet.**

**JSON filesystem** (`lib/server/json-store.ts`):

- `data/users.json`
- `data/workspaces/*.json`
- `data/events.json`
- `data/guard-decisions.json`
- `data/nac-demo.json`
- On Vercel: `/tmp/smartprofit-data`

---

## 5. Repositories / services / validators

**Repositories:** `server/repositories/user.repository.ts` (real), `workspace.repository.ts` and `event.repository.ts` (re-export `lib/server`).

**Services:** `auth`, `profile`, `admin`, `workspace`, `track`.

**Validators:** `auth`, `profile`, `admin`, `workspace`, `track`. Guard evaluate uses `parseSensitiveAction`, not a Zod schema file.

---

## 6. Authentication / authorization / sessions

| Piece | Location |
| --- | --- |
| Password scrypt | `server/crypto/password.ts` |
| HMAC session cookies | `server/crypto/session.ts` (`sp_session`, `sp_admin`) |
| Merchant/admin require | `server/middleware/authenticate.ts` |
| Account active | `server/middleware/authorize.ts` |
| Auth business rules | `server/services/auth.service.ts` |
| Admin env credentials | `server/services/admin.service.ts` |
| Edge admin API gate | `middleware.ts` matcher `/api/admin/:path*` |
| CSRF origin | `server/middleware/csrf.ts` via `apiRoute` |
| Rate limit (in-memory Map) | `server/middleware/rate-limit.ts` |

---

## 7. Financial calculation logic

| File | Role |
| --- | --- |
| `lib/parser.ts` | CSV/Excel/PDF parse |
| `lib/analytics.ts` | revenue, COGS, profit, series |
| `lib/advisor.ts` | leaks, health, what-if, plan |
| `lib/forecast.ts` | forecast |
| `lib/engine.ts` | glue |
| `lib/opex.ts`, `lib/mapping.ts`, `lib/classify.ts` | supporting |
| `app/api/analyze/route.ts` | **authoritative upload path** (server) |

---

## 8. Smart Guard

| File | Role |
| --- | --- |
| `lib/smart-guard/client.ts` | browser fetch; fail-closed |
| `lib/smart-guard/run.ts` | server evaluate |
| `lib/smart-guard/policy.ts` | allow / step_up / freeze |
| `lib/smart-guard/camara.ts`, `nac-client.ts`, `nac-simulator.ts` | Nokia NaC |
| `server/smart-guard/identity.ts` | session vs pre-auth email |
| `lib/server/guard-log.ts` | Postgres + JSON log |

---

## 9. Environment / secrets

From `.env.example` (values must not be committed from `.env`):

`DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `APP_URL`, `NAC_API_KEY`, `NAC_RAPIDAPI_HOST`, `NAC_BASE_URL`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_APP_PASSWORD`.

**Frontend-visible:** none of the secrets above (admin login hint email only in `lib/admin/config.ts`).

---

## 10. External APIs

- Nokia NaC / RapidAPI when `NAC_API_KEY` is set (`lib/smart-guard/nac-client.ts`)
- SMTP via nodemailer (`lib/server/send-password-email.ts`)

---

## 11. Filesystem-dependent modules

`lib/server/json-store.ts`, `user.repository.ts`, `lib/server/workspaces.ts`, `lib/server/events.ts`, `lib/server/guard-log.ts`, `lib/smart-guard/demo.ts`.

---

## 12. Local JSON snapshot (Phase 0 counts — do not delete)

| Store | Count |
| --- | --- |
| `data/users.json` | 3 |
| `data/workspaces/*.json` | 3 |
| `data/events.json` | 19 |
| `data/guard-decisions.json` | 8 |

PostgreSQL counts were **not** queried in this phase (no destructive migrate). Compare in Phase 4 only.

---

## 13. Tests / build

- Test files: **none** (`*.test.ts` / `*.spec.ts` = 0)
- Scripts: `dev`, `build`, `start`, `lint`, `db:up`, `db:down`
- No `test` script yet

---

## 14. Import direction (today)

```text
frontend (app pages, components, context)
    → fetch /api/*
         → app/api route.ts
              → server/*  and  lib/server/*  and  lib/db
              → lib/analytics (analyze route)
              → lib/smart-guard/run
```

Forbidden edges **not found:** frontend → postgres, frontend → repositories, frontend → session secret.

Remaining leak of **financial formulas** into the client bundle: `what-if.tsx`, `export-report.ts`, `analyzeParsed` in analysis-context.

---

## Stop conditions (ambiguity — do not proceed to folder split)

1. Keep **TypeScript** financial engine; do not rewrite in Python.
2. Keep **Next.js API routes** as the public API; do not extract a second HTTP server until tests exist and cookies/CORS are designed.
3. Do not delete `lib/server`, `data/*`, or old routes.
4. Next allowed step in the mandated order: **Phase 1 verification (below) then tests**, not `frontend/` / `backend/` package split.
