# P12.1 — Physical Frontend / Backend Split Preparation

**Date:** 2026-08-23  
**Baseline:** P11 `npm test` 88 passed / 0 failed. `next build` PASS.  
**This phase does not split the running app.** `app/`, `server/`, `lib/`, and `shared/` stay where they are. No `frontend/` or `backend/` source trees were created (that would duplicate business logic while Next.js still owns `app/` at this package root).

---

## 1. Decision: documentation + tests, not duplicate trees

Creating `frontend/app` and `backend/api` **now** would either:

- break Next.js (it serves `app/` from this package), or
- copy files and produce **two formula sources**.

P12.1 therefore locks **ownership maps** and **architecture tests**. Physical moves belong to a later phase, one copy at a time, with shims.

---

## 2. Client / Frontend boundary (future package)

**Will become Frontend later (stay in place today):**

| Area | Current path |
| --- | --- |
| Next.js UI pages | `app/(app)/**`, `app/admin/**` pages, `app/login`, `app/register`, … — **not** `app/api` |
| React components | `components/` |
| Client contexts | `context/` |
| UI utilities / i18n | `lib/ui/`, `lib/i18n.ts`, `lib/format.ts` (display) |
| Client-safe engine | `lib/financial-engine/core/**`, shims `lib/advisor.ts`, `lib/analytics.ts`, `lib/engine.ts`, `lib/opex.ts`, … |
| API clients | `lib/smart-guard/client.ts`, `fetch("/api/…")` in contexts |
| Shared types | `@/shared/*` (and `lib/*` type shims) |

**Must never enter the Frontend bundle:**

PostgreSQL, JSON store, repositories, server services, `node:fs`, SMTP, secrets, `NAC_API_KEY`, parser / OCR / PDF / xlsx ingest.

**Verified (P11 + P12.1 tests):** `"use client"` modules and non-API UI files do not import `@/server`, `@/lib/server`, `@/lib/db`, `pg`, `xlsx`, `unpdf`, `tesseract`.

---

## 3. Backend boundary (future package)

```text
API (app/api/**/route.ts)     ← stay here until a separate HTTP server exists
  → server/http + middleware (CSRF, auth, rate limit)
  → server/services/*
       → repositories → postgres + json-store
       → server/financial-engine/parser + analysis
       → server/smart-guard/run + NAC
       → server/mail + server/crypto/session
```

**Will become Backend:**

- `app/api/**` (URLs frozen)
- `server/**`
- `middleware.ts` (admin API gate)
- empty stubs under `lib/server`, `lib/db`, `lib/parser` (must stay empty)

**Must not import:** `@/components`, `@/lib/ui`, recharts, dropzone, framer-motion.

---

## 4. Shared boundary (already a folder)

`shared/` today is the isomorphic kernel:

- `shared/types/financial.ts`, `shared/types/smart-guard.ts`
- `shared/contracts/nac-contract.ts` (no secrets)
- `shared/validation/*` (Zod)
- `shared/constants/{math,calendar,guard}`
- `shared/phone.ts`, `shared/identity.ts`

**Forbidden in `shared/`:** React, Next server APIs, `node:fs`, `pg`, `process.env`, SMTP, cookies, `localStorage`.

`lib/financial-engine/core` is **client-safe math** (one formula source). It is not `shared/` yet; both Frontend and Backend will import the **same** core, not a copy.

---

## 5. Financial engine (unchanged runtime)

```text
CLIENT:  What-if, charts, analyzeParsed (core)
SERVER:  POST /api/analyze → analyze.service → parser → core/analytics
SHARED:  types, math, calendar
```

Same API, same KPIs (700 / 280 / 420 / 60%, opex net 600).

---

## 6. Smart Guard (unchanged runtime)

```text
Frontend  →  fetch /api/smart-guard/*
API       →  guard.service  →  run / identity / network-code
          →  repositories + NAC (simulator or live)
```

Evaluate catch remains **fail-closed** (`freeze` / `check_failed` / 503). Client `lib/smart-guard/client.ts` also fail-closes (no allow fallback).

`/api/nac/*` is a hackathon simulator. It does **not** use repositories. Wrapping it in a service without changing URLs is **P12.2+**, not this phase.

---

## 7. Monorepo plan (not applied)

Future (after review), still one formula copy:

```text
packages/shared     ← move shared/ + financial-engine/core
apps/web            ← UI (today’s app pages, components, context)
apps/api            ← route handlers + server/   OR stay in apps/web until cookies/CORS are ready
```

**P12.1 does not create those packages.**

Companion inventories:

- `docs/p12-api-contract-inventory.md`
- `docs/p12-environment-boundary.md`
- `docs/p12-auth-boundary.md`
- `docs/p12-cors-plan.md`
- `docs/p12-database-boundary.md`
