# P13.1 — Frontend boundary audit

**Date:** 2026-08-23  
**Method:** Static import graph + existing P9–P12.6 architecture tests. No production moves.

---

## Target graph (same repo)

```
FRONTEND (components, context, client lib, UI pages)
    → shared/          (types, math, contracts)
    → lib/financial-engine/core   (one formula source; dual-use)
    → lib/api/client   (HTTP only)
    ✗ server/, backend/, db, parser, secrets

NEXT app/              (layouts, pages, BFF routes)
    → FRONTEND modules
    → backend handlers (app/api only)

BACKEND backend/ + server/
    → shared/
    → lib/financial-engine/core
    ✗ components/, react, next/server UI

SHARED shared/
    ✗ react, next, server, backend, process.env
```

---

## Client import graph

Scanned: every `"use client"` file under `app/`, `components/`, `context/` (70+), plus client-reachable libs (`lib/api`, `lib/i18n`, `lib/ui`, `lib/tenant`, `lib/admin/*`, `lib/smart-guard/client.ts`).

| Forbidden edge | Result (P13.1) |
| --- | --- |
| Client → `backend/` | **none** |
| Client → `server/` | **none** |
| Client → repositories / postgres / json-store | **none** |
| Client → parser / xlsx / unpdf / tesseract | **none** |
| Client → `node:fs` / nodemailer | **none** |
| Client → `process.env.SESSION_SECRET` / `ADMIN_PASSWORD` / `NAC_API_KEY` / `DATABASE_URL` / `MAIL_*` | **none** |
| Client → `NEXT_PUBLIC_` secret names | **none** |
| Client → live `127.0.0.1:4000` fetch | **none** |

Allowed Client edges observed:

- `@/lib/api/client` (`credentials: include`, public `NEXT_PUBLIC_API_BASE_URL` only)
- `@/lib/financial-engine/core/*` and barrels (`analyzeParsed`, KPIs) — **formulas**, not ingest
- `@/lib/smart-guard/policy` + `client.ts`
- `@/shared/identity`, `@/shared/phone`, `@/shared/constants/math`
- React / lucide / recharts / sonner / framer-motion

`lib/smart-guard/client.ts` is not itself `"use client"` but is imported by client components. It does **not** import `server/`.

### `middleware.ts`

Not a Client module. Imports `@/server/crypto/session` — correct. Must **not** move into a Frontend folder.

---

## Server / backend import graph

| Rule | Result |
| --- | --- |
| `server/` → `@/components`, `@/lib/ui`, framer-motion, recharts | **none** |
| `backend/` → `react`, `react-dom`, `next/server`, `@/components` | **none** |
| `backend/` → repositories/db directly in HTTP handlers | **none** (go through `../services/`) |
| `shared/` → `@/server`, `@/backend`, React, Next, `pg`, `node:fs`, `process.env` | **none** |

---

## Circular dependencies

Existing test `detects no circular local imports among project TypeScript files` walks `app`, `components`, `context`, `lib`, `server`, `shared`, `tests`, `backend`.

**P13.1: no cycles found** (same gate as P9+).

---

## Next.js infrastructure (must remain)

| File | Client-safe? | Notes |
| --- | --- | --- |
| `app/layout.tsx` | Server layout | Fonts, `globals.css`, `<Providers>` |
| `app/(app)/layout.tsx` | Server | Wraps `ProtectedLayout` |
| `app/admin/layout.tsx` | Server | Metadata |
| `app/api/**/route.ts` | Server | BFF only |
| `middleware.ts` | Server | Admin cookie gate |
| `next.config.ts` | — | Externalize ingest/DB packages |
| `public/` | Static | Templates + default SVGs |
| `tsconfig.json` `paths["@/*"]` | — | Root alias; a future `frontend/` folder would need an extra alias **without** duplicating `app/` |

---

## Boundary violations **before** P13.1

P9–P12 already removed Client landmines (empty stubs, no `export *` from server).  

This audit did **not** find a remaining Client → server/backend/db/secret edge.

Known **non-violations** that look scary in grep:

- i18n string `DATABASE_URL موجود لكن الاتصال فشل` (label, not a connection string)
- Catalog note on NAC: `"until NAC_API_KEY is set"` (public docs text)
- `ADMIN_LOGIN_HINT_EMAIL` display hint in `lib/admin/config.ts`

---

## Boundary violations **after** P13.1

**Still zero** on the production graph. P13.1 added tests only; it did not move UI into `frontend/`.

---

## What P13.1 did *not* do (by design)

- No `frontend/` directory
- No file moves, copies, or deletes
- No API / cookie / CORS / Guard / formula changes
- No second Next app

---

## Recommendation for P13.2 (do not start until approved)

1. **Do not** create `frontend/app` or `frontend/package.json`.
2. If a physical folder is wanted: move **only** `components/` + `context/` + clearly client libs behind an alias such as `@/frontend/*`, keep `app/` at repo root.
3. Leave `lib/financial-engine/core` and `lib/smart-guard/policy` where they are (or later into `shared/`) — **one implementation**.
4. Never move `app/api`, `middleware.ts`, `server/`, `backend/`, or empty `lib/server` stubs into Frontend.
5. Re-run `npm test`, `next build`, and the Client bundle secret scan after any move.

---

## Test coverage added in P13.1

`tests/architecture-boundary.test.ts` → `describe("P13.1 frontend physical-split preparation")` (6 tests).

| Gate | Result |
| --- | --- |
| `npm test` | **170 passed / 0 failed** (was 164 before P13.1) |
| `next build` | **PASS** — same routes, including all `/api/*` |

**Behavioral deltas:** API 0 · Database 0 · Data 0 · Auth/Cookies 0 · Security 0 · Financial 0 · Smart Guard 0.
