# Client / Server Boundary Audit (P7)

**Date:** 2026-08-21  
**Method:** static import graph from every `"use client"` file (65 entries). Type-only imports ignored. Dynamic `import()` inside a client-reachable module still counts as a client chunk.  
**Baseline:** 54 tests. No secrets in `NEXT_PUBLIC_*`.

Target:

```text
CLIENT  →  UI / types / pure calculations  →  fetch /api/*  →  SERVER
```

---

## 1. Client entry points audited

65 `"use client"` modules under `app/`, `components/`, `context/`.

Contexts: `analysis-context`, `auth-context`, `smart-guard-context`, `appearance`, `admin-auth`, `admin-portal`.

Also: login/register/forgot-password, settings, dashboard, advisor, simulator, admin portal, guard overlays.

**Reachable modules:** 108 local files. No `"use client"` file imports `@/server/*`, `@/lib/server/*`, `@/lib/db/*`, or repositories.

---

## 2. Server-only modules (must not be in the client graph)

| Area | Modules |
| --- | --- |
| DB / storage | `server/db/postgres.ts`, `server/storage/json-store.ts`, `lib/db/postgres.ts` shim |
| Repositories | `user`, `workspace`, `event`, `guard-log`, `demo` |
| Services | `auth`, `profile`, `admin`, `workspace`, `track`, `guard` |
| Guard implementation | `server/smart-guard/{run,camara,nac-client,nac-env,network-code,nokia-mock,nac-simulator,identity,demo}` |
| Crypto / mail | `server/crypto/*`, `lib/server/send-password-email.ts` |
| File parse (Node/wasm) | `lib/parser.ts` → dynamic `xlsx`, `papaparse`, `pdf-extract`, `ocr` → `unpdf`, `tesseract.js` |

---

## 3. Unsafe import chains found

### A. Confirmed (P7 must split)

```text
context/analysis-context.tsx   ("use client")
  → lib/engine.ts
      → lib/parser.ts          static import
          → dynamic xlsx / papaparse / pdf-extract / ocr
```

Client **does not call** `parseFinancialFile` or `analyzeUploadedFile`. Upload already goes to `POST /api/analyze`.

Client **does call** `analyzeParsed` (recompute KPIs / what-if inputs) and `demoParseResult`.

`lib/engine.ts` is mixed: two pure exports plus one file-parse helper that pulls the parser into the client graph.

**False positive:** `components/guard/smart-guard-log-panel.tsx` matched a `guard-log` filename regex. It only imports `GuardDecisionLog` types. Not a leak.

### B. Not present in the client graph

- `server/db`, `server/storage`, `lib/server/*` implementations
- `SESSION_SECRET`, `ADMIN_*`, `NAC_API_KEY`, `DATABASE_URL`, SMTP env reads
- OTP `network-code.ts`
- Guard `run.ts` / `nac-client.ts`
- Repositories

`lib/i18n.ts` contains the **string** `"DATABASE_URL"` in a translation. It does not read `process.env.DATABASE_URL`.

---

## 4. Client-safe modules confirmed

**Guard (HTTP + types only):** `lib/smart-guard/client.ts`, `lib/smart-guard/types.ts`, `lib/shared/smart-guard.ts`.  
`policy.ts` is pure and **not** currently imported by any client file. Barrel `lib/smart-guard/index.ts` exports policy + types only (no `run`).

**Pure / display engine (keep on client for What-if and dashboard recompute):**  
`lib/analytics.ts`, `lib/advisor.ts`, `lib/forecast.ts`, `lib/classify.ts`, `lib/opex.ts`, `lib/mapping.ts`, `lib/financial-integrity.ts`, `lib/sample-data.ts`, `lib/serialize.ts`, `lib/scope.ts`, `lib/format.ts`, `lib/shared/math.ts`.

**UI / browser:** `lib/ui/cn.ts`, `lib/i18n.ts`, `lib/admin/track.ts` (localStorage + `fetch /api/track`), `lib/tenant.ts` (localStorage keys), `lib/phone.ts`, `lib/export-report.ts` (HTML from already-computed results).

### Financial engine classification (calculations unchanged)

| Function / module | Kind | Client today? |
| --- | --- | --- |
| `analyzeParsed` / `runFullAnalysis` | pure | yes (dashboard, scope, taxonomy) |
| `demoParseResult` | pure | yes (seed file) |
| `simulateWhatIf` (`advisor.ts`) | pure | yes (`what-if.tsx`) |
| `analyzeUploadedFile` | mixed (parse + analyze) | **exported from engine.ts but unused** |
| `parseFinancialFile` | server-oriented (xlsx/pdf/ocr) | pulled in **only** via engine.ts static import |
| `/api/analyze` | server | live upload path |

P7 does **not** relocate analytics/advisor. It only unlinks parser from the client-imported `engine.ts`.

---

## 5. Secrets check (must stay off the client)

| Secret | Where it is read | Client? |
| --- | --- | --- |
| `SESSION_SECRET` | `server/crypto/session.ts` | no |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin.service.ts` | no |
| `NAC_API_KEY` / `NAC_BASE_URL` / RapidAPI host | `server/smart-guard/nac-env.ts` | no |
| `DATABASE_URL` | `server/db/postgres.ts` | no |
| `MAIL_USER` / `MAIL_APP_PASSWORD` | `lib/server/send-password-email.ts` | no |
| `NEXT_PUBLIC_*` | **none in repo** | n/a |

---

## P7 implementation choice (smallest)

1. Keep `demoParseResult` + `analyzeParsed` in `lib/engine.ts` (client-safe).
2. Move `analyzeUploadedFile` out of that module so `parser.ts` is not statically imported by any client graph node. Place it in `lib/engine-upload.ts` and **do not** re-export it from `engine.ts` (a re-export would recreate the leak).
3. Do not change `/api/analyze` (already uses `parser` + `runFullAnalysis` directly).
4. Do not change What-if or KPI formulas.
5. Re-trace the client graph. Then `npm test` and `next build`. Grep client chunks for secrets / `unpdf` / `tesseract` / `queryPostgres` if `.next/static` exists.

Out of P7: moving analytics into `lib/engine/`, deleting JSON, P8.

---

## After P7

`lib/engine.ts` no longer imports `parser.ts`. Client graph (re-traced): **107** modules. **Removed from client graph:** `lib/parser.ts`, `papaparse`, `xlsx`, `unpdf`, `tesseract.js`, `zod` (parser-only).

`analyzeUploadedFile` lives in `lib/engine-upload.ts` and is **not** imported by any client module. `/api/analyze` still uses `parseFinancialFile` + `runFullAnalysis` directly.

What-if and `analyzeParsed` are unchanged.
