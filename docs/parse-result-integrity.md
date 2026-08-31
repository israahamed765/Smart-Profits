# Workspace parseResult and transaction.revenue integrity

Written before the compatibility-layer fix. This is not an architecture migration.

## 1. Where does `parseResult` come from?

There is no `analysisId` anywhere in the repo.

Legitimate path today:

1. Merchant uploads a file in the browser (`context/analysis-context.tsx` → `analyzeFile`).
2. Client `POST /api/analyze` with the file bytes (session required, 8MB cap).
3. Server `parseFinancialFile` then `runFullAnalysis`.
4. Response `{ parsed, result }` — `parsed` is the `ParseResult`.
5. Client stores `parsed` on the active file in React state.
6. Debounced `POST /api/workspace` sends the whole workspace, including each file’s `parseResult` (`serializeParseResult`).
7. `app/api/workspace/route.ts` validates with Zod then `saveMerchantWorkspace(session.email, body.workspace)`.
8. Repository writes JSON (`data/workspaces/…`) and, if configured, Postgres JSONB. The blob is stored as sent (before this fix).

Other producers of a `ParseResult`:

- Demo data: `lib/engine.ts` `demoParseResult()` / `generateDemoTransactions()`.
- Client-side leftover: `lib/engine.ts` `analyzeUploadedFile` still exists but the live upload path is `/api/analyze`.
- Legacy localStorage (`PersistedAnalysis`) migrated in `fromPersisted`.

Dashboard does **not** persist `AnalysisResult` KPIs as the source of truth. It persists `parseResult`, then **recomputes** KPIs in the browser:

```
analyzeParsed(scopedParse, settings, taxonomy) → runFullAnalysis(...)
```

So forged **line items** inside stored `parseResult` become forged dashboard KPIs. A spoofed `kpis` object on the blob is already ignored by `runFullAnalysis` (it never reads `parsed.kpis`).

## 2. Fields inside `parseResult`

From `lib/types.ts` `ParseResult`:

| Field | Role |
| --- | --- |
| `transactions[]` | Line items. **This is what the engine actually uses.** |
| `mapping` | Detected columns (UI + parser metadata). |
| `fileName`, `sheetName`, `sheets` | Study report / sheet list. `sheets[].revenue` is display metadata. |
| `rowCount`, `skippedRows`, `warnings`, `cleaning` | Parse diagnostics. |

A transaction includes: `date`, `product`, `sku`, `quantity`, `sellingPrice`, `costPrice`, `revenue`, `expense`, `category`, `expenseType`, `notes`, optional `bucket` / `originalAmount` / classification fields.

The workspace validator previously typed `parseResult` as `z.unknown()`, so a client could attach `kpis`, `netProfit`, `advisor`, etc. Those extras are not in the TypeScript interface but survived JSON storage.

## 3. Where it is saved

- HTTP: `POST /api/workspace` → `workspace.service.ts` → `workspace.repository.ts` → `lib/server/workspaces.ts` `saveWorkspace`.
- Disk: `data/workspaces/{email}.json`.
- Postgres (when `DATABASE_URL` is set): `workspaces.payload` JSONB. **No schema migration in this round.**
- Browser: `localStorage` key per merchant, restored **before** GET if present.

Owner is `session.email`. `saveWorkspace` overwrites `ownerEmail` with the session key. That is IDOR-safe; it does not stop a merchant forging **their own** numbers.

## 4. Does the Dashboard depend on it?

Yes. `useAnalysis()`:

- `parseResult` = active file blob (tables, study report, what-if span, ask-box).
- `result` = `runFullAnalysis(parseResult, settings, taxonomy)` (KPI cards, charts, advisor, forecast).

Admin snapshot strips `transactions` before listing workspaces.

## 5. Is there an `analysisId`?

**No.** Adding `POST /api/analyze` → store verified analysis → workspace sends only `analysisId` would be a new API contract, a new store, and a client change. That is out of scope for this round.

## 6. Can it be recomputed from transactions / files?

- **From the original file:** yes, `/api/analyze` already does. The workspace POST does **not** receive the file again.
- **From `transactions`:** yes. KPIs, monthly series, forecast, advisor, and product stats are all derived from line items + settings. They must not be taken from the client.
- **From a client `kpis` object:** no. Never trust it.

## Chosen fix (compatibility layer — smallest safe change)

Keep `POST /api/workspace` body as `{ workspace: { files: [{ parseResult, … }] } }`.

On sanitize (save, load, deserialize, and `runFullAnalysis`):

1. Allowlist `ParseResult` fields. Drop client `kpis` / `result` / `advisor` / similar.
2. Canonicalize each `transaction.revenue` with the **documented parser formula** (see below). Do not trust `originalAmount` from the client (`classify.ts` would otherwise copy it into revenue).
3. Do not introduce `analysisId`, Python, folder splits, or Postgres schema changes.

## Documented `revenue` formula (extracted, not assumed)

There is **no discount and no tax** in the ingest formula.

From `lib/parser.ts` `rowsFromObjects`:

```text
revenue = (revenue column if present and non-zero)
       else sellingPrice * (quantity || 1)
```

`lib/i18n.ts` `study.role.revenue.why`: the revenue column is the ready sales amount **if price × quantity is missing**.

After optional `normalizeLineTotals`, `sellingPrice` / `costPrice` become **unit** prices and `revenue` is the line total, so:

```text
revenue ≈ sellingPrice × quantity
```

`classify.ts` `applyBucket` for sales sets `revenue` from `lineAbsAmount`, which takes `max(|revenue|, |expense|, |price×qty|, |cost×qty|)` and **prefers `originalAmount` if set**. That is why a forged `revenue` or `originalAmount` could inflate totals.

### Canonical rule used by the integrity layer

| Situation | Authoritative `revenue` |
| --- | --- |
| `sellingPrice` is a finite non-zero number | `sellingPrice * (quantity \|\| 1)` — same as parser fallback / post-normalize state. Client `revenue` is stored only as `sourceRevenue` and is **not** used in KPIs. |
| `sellingPrice` is 0 (revenue-column-only file, or expense row) | Keep finite `revenue` as source (parser: revenue column wins when there is no price). Expense rows keep `expense` and `revenue = 0`. |
| NaN / Infinity / non-numeric | Coerce to `0`. |
| Absurd magnitude | Clamp so products stay finite (no `Infinity` totals). |
| Negative qty / price | Keep sign (parser `parseNumber` already allows returns/adjustments). Not rejected. |

COGS in `analytics.ts` is `costPrice * (quantity || 1)`, not a client KPI. Cost is finite-clamped only; the COGS formula is unchanged.

## What this round will not do

- No frontend/backend package split.
- No Python engine.
- No database migration / moving JSON → Postgres.
- No deleting production files.
- No cookie / auth changes.
- No new required workspace fields (`analysisId` remains a later design).

## Implemented (compatibility layer)

- `lib/financial-integrity.ts` canonicalizes line `revenue` and allowlists `ParseResult`.
- `runFullAnalysis` sanitizes before any KPI / forecast / advisor work.
- `deserializeParseResult` sanitizes on client restore and server load.
- `saveMerchantWorkspace` / `getMerchantWorkspace` persist and return the sanitized blob.
- HTTP `POST /api/workspace` body is unchanged. Client KPIs are ignored.

Remaining gap: a row with `sellingPrice = 0` and a huge `revenue` is treated as a revenue-column-only file (parser rule). Proving that amount requires the original file or a future `analysisId`.
