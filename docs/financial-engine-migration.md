# Financial Engine Migration Audit (P8)

**Date:** 2026-08-21  
**Baseline:** 54 tests passing. `next build` PASS. Client bundle audit PASS (P7).  
**Method:** static imports from every engine module, every `"use client"` file, and every `app/api/*` route. Type-only imports noted. Dynamic `import()` counts as a runtime dependency.

**P8 rule:** architecture only. No formula changes. One source of truth per calculation. Do not re-export server ingest through Client-safe barrels.

Target:

```text
CLIENT  UI
          ↓
        Client-safe Financial Core
          (analytics / advisor / forecast / types / serialize)

SERVER  POST /api/analyze
          ↓
        Financial Engine Server Layer
          ↓
        Parser / Excel / PDF / OCR
          ↓
        Client-safe Financial Core  (same formulas)
```

---

## 1. Module inventory

### `lib/types.ts`

| Field | Value |
| --- | --- |
| Purpose | Domain types (`Transaction`, `ParseResult`, `AnalysisResult`, `AppSettings`, `FileParseError`, …) |
| Client-safe or Server-only | **Client-safe** |
| Direct dependencies | none |
| Node-only dependencies | none |
| Browser-safe dependencies | none (types + `FileParseError` class) |
| Database/filesystem | none |
| Environment variables | none |
| Financial calculations | no |
| Client importers | `context/analysis-context.tsx`, many dashboard/advisor/settings components |
| Server importers | `app/api/analyze/route.ts`, parser, repositories (via serialize types) |

**P8 action:** move to `lib/financial-engine/types/`. Shim `lib/types.ts`.

---

### `lib/analytics.ts`

| Field | Value |
| --- | --- |
| Purpose | `runFullAnalysis` — KPIs, monthly series, product stats, expenses. **Source of truth** for revenue/COGS/GP/opex/net/margin |
| Client-safe or Server-only | **Client-safe** (deterministic, used by What-if / dashboard recompute) |
| Direct dependencies | `advisor`, `classify`, `mapping`, `format`, `dates`, `forecast`, `opex`, `sheets`, `utils` (math), `financial-integrity`, `types` |
| Node-only | none |
| Browser-safe | `format` (display labels), `shared/math` |
| Database/filesystem | none |
| Environment variables | none |
| Financial calculations | **yes** |
| Client importers | via `lib/engine.ts` (`analyzeParsed`); `lib/qa.ts`; `lib/export-report.ts` |
| Server importers | `app/api/analyze/route.ts` |

**P8 action:** move to `lib/financial-engine/core/analytics.ts`. Shim `lib/analytics.ts`. Retarget math to `@/lib/shared/math` (same functions as P1/P2).

---

### `lib/advisor.ts`

| Field | Value |
| --- | --- |
| Purpose | Store health, leaks, pricing, inventory, 30-day plan, `simulateWhatIf` |
| Client-safe or Server-only | **Client-safe** |
| Direct dependencies | `utils` (math), `types` |
| Node-only | none |
| Browser-safe | math |
| Database/filesystem | none |
| Environment variables | none |
| Financial calculations | **yes** (what-if, health scoring from already-computed KPIs) |
| Client importers | `components/advisor/what-if.tsx`; via analytics |
| Server importers | via analytics on `/api/analyze` |

**P8 action:** move to `lib/financial-engine/core/advisor.ts`. Shim.

---

### `lib/forecast.ts`

| Field | Value |
| --- | --- |
| Purpose | Linear regression forecast + risk alerts from monthly series |
| Client-safe or Server-only | **Client-safe** |
| Direct dependencies | `format` (`monthKey`/`monthLabel`), `types` |
| Node-only | none |
| Browser-safe | `format` |
| Database/filesystem | none |
| Environment variables | none |
| Financial calculations | **yes** |
| Client importers | via analytics |
| Server importers | via analytics |

**P8 action:** move to `lib/financial-engine/core/forecast.ts`. Shim. Keep `lib/format.ts` in place (display, not engine core).

---

### `lib/opex.ts`

| Field | Value |
| --- | --- |
| Purpose | Monthly opex from settings, break-even, real vs phantom, health |
| Client-safe or Server-only | **Client-safe** |
| Direct dependencies | math, `classify`, `types` |
| Node-only | none |
| Browser-safe | math |
| Database/filesystem | none |
| Environment variables | none |
| Financial calculations | **yes** |
| Client importers | `opex-insights.tsx`, `opex-setup-modal.tsx`, `analysis-context.tsx` |
| Server importers | `app/api/analyze/route.ts` (`normalizeOpexSettings`) |

**P8 action:** move to `lib/financial-engine/core/opex.ts`. Shim.

---

### `lib/financial-integrity.ts`

| Field | Value |
| --- | --- |
| Purpose | Canonicalize `transaction.revenue`; strip forged KPI fields from `parseResult` |
| Client-safe or Server-only | **Client-safe** |
| Direct dependencies | `types`, math (`round2`) |
| Node-only | none |
| Browser-safe | math |
| Database/filesystem | none |
| Environment variables | none |
| Financial calculations | **yes** (canonical line revenue: sellingPrice × qty when sellingPrice ≠ 0) |
| Client importers | via analytics + serialize |
| Server importers | via serialize (`workspace.service`) and analytics |

**P8 action:** move to `lib/financial-engine/core/financial-integrity.ts`. Shim.

---

### `lib/classify.ts`

| Field | Value |
| --- | --- |
| Purpose | Bucket keywords, learned taxonomy, ranking exclusions |
| Client-safe or Server-only | **Client-safe** |
| Direct dependencies | `mapping`, `types` |
| Node-only | none |
| Browser-safe | none beyond mapping |
| Database/filesystem | none |
| Environment variables | none |
| Financial calculations | classification only (affects which rows enter rankings, not the KPI formulas themselves) |
| Client importers | `analysis-context.tsx` |
| Server importers | `parser` (`applyFinancialClassification`) |

**P8 action:** move to `lib/financial-engine/core/classify.ts`. Shim.

---

### `lib/mapping.ts`

| Field | Value |
| --- | --- |
| Purpose | Header aliases → column roles |
| Client-safe or Server-only | **Client-safe** |
| Direct dependencies | `types` |
| Node-only | none |
| Browser-safe | none |
| Database/filesystem | none |
| Environment variables | none |
| Financial calculations | no |
| Client importers | via classify/scope/sheets |
| Server importers | parser, table-extract |

**P8 action:** move to `lib/financial-engine/core/mapping.ts`. Shim.

---

### `lib/serialize.ts`

| Field | Value |
| --- | --- |
| Purpose | JSON persist of `ParseResult` (dates as ISO strings); sanitizes on deserialize |
| Client-safe or Server-only | **Client-safe** (`JSON.parse`/`stringify` only) |
| Direct dependencies | `types`, `financial-integrity` |
| Node-only | none |
| Browser-safe | none |
| Database/filesystem | none (callers persist) |
| Environment variables | none |
| Financial calculations | no (delegates sanitization) |
| Client importers | `analysis-context.tsx` |
| Server importers | `workspace.service.ts`, `workspace.repository.ts` (type), `app/api/workspace/route.ts` (type) |

**P8 action:** move to `lib/financial-engine/serialization/`. Shim.

---

### `lib/engine.ts`

| Field | Value |
| --- | --- |
| Purpose | `demoParseResult()`, `analyzeParsed()` → `runFullAnalysis` |
| Client-safe or Server-only | **Client-safe** (after P7; no parser import) |
| Direct dependencies | `analytics`, `sample-data`, `types` |
| Node-only | none |
| Browser-safe | none |
| Database/filesystem | none |
| Environment variables | none |
| Financial calculations | delegates to analytics |
| Client importers | `context/analysis-context.tsx` |
| Server importers | none |

**P8 action:** move to `lib/financial-engine/core/engine.ts`. Shim. **Must not** re-export upload/parser.

---

### `lib/engine-upload.ts`

| Field | Value |
| --- | --- |
| Purpose | `analyzeUploadedFile` = `parseFinancialFile` + `runFullAnalysis` |
| Client-safe or Server-only | **Server-only** |
| Direct dependencies | `analytics`, `parser`, `types` |
| Node-only | via parser (`xlsx`, `unpdf`, `tesseract.js`, `papaparse`) |
| Browser-safe | none |
| Database/filesystem | none (File API in memory) |
| Environment variables | none |
| Financial calculations | delegates to analytics |
| Client importers | **none** (must stay none) |
| Server importers | unused by API today; API inlines the same two calls |

**P8 action:** move to `server/financial-engine/upload/`. **Do not** re-export from `lib/engine.ts`, `lib/utils.ts`, or any Client barrel. Stub `lib/engine-upload.ts` as `export {}`.

---

### `lib/parser.ts`

| Field | Value |
| --- | --- |
| Purpose | Excel / CSV / PDF / image → `ParseResult` |
| Client-safe or Server-only | **Server-only** |
| Direct dependencies | `zod`, `mapping`, `classify`, `types`, `dates`, `sheets`; dynamic `papaparse`, `xlsx`, `./pdf-extract`, `./ocr` |
| Node-only | `xlsx` (dynamic), `papaparse` (dynamic), unpdf/tesseract via pdf/ocr |
| Browser-safe | `zod` (also used elsewhere; not the leak) |
| Database/filesystem | none (reads `File` / `ArrayBuffer` only) |
| Environment variables | none |
| Financial calculations | **line construction** (quantity, prices, revenue fallback). KPI totals stay in analytics. Do not change this behavior in P8. |
| Client importers | **none** after P7 |
| Server importers | `app/api/analyze/route.ts`, `lib/engine-upload.ts` |

**P8 action:** move to `server/financial-engine/parser/`. Stub `lib/parser.ts` as `export {}` (no compatibility re-export).

---

### `lib/pdf-extract.ts`

| Field | Value |
| --- | --- |
| Purpose | PDF text/table extract via `unpdf`; OCR fallback |
| Client-safe or Server-only | **Server-only** |
| Direct dependencies | `types`, `table-extract`; dynamic `unpdf`, `./ocr` |
| Node-only | `unpdf` |
| Browser-safe | none |
| Database/filesystem | none |
| Environment variables | none |
| Financial calculations | no |
| Client importers | none |
| Server importers | parser (dynamic) |

**P8 action:** move next to parser. Stub old path.

---

### `lib/ocr.ts`

| Field | Value |
| --- | --- |
| Purpose | Tesseract OCR for images and PDF page images |
| Client-safe or Server-only | **Server-only** |
| Direct dependencies | `table-extract`, `types`; dynamic `tesseract.js`, `unpdf` |
| Node-only | `tesseract.js`, `unpdf` |
| Browser-safe | none |
| Database/filesystem | none |
| Environment variables | none |
| Financial calculations | no |
| Client importers | none |
| Server importers | parser, pdf-extract |

**P8 action:** move next to parser. Stub old path.

---

### `lib/table-extract.ts`

| Field | Value |
| --- | --- |
| Purpose | Rebuild table rows from positioned PDF/OCR items |
| Client-safe or Server-only | **Server-only** (only used by pdf/ocr) |
| Direct dependencies | `mapping` |
| Node-only | none by itself |
| Browser-safe | mapping |
| Database/filesystem | none |
| Environment variables | none |
| Financial calculations | no |
| Client importers | none |
| Server importers | pdf-extract, ocr |

**P8 action:** move with parser. Stub old path. Keep importing mapping from client-safe core (no formula duplication).

---

### `lib/sample-data.ts`

| Field | Value |
| --- | --- |
| Purpose | Demo transactions, default settings, CSV templates |
| Client-safe or Server-only | **Client-safe** |
| Direct dependencies | `types` |
| Node-only | none |
| Browser-safe | none |
| Database/filesystem | none |
| Environment variables | none |
| Financial calculations | no (fixture data) |
| Client importers | `analysis-context.tsx`, `app/(app)/data/page.tsx` |
| Server importers | `app/api/analyze/route.ts` (`DEFAULT_SETTINGS`) |

**P8 action:** move to `lib/financial-engine/core/sample-data.ts`. Shim.

---

### `lib/scope.ts`

| Field | Value |
| --- | --- |
| Purpose | Filter transactions by month/sheet/product |
| Client-safe or Server-only | **Client-safe** |
| Direct dependencies | `sheets`, `format`, `mapping`, `types` |
| Node-only | none |
| Browser-safe | `format` |
| Database/filesystem | none |
| Environment variables | none |
| Financial calculations | no (filtering) |
| Client importers | `analysis-context.tsx`, `app-header.tsx`, `ask-box.tsx`, `file-study-report.tsx` |
| Server importers | none |

**P8 action:** move to core (analysis-domain, browser-safe). Shim.

---

### `lib/dates.ts`

| Field | Value |
| --- | --- |
| Purpose | Reject Unix-epoch / implausible ledger dates |
| Client-safe or Server-only | **Client-safe** |
| Direct dependencies | none |
| Node-only | none |
| Browser-safe | `Date` |
| Database/filesystem | none |
| Environment variables | none |
| Financial calculations | no |
| Client importers | via analytics |
| Server importers | parser |

**P8 action:** move to core. Shim.

---

### `lib/sheets.ts`

| Field | Value |
| --- | --- |
| Purpose | Sheet name → month/role; `objectsFromSheet` accepts an XLSX instance as an **argument** (no static `xlsx` import) |
| Client-safe or Server-only | **Client-safe** (`dateFromSheetName` used by UI). `typeof import("xlsx")` is type-only |
| Direct dependencies | `mapping` |
| Node-only | none at runtime |
| Browser-safe | mapping |
| Database/filesystem | none |
| Environment variables | none |
| Financial calculations | no |
| Client importers | `file-study-report.tsx`; via analytics/scope |
| Server importers | parser (`objectsFromSheet`) |

**P8 action:** move to core (do not split; client needs `dateFromSheetName`). Shim.

---

## 2. Related modules — inspected, not moved in P8

These are adjacent to the engine but not the calculation core, or they are presentation / Q&A / localStorage.

| Module | Verdict | Why not moved |
| --- | --- | --- |
| `lib/format.ts` | Client-safe display | Currency labels / month names. Used by UI and forecast. Keep as shared display. |
| `lib/shared/math.ts` | Client-safe | Already the P2 source of truth for `round2` / `safeDivide` / `clamp` |
| `lib/utils.ts` | Shim | Re-exports math + `cn`. Engine core must stop importing this (Tailwind in graph). |
| `lib/qa.ts` | Client-safe Q&A | Calls `runFullAnalysis`; not a formula module |
| `lib/advisor-knowledge.ts` | Client-safe copy | Teaching answers |
| `lib/localize-advisor.ts` | Client-safe i18n | Display strings |
| `lib/localize-warning.ts` | Client-safe i18n | Parser warning display |
| `lib/column-roles.ts` | Client-safe copy | Column purpose labels |
| `lib/export-report.ts` | Client-safe HTML | Builds a report from **already computed** results |
| `lib/taxonomy.ts` | Client-only | `localStorage` taxonomy; not Node, but not engine core |
| `lib/i18n.ts` | UI | Contains the string `"DATABASE_URL"` in a translation; does not read the env var |

---

## 3. Target directories

```text
lib/financial-engine/
  types/index.ts
  serialization/index.ts
  core/
    analytics.ts
    advisor.ts
    forecast.ts
    opex.ts
    financial-integrity.ts
    classify.ts
    mapping.ts
    sample-data.ts
    engine.ts
    dates.ts
    sheets.ts
    scope.ts

server/financial-engine/
  parser/
    index.ts          (parseFinancialFile)
    pdf-extract.ts
    ocr.ts
    table-extract.ts
  upload/index.ts     (analyzeUploadedFile — server-only)
  analysis/index.ts   (API entry: parse + runFullAnalysis)
```

Compatibility shims at old `lib/*.ts` paths re-export **only** client-safe modules.

Parser / upload / pdf / ocr / table-extract old paths become empty stubs (`export {}`), matching the P4 Guard pattern. They must **not** `export * from "@/server/financial-engine"`.

---

## 4. Client / Server import graphs (before P8)

### Client (must remain calculable in the browser)

```text
context/analysis-context.tsx
  → lib/engine.ts → analytics + sample-data
  → lib/serialize.ts → financial-integrity
  → lib/opex.ts, lib/classify.ts, lib/scope.ts, lib/sample-data.ts, lib/types.ts

components/advisor/what-if.tsx → lib/advisor.ts
components/dashboard/opex-insights.tsx → lib/opex.ts
components/ask-box.tsx → lib/qa.ts → analytics
```

No `"use client"` file imports `parser`, `engine-upload`, `xlsx`, `unpdf`, `tesseract`.

### Server

```text
POST /api/analyze
  → parseFinancialFile (lib/parser.ts)
  → runFullAnalysis (lib/analytics.ts)
  → normalizeOpexSettings (lib/opex.ts)
  → DEFAULT_SETTINGS (lib/sample-data.ts)

lib/engine-upload.ts
  → parser + analytics   (not used by the route today)
```

---

## 5. Golden results (must stay identical)

Recorded from `tests/financial-engine.test.ts` and integrity tests. Do not “improve” formulas.

| Case | Expected |
| --- | --- |
| Two SKUs: 10×(50−20) + 2×(100−40) | Revenue **700**, COGS **280**, Net **420**, Margin **60** |
| One sale 1000/200 + settings opex 200 (`opexIncludedInFile: false`) | Revenue **1000**, COGS **200**, Opex **200**, Net **600** |
| Currency USD | Amounts unchanged (no silent conversion): Revenue **10**, Net **6** |
| What-if price 20, cost 30 | `verdictKey` `sim.v.belowCost`, `newUnitProfit < 0` |
| Three months of sales | `monthlySeries.length === 3`, forecast series non-empty, health score ≥ 0 |
| Forged `revenue: 9_999_999` with price 50 × qty 2 | Canonical revenue **100**, net **80** |
| Fake KPI fields on parseResult | Stripped by `sanitizeParseResult`; analysis uses line items |

---

## 6. Hard constraints (P8)

- Do not duplicate financial formulas. Parser may still **construct** line `revenue`; analytics remains the KPI source of truth.
- Do not export `engine-upload` / parser through `lib/engine.ts`, `lib/utils.ts`, or any Client barrel.
- Do not change `/api/analyze` URL, request shape (`file` / `settings` / `taxonomy`), or JSON `{ parsed, result }`.
- Do not change auth, cookies, Smart Guard, Postgres, or JSON data files.
- Stop and revert if any golden number or existing test changes.

---

## 7. After P8 (done)

Directories created as planned. Formulas were not rewritten. Core math imports `@/lib/shared/math` instead of `@/lib/utils` (same `round2` / `safeDivide` / `clamp`).

### Client import graph

```text
context/analysis-context.tsx
  → lib/engine.ts (shim)
      → lib/financial-engine/core/engine.ts
          → core/analytics.ts  (+ sample-data)
              → core/{advisor, forecast, opex, classify, mapping, dates, sheets, financial-integrity}
              → lib/format.ts
              → lib/shared/math.ts

components/advisor/what-if.tsx → lib/advisor.ts (shim) → core/advisor.ts
components/dashboard/opex-insights.tsx → lib/opex.ts (shim) → core/opex.ts
components/ask-box.tsx → lib/qa.ts → lib/analytics.ts (shim) → core/analytics.ts
```

No `"use client"` file imports `@/server/financial-engine`, `@/lib/parser`, `xlsx`, `unpdf`, or `tesseract`.

### Server import graph

```text
POST /api/analyze
  → server/financial-engine/analysis  (analyzeFinancialFile)
      → server/financial-engine/parser  (xlsx / papaparse / unpdf / tesseract)
      → lib/financial-engine/core/analytics  (same formulas as Client)
  → lib/opex.ts + lib/sample-data.ts (shims → core)

server/financial-engine/upload  (analyzeUploadedFile) — unused by the route; kept server-only
```

### Production client bundle (`.next/static`)

- No `tesseract.js` / `createWorker` / `unpdf` / `getDocumentProxy` / `sheet_to_json` / SheetJS
- No `SESSION_SECRET` / `ADMIN_PASSWORD` / `NAC_API_KEY` / `MAIL_APP_PASSWORD`
- `DATABASE_URL` appears only as an i18n string (`guard.logs.postgresDown`), not `process.env`

### Verification

- `npm test`: 63 passed / 0 failed (54 previous + 9 P8 boundary tests)
- `next build`: PASS
- Golden KPIs unchanged: 700 / 280 / 420 / 60%; opex net 600; USD amounts unchanged; what-if `sim.v.belowCost`; integrity sanitization still active
- `/api/analyze` URL, form fields, and `{ parsed, result }` JSON unchanged

### Remaining architectural risks (not P8)

- Filling `lib/parser.ts` or `lib/engine-upload.ts` with `export * from "@/server/financial-engine/..."` would recreate the Client leak
- `core/sheets.ts` still has a **type-only** `typeof import("xlsx")` on `objectsFromSheet`; it must stay argument-injected (no static `xlsx` import)
- `lib/qa.ts`, `lib/format.ts`, `lib/advisor-knowledge.ts`, `lib/taxonomy.ts` were inspected and left in place (not calculation core)
- Dual-write JSON + Postgres, Guard service bundle, and the final frontend/backend folder split are **P9+**
- Do not start P9 until this boundary is reviewed

