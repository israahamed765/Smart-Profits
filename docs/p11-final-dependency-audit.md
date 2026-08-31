# P11 Final Dependency Audit

**Date:** 2026-08-23  
**Baseline (P10):** 78 tests passed / 0 failed. `next build` PASS.  
**Rule:** this file records the tree **before** P11 code edits. Git working tree is dirty from P1–P10 (expected). Do not revert that work.

**P11 is not a physical split.** `app/` and `server/` stay in this Next.js app.

---

## 1. Client → Server

`"use client"` files: **no** `@/server`, `@/lib/server`, `@/lib/db`.  
**no** `xlsx` / `unpdf` / `tesseract` / `pg` / `nodemailer`.

Upload is `fetch("/api/analyze")`.

---

## 2. Server → Client / UI

`server/` does **not** import `@/components` or `@/lib/ui`.

**Remaining coupling (type / path, not runtime UI):**

| Server file | Import | Runtime risk |
| --- | --- | --- |
| `admin.service.ts` | `import type { AdminFacts } from "@/lib/admin/metrics"` | Type-only (erased). Module `metrics.ts` also has `localStorage`. **P11: move the type.** |
| repos / track.service | `import type` from `@/lib/admin/config` | Type-only. Safe. |
| Guard `run` / `camara` | `@/lib/smart-guard/policy` | Pure decision table. Allowed. |
| parser | `lib/financial-engine/core` | Required (one formula source). |

---

## 3. Shared → Server

**None.** `shared/` uses Zod and other `shared/` files only.

---

## 4. Shared → React / browser state

**None.** No React, Next, `localStorage`, `document`, `process.env`.

---

## 5. Server → UI

**None** (components / Tailwind `cn` / recharts / dropzone).

---

## 6. Circular dependencies

P10 scan: **none**. Shim chains remain one-way.

---

## 7. `lib/server` and `lib/db`

**Zero** `from "@/lib/server/..."` or `from "@/lib/db/postgres"` importers.  
Those files are empty stubs (`export {}`). Must stay empty.

---

## 8. Old parser stubs

**Zero** importers of `@/lib/parser`, `@/lib/engine-upload`, `@/lib/pdf-extract`, `@/lib/ocr`, `@/lib/table-extract`.

---

## 9. Client → Postgres / JSON / secrets / SMTP

**None** in client source. Secrets live in `server/crypto/session.ts`, `admin.service.ts`, `nac-env.ts`, `server/mail/*`, `server/db/postgres.ts`.

---

## 10. Client → xlsx / unpdf / tesseract

**None.** Parser lives under `server/financial-engine/parser/`. Core no longer has `objectsFromSheet`.

---

## 11. API → Database adapters

`app/api/**/route.ts` does **not** import `@/server/db`, `@/server/storage`, or `@/server/repositories`.

| Route group | Goes through |
| --- | --- |
| auth / admin / workspace / track / analyze / guard logs | `server/services/*` |
| cookie attach/clear | `server/crypto/session` (HTTP adapter, not DB) |
| `/api/nac/*` | `nac-simulator` / `nokia-mock` (Guard mock, not DB) |

---

## 12. Financial engine

```text
lib/financial-engine/core     → shared/math, shared/calendar, sibling core modules
lib/financial-engine/types    → shared/types/financial
lib/financial-engine/serialization → core/financial-integrity
server/financial-engine/parser → core mapping/classify/dates/sheets + xlsx/unpdf/tesseract
server/financial-engine/analysis → parser + core/analytics
```

Core does **not** import `lib/format`, parser, or database (P10).

---

## 13. Planned P11 edits (small)

1. Move `AdminFacts` into `lib/admin/types.ts`; `admin.service` stops importing `metrics.ts`.
2. Retarget `/api/analyze` imports from `lib/*` shims to `lib/financial-engine/core` + `shared/types/financial`.
3. Add architecture tests: API ↛ repositories/db/storage; Client ↛ parser stubs; keep Client ↛ Server and Shared ↛ Server as **failing tests**.
4. Document every remaining shim. Do **not** delete used shims or unused mixed `lib/utils.ts`.

**Out of P11:** `frontend/` / `backend/` apps, API/auth/data/formula changes.

---

## 14. After P11 code edits

| Check | Result |
| --- | --- |
| Client → Server | **0** (`"use client"` has no `@/server`, `@/lib/server`, `@/lib/db`) |
| Shared → Server | **0** |
| Shared → React / Next / fs / Postgres / SMTP | **0** |
| Server → UI (`@/components`, `@/lib/ui`, recharts, dropzone, framer-motion) | **0** |
| Financial core → parser / xlsx / unpdf / tesseract / db | **0** |
| API routes → `server/db` / `server/storage` / `server/repositories` | **0** |
| `from "@/lib/server/..."` or `from "@/lib/db/postgres"` | **0** importers |
| `from "@/lib/parser"` / engine-upload / pdf-extract / ocr | **0** importers |
| Client → xlsx / unpdf / tesseract | **0** (parser only under `server/financial-engine/parser`) |
| Circular local imports | **0** (architecture test) |

**Retargets applied:**

- `admin.service.ts` → `@/lib/admin/types` (not `metrics` / localStorage)
- `lib/admin/types.ts` → `PersistedWorkspace` from serialization (not `lib/serialize` shim)
- `app/api/analyze/route.ts` → core + `shared/types/financial`
- `workspace.service.ts` + workspace repository type → `@/lib/financial-engine/serialization`

**Left unchanged (by design):** used `lib/*` shims, empty stubs (`export {}`), `/api/nac/*` talking to simulator/mock (not a DB adapter), Guard `run` importing repositories (implementation layer, not API).

Shim table: `docs/p11-shim-inventory.md`.

---

## 15. Production client bundle (`.next/static` after `next build`)

| Item | Result |
| --- | --- |
| Actual `SESSION_SECRET` value | absent |
| Actual `ADMIN_PASSWORD` value | absent |
| Actual `DATABASE_URL` connection string | absent |
| `postgresql://` | absent |
| `NAC_API_KEY` / SMTP env values | absent (empty in local `.env`) |
| `queryPostgres` / `json-store` / `nodemailer` / `unpdf` / `tesseract` / `SheetJS` / `node:fs` | absent |
| xlsx ingest APIs (`sheet_to_json`, `XLSX.read`) | absent |
| Token `DATABASE_URL` | i18n copy only (`guard.logs.postgresDown`) — not a secret |
| `admin@smartprofits.com` | public UI constant `ADMIN_LOGIN_HINT_EMAIL` in `lib/admin/config.ts`, **not** `process.env.ADMIN_EMAIL` |

---

## 16. Verdict

Logical boundaries are locked by tests. Physical `frontend/` + `backend/` apps are **not started** (P12).
