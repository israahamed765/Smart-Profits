# P13.1 — Frontend inventory

**Date:** 2026-08-23  
**Scope:** Classification only. No production files moved. No `frontend/` tree created. P13.2 not started.

Next.js still owns the App Router at the repo root. “FRONTEND” below means **UI ownership**, not a second Next application.

---

## How to read the buckets

| Bucket | Meaning |
| --- | --- |
| **FRONTEND** | React UI, browser state, i18n, visual helpers, `apiFetch`. Safe to *consider* for a future `frontend/` module folder. |
| **BACKEND** | HTTP, sessions, DB, NAC live keys, parser, mail. Must never enter a Frontend tree. |
| **SHARED** | Types, math, Zod contracts, phone/identity, Guard policy constants. No React, no Node I/O. |
| **NEXT-INFRASTRUCTURE** | Must stay at the Next root (`app/`, `middleware.ts`, config, `public/`) or Next breaks. |
| **NEEDS-REVIEW** | Dual-use or leftover paths. Do not move in P13.2 without an explicit decision. |

---

## FRONTEND (UI ownership)

### Pages (`app/` UI — physically **NEXT-INFRASTRUCTURE** until a later, approved move)

Client pages (`"use client"`):

| Path |
| --- |
| `app/login/page.tsx` |
| `app/register/page.tsx` |
| `app/forgot-password/page.tsx` |
| `app/(app)/dashboard/page.tsx` |
| `app/(app)/data/page.tsx` |
| `app/(app)/simulator/page.tsx` |
| `app/(app)/advisor/page.tsx` |
| `app/(app)/settings/page.tsx` |
| `app/admin/login/page.tsx` |
| `app/admin/(portal)/page.tsx` |
| `app/admin/(portal)/users/page.tsx` |
| `app/admin/(portal)/financials/page.tsx` |
| `app/admin/(portal)/traffic/page.tsx` |
| `app/admin/(portal)/layout.tsx` |

Server redirect aliases (still UI routes, no `"use client"`):

| Path | Target |
| --- | --- |
| `app/page.tsx` | `/register` |
| `app/(app)/upload/page.tsx` | `/data` |
| `app/(app)/archive/page.tsx` | `/data?tab=archive` |
| `app/(app)/analysis/page.tsx` | `/data` |
| `app/(app)/doctor/page.tsx` | `/dashboard` |
| `app/(app)/forecasts/page.tsx` | `/simulator` |
| `app/(app)/actions/page.tsx` | `/settings?tab=actions` |
| `app/(app)/ask/page.tsx` | `/advisor` |
| `app/(app)/help/page.tsx` | `/advisor` |
| `app/(app)/reports/page.tsx` | `/settings` |

### `components/` (53 files)

All React UI. Most are `"use client"`. Primitives without the directive (`components/ui/*`, `components/admin/admin-kpi.tsx`, `components/brand/logo.tsx`) are still Frontend — they are imported by client trees.

Groups: `admin/`, `advisor/`, `analysis/`, `auth/`, `brand/`, `charts/`, `dashboard/`, `forecasts/`, `guard/`, `layout/`, `opex/`, `ui/`, plus `providers.tsx`.

### `context/` (6 files, all `"use client"`)

`auth-context.tsx`, `admin-auth.tsx`, `admin-portal.tsx`, `analysis-context.tsx`, `appearance.tsx`, `smart-guard-context.tsx`.

### `hooks/`

**Does not exist.** No custom hooks folder today (`components/charts/use-chart-theme.ts` lives under components).

### Client-safe `lib/*`

| Path | Role |
| --- | --- |
| `lib/api/client.ts` | `apiFetch` / `NEXT_PUBLIC_API_BASE_URL` (empty = same-origin) |
| `lib/i18n.ts` | Copy tables |
| `lib/ui/cn.ts` | Tailwind `cn` |
| `lib/format.ts` | Display money/dates |
| `lib/tenant.ts` | Browser localStorage keys + identity re-export |
| `lib/smart-guard/client.ts` | Browser Guard/Step-Up calls via `apiFetch` |
| `lib/admin/track.ts` | localStorage events + `POST /api/track` |
| `lib/admin/metrics.ts` | Admin dashboard from local snapshot + localStorage |
| `lib/admin/types.ts`, `config.ts`, `money.ts` | Admin UI types/labels |
| `lib/chart-theme.ts`, `localize-advisor.ts`, `localize-warning.ts` | UI copy |
| `lib/column-roles.ts`, `taxonomy.ts` | Labels for mapping UI |
| `lib/qa.ts`, `advisor-knowledge.ts` | In-browser Q&A over **already analyzed** results |
| `lib/export-report.ts` | Client-side report text/download |
| `lib/sample-data.ts` | Re-export of demo generator (formulas, no ingest) |

Thin client-safe barrels onto core/shared (not a second formula copy):

`lib/engine.ts`, `lib/analytics.ts`, `lib/advisor.ts`, `lib/forecast.ts`, `lib/opex.ts`, `lib/scope.ts`, `lib/dates.ts`, `lib/classify.ts`, `lib/mapping.ts`, `lib/financial-integrity.ts`, `lib/types.ts`, `lib/serialize.ts`, `lib/sheets.ts`, `lib/phone.ts`, `lib/utils.ts`, `lib/shared/math.ts`, `lib/shared/nac-contract.ts`, `lib/shared/smart-guard.ts`, `lib/smart-guard/index.ts`, `lib/smart-guard/types.ts`, `lib/smart-guard/nac-contract.ts`, `lib/smart-guard/policy.ts`, `lib/financial-engine/**` (see NEEDS-REVIEW).

### Assets / styles

| Path | Bucket note |
| --- | --- |
| `app/globals.css` | NEXT-INFRASTRUCTURE (imported by root layout) |
| `public/*` | NEXT-INFRASTRUCTURE (static hosting) |
| `public/templates/smartprofit-template.csv` | Downloadable UI asset |

---

## BACKEND (must never enter Frontend)

### Standalone process — `backend/`

`backend/src/index.ts`, `http/*` (workspace, track, analyze, auth, admin, Guard, NAC), `services/*` (re-exports only), `config/*`, `storage/*` (re-exports of postgres/json-store).

### Server implementation — `server/`

Services, repositories, `db/postgres.ts`, `storage/json-store.ts`, `crypto/*`, `middleware/*`, `smart-guard/*` (including `nac-env`, `nac-client`, nokia-mock, OTP), `financial-engine/parser|upload`, `mail/send-password-email.ts`, `http/proxy-to-backend.ts`.

### Next BFF — `app/api/**`

Compatibility routes only (`maybeProxyToBackend`). Not UI.

### Empty landmine stubs (keep; never re-export server into Client)

`lib/parser.ts`, `lib/engine-upload.ts`, `lib/ocr.ts`, `lib/pdf-extract.ts`, `lib/table-extract.ts`, `lib/db/postgres.ts`, `lib/server/*` (`json-store`, `workspaces`, `events`, `accounts`, `request-meta`, `send-password-email`, `guard-log`), `lib/smart-guard/{run,demo,camara,nac-client,nokia-mock,nac-simulator,network-code}.ts`.

---

## SHARED (`shared/`)

| Path | Role |
| --- | --- |
| `shared/types/financial.ts` | Domain types |
| `shared/types/smart-guard.ts` | Guard types / demo flags |
| `shared/constants/math.ts` | `safeDivide`, `round2`, … |
| `shared/constants/calendar.ts` | Month keys |
| `shared/constants/guard.ts` | Guard constants re-export |
| `shared/contracts/nac-contract.ts` | CAMARA shapes, **no API keys** |
| `shared/validation/*` | Zod (auth, workspace, track, admin, profile) |
| `shared/identity.ts` | Email normalization |
| `shared/phone.ts` | MSISDN helpers |

`backend/src/shared/identity.ts` is a thin re-export of `shared/identity` — not a second identity module.

---

## NEXT-INFRASTRUCTURE (stay at repo root)

| Path | Why |
| --- | --- |
| `app/` including `layout.tsx`, `globals.css`, **all** `page.tsx`, **all** `app/api` | App Router contract |
| `middleware.ts` | Next middleware; reads **admin session** (`server/crypto`) |
| `next.config.ts` | `serverExternalPackages` (unpdf, tesseract, pg, nodemailer) |
| `next-env.d.ts`, `tsconfig.json` | `@/*` → repo root |
| `postcss.config.mjs`, Tailwind | CSS pipeline |
| `public/` | URL `/…` static files |
| `package.json` scripts `dev` / `build` / `start` | One Next app |

Moving `app/` into `frontend/app` would create a **second Next tree**. P12 already forbids `frontend/app`. P13.1 keeps that prohibition.

---

## NEEDS-REVIEW (do not move in a naive P13.2)

| Item | Why |
| --- | --- |
| `lib/financial-engine/core/*` | **One formula source.** Used by Client (simulator/dashboard) **and** `backend` analyze. Not Frontend-only. Prefer stay, or later fold into `shared/` **without copying**. |
| `lib/smart-guard/policy.ts` | Same Allow/Step-up/Freeze brain as server `runSmartGuard` / mock gate. Not Frontend-only. |
| `lib/financial-engine/serialization` | Client persist + server workspace JSON. Shared shape. |
| `middleware.ts` | UI-adjacent path, but **server-only** session HMAC. Cannot live in a Client bundle. |
| `app/(app)/layout.tsx` | Server layout wrapping client `ProtectedLayout`. |
| `lib/admin/config.ts` `ADMIN_LOGIN_HINT_EMAIL` | Public hint string, not `ADMIN_PASSWORD`. Keep out of secrets scanners as a *value leak*; it is not a credential. |
| Empty `lib/server` stubs | Must remain empty; moving them into `frontend/` would invite a real re-export later. |

---

## What may later sit under `frontend/` (P13.2+, after approval)

Safe **module-folder** candidates (path alias, **not** a second `package.json` / `app/`):

- `components/`
- `context/`
- `lib/api`, `lib/i18n.ts`, `lib/ui`, `lib/format.ts`, `lib/tenant.ts`, `lib/admin/*` (UI), `lib/smart-guard/client.ts`, chart/i18n helpers, `qa.ts` / `export-report.ts`

## What must stay at Next root

`app/`, `middleware.ts`, `next.config.ts`, `public/`, `globals.css`, root `package.json`.

## What must stay in `shared/`

Current `shared/**` (expand only by moving **pure** types/math/contracts, never React or `process.env`).

## What must never enter Frontend

`server/**`, `backend/**`, `app/api/**`, repositories, postgres, json-store, parser/OCR/xlsx, SMTP, `nac-env`, OTP, `SESSION_SECRET`, `ADMIN_PASSWORD`, `DATABASE_URL`, `NAC_API_KEY`, `MAIL_*`.

---

## Counts (this inventory)

| Area | Approx. files |
| --- | --- |
| UI pages + layouts in `app/` (non-api) | 27 tsx |
| `app/api` BFF routes | 28 ts files (routes) |
| `components/` | 53 |
| `context/` | 6 |
| `hooks/` | 0 |
| `lib/` (mixed) | 76 |
| `shared/` | 13 |
| `server/` | 50 |
| `backend/src` | 46 |
| `"use client"` modules | 70+ |
