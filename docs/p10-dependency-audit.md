# P10 Dependency Audit

**Date:** 2026-08-23  
**Rule:** written before any P10 code change. Baseline after P9: 71 tests passing, `next build` PASS.

**P10 is not a physical split.** Do not create `frontend/` / `backend/` apps. Do not move `app/` or `server/`.

---

## 1. Client → Server

**None** in `"use client"` files (`@/server`, `@/lib/server`, `@/lib/db`). Covered by `tests/architecture-boundary.test.ts`.

Upload path is `fetch("/api/analyze")`, not parser import.

---

## 2. Server → Client

Server does **not** import `@/components` or `@/lib/ui`.

**Coupling that would hurt a later split:**

| Server file | Imports | Issue |
| --- | --- | --- |
| `workspace.repository.ts` | `fileSafeEmail` from `@/lib/tenant` | `tenant.ts` is a **browser localStorage** module |
| `auth.service`, `profile.service`, `nac-client` | `normalizeMobile` from `@/lib/phone` | isomorphic; lives under `lib/` not `shared/` |
| `admin.service` | `type AdminFacts` from `@/lib/admin/metrics` | type-only; metrics also has localStorage helpers |
| `user/event` repos, `track.service` | types from `@/lib/admin/config` | isomorphic types in a frontend-ish folder |
| Guard `run` / `camara` | `@/lib/smart-guard/policy` + types | policy is pure; path still under `lib/` |

Parser → `lib/financial-engine/core` is **allowed** (shared formulas).

---

## 3. Shared → Server

**None.** `shared/` only uses Zod + local `shared/` imports.

---

## 4. Shared → Client framework

**None.** No React / Next / cookies / `process.env`.

---

## 5. Database → UI

**None.** Repositories do not import components.

---

## 6. UI → Database

**None.** Client does not import postgres, json-store, or repositories.

---

## 7. Financial Engine → UI  ⚠️ P10.2

`lib/financial-engine/core/{analytics,forecast,scope}.ts` import `monthKey` / `monthLabel` from `@/lib/format`.

`lib/format.ts` also contains **UI money display** (`formatMoney`, `convertAmount`, `currencySuffix`, `formatPct`, `formatDateAr`).

Engine **does not** call those display helpers. It only needs:

```ts
monthKey(year, month)   → `${year}-${pad(month+1)}`
monthLabel(year, month) → `${ARABIC_MONTHS[month]} ${year}`
```

These are calendar identity/labels on `MonthlyPoint` / forecast series, **not** currency formatting. Moving them to `shared/` with **byte-identical** implementations should not change KPIs, rounding, or currency behavior.

`formatMoney` / conversion rates **stay** in `lib/format.ts` (UI).

---

## 8. Financial Engine → Server

**None** for core calculations.

`core/sheets.ts` still exports `objectsFromSheet(XLSX, sheet)` with a **type-only** `import("xlsx")`. Only the **parser** calls it. Client uses `dateFromSheetName` from the same file. Splitting `objectsFromSheet` into the parser folder removes the last xlsx type from the core graph without changing parse behavior.

---

## 9. Circular dependencies

P9 scan: **none**. Shim chains are one-way (`lib/types` → `lib/financial-engine/types` → `shared/types/financial`).

---

## 10. Legacy shims

**Still imported (keep):**

| Shim | Used by |
| --- | --- |
| `lib/types.ts` … `lib/engine.ts`, `lib/serialize.ts`, `lib/scope.ts`, `lib/sheets.ts`, … | UI, tests, some API |
| `lib/shared/*` | mostly unused now (engine uses `@/shared` directly); keep as aliases |
| `lib/smart-guard/types.ts`, `nac-contract.ts` | client + server |
| `lib/phone.ts` | client + server |
| `server/validators/*` | API + tests |

**Empty stubs (keep empty — never `export * from server`):**

`lib/db/postgres.ts`, `lib/server/*` (json-store, workspaces, events, accounts, request-meta, send-password-email, guard-log), `lib/parser.ts`, `lib/engine-upload.ts`, `lib/pdf-extract.ts`, `lib/ocr.ts`, `lib/table-extract.ts`, `lib/smart-guard/{run,demo,camara,…}`.

**Unused but still a mixed barrel:**

`lib/utils.ts` — re-exports `cn` (UI) **and** math. **Zero importers** after P9. Do not delete in P10 without a second confirmation; leaving it is safer than a surprise import.

`lib/smart-guard/index.ts` — policy + types only (no `run`). **Zero** `from "@/lib/smart-guard"` importers. Client-safe. Keep.

---

## 11. Barrel exports

| Barrel | Mixes Client+Server? |
| --- | --- |
| `lib/utils.ts` | **Yes** (cn + math) — unused |
| `lib/smart-guard/index.ts` | No (policy + types only) |
| `lib/financial-engine/types/index.ts` | No (types only) |
| `lib/smart-guard/types.ts` | No |

No barrel currently re-exports parser or postgres.

---

## 12. Node-only packages in Client graph

Not in `"use client"` source: `xlsx`, `unpdf`, `tesseract`, `pg`, `nodemailer`, `node:fs`. P9 production scan confirmed.

---

## 13. Browser-only packages in Server graph

Server does not import `framer-motion`, `recharts`, `react-dropzone`, `lucide-react`.

`lib/tenant.ts` (localStorage) is pulled into **workspace.repository** via `fileSafeEmail` — the functions used are pure string helpers, but the **module** is browser-oriented. P10 should extract those helpers.

---

## Planned P10 cleanups (after this audit)

1. Extract `monthKey` / `monthLabel` / `ARABIC_MONTHS` (array form used by `format.ts`) to `shared/constants/calendar.ts`; engine + `lib/format` both use the shared copy.
2. Move `objectsFromSheet` next to the parser; core `sheets.ts` keeps name classification only.
3. Move `normalizeMobile` to `shared/`; shim `lib/phone.ts`.
4. Move `normalizeEmail` / `fileSafeEmail` to `shared/`; `tenant.ts` re-exports; repository imports shared.
5. Extend architecture tests for physical-split readiness.
6. Do **not** delete remaining shims that still have callers. Do **not** fill empty stubs.

**Out of P10:** `frontend/` / `backend/` folders, API/auth/data/formula changes.
