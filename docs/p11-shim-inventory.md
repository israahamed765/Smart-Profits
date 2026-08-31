# P11 Shim Inventory

**Date:** 2026-08-23  
**Rule:** do not delete a shim because it “looks old.” Usage is from a full `from "@/…"` scan. Empty stubs must **not** `export * from "@/server/..."`.

| File | Used By | Safe? | Action | Reason |
| --- | --- | --- | --- | --- |
| `lib/types.ts` | UI, tests, some routes (via remaining shims) | Yes (re-exports `shared/types/financial`) | **Keep** | Public path for domain types |
| `lib/analytics.ts` | tests, `export-report`, UI via engine | Yes → core/analytics | **Keep** | Compatibility for What-if / tests |
| `lib/advisor.ts` | `what-if.tsx`, tests, export-report | Yes | **Keep** | Client What-if |
| `lib/forecast.ts` | via analytics shim | Yes | **Keep** | Re-export only |
| `lib/opex.ts` | dashboard, analysis-context, (analyze route now uses core) | Yes | **Keep** | UI still imports it |
| `lib/financial-integrity.ts` | integrity tests | Yes | **Keep** | Tests |
| `lib/classify.ts` | analysis-context | Yes | **Keep** | Client taxonomy |
| `lib/mapping.ts` | via classify/scope | Yes | **Keep** | |
| `lib/sample-data.ts` | analysis-context, data page | Yes | **Keep** | Demo + templates |
| `lib/engine.ts` | analysis-context | Yes (no parser) | **Keep** | `analyzeParsed` + demo |
| `lib/serialize.ts` | analysis-context, workspace API type, tenant | Yes | **Keep** | Client persist |
| `lib/dates.ts` | via analytics | Yes | **Keep** | |
| `lib/sheets.ts` | file-study-report | Yes (no objectsFromSheet) | **Keep** | Sheet names only |
| `lib/scope.ts` | analysis-context, header, ask-box | Yes | **Keep** | Filters |
| `lib/format.ts` | many UI components | Yes (display + calendar re-export) | **Keep** | UI money display |
| `lib/phone.ts` | login, register, settings, auth-context | Yes → `shared/phone` | **Keep** | Client forms |
| `lib/tenant.ts` | analysis-context, admin track/metrics | Mixed (localStorage + identity re-export) | **Keep** | Browser storage; server no longer imports it |
| `lib/financial-engine/types/index.ts` | core `../types`, parser | Yes → shared | **Keep** | One hop for core |
| `lib/shared/math.ts` | **none** | Yes → shared/constants/math | **Keep unused alias** | Zero importers; deleting is a later call |
| `lib/shared/smart-guard.ts` | **none** (callers use `lib/smart-guard/types`) | Yes | **Keep unused alias** | |
| `lib/shared/nac-contract.ts` | **none** (callers use `lib/smart-guard/nac-contract`) | Yes | **Keep unused alias** | |
| `lib/smart-guard/types.ts` | client + server + tests | Yes → shared | **Keep** | Widely imported |
| `lib/smart-guard/nac-contract.ts` | NAC mock routes | Yes → shared | **Keep** | |
| `lib/smart-guard/policy.ts` | server run, nac mock gate, tests | Yes (pure) | **Keep** | Not a shim; real policy |
| `lib/smart-guard/client.ts` | many client files | Yes (fetch only) | **Keep** | Real client HTTP |
| `lib/smart-guard/index.ts` | **none** (`from "@/lib/smart-guard"` unused) | Yes (policy+types, no `run`) | **Keep unused barrel** | Do not add `run` |
| `lib/utils.ts` | **none** | Mixed cn+math | **Keep unused** | Zero importers after P9; mixed barrel — do not fill with server |
| `server/validators/*.ts` | API + tests | Yes → shared/validation | **Keep** | Stable import path |
| `lib/db/postgres.ts` | **none** | Stub `export {}` | **Keep stub** | Landmine if re-export filled |
| `lib/server/json-store.ts` | **none** | Stub | **Keep stub** | |
| `lib/server/workspaces.ts` | **none** | Stub | **Keep stub** | |
| `lib/server/events.ts` | **none** | Stub | **Keep stub** | |
| `lib/server/accounts.ts` | **none** | Stub | **Keep stub** | |
| `lib/server/request-meta.ts` | **none** | Stub | **Keep stub** | |
| `lib/server/send-password-email.ts` | **none** | Stub | **Keep stub** | Live mail is `server/mail/` |
| `lib/server/guard-log.ts` | **none** | Stub | **Keep stub** | |
| `lib/parser.ts` | **none** | Stub | **Keep stub** | Parser is `server/financial-engine/parser` |
| `lib/engine-upload.ts` | **none** | Stub | **Keep stub** | |
| `lib/pdf-extract.ts` | **none** | Stub | **Keep stub** | |
| `lib/ocr.ts` | **none** | Stub | **Keep stub** | |
| `lib/table-extract.ts` | **none** | Stub | **Keep stub** | |
| `lib/smart-guard/{run,demo,camara,nac-client,nokia-mock,nac-simulator,network-code}.ts` | **none** | Stubs | **Keep stubs** | Filling them would leak NAC/Postgres |

**Deleted in P11:** none.

**P11 retargets (callers moved off shims, shims kept):**

- `app/api/analyze/route.ts` → `lib/financial-engine/core` + `shared/types/financial`
- `server/services/workspace.service.ts` + workspace repository type → `lib/financial-engine/serialization`
- `server/services/admin.service.ts` → `lib/admin/types` (not `metrics`)
- `lib/admin/types.ts` → `PersistedWorkspace` from `lib/financial-engine/serialization`
