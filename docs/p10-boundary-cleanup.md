# P10 Boundary Cleanup

**Date:** 2026-08-23  
**Scope:** dependency cleanup and boundary hardening only. No physical `frontend/` / `backend/` split. No P11.

Audit (before code): `docs/p10-dependency-audit.md`.

---

## 1. Status before P10

After P9: one Next.js monolith, `shared/` isomorphic layer, 71 tests, clean client bundle.

Remaining coupling:

- Financial core imported `@/lib/format` (`monthKey` / `monthLabel` only — same file as `formatMoney`)
- `objectsFromSheet` (xlsx argument types) lived in client-safe `core/sheets.ts`
- Server imported `fileSafeEmail` from `lib/tenant.ts` (localStorage module)
- Server imported `normalizeMobile` from `lib/phone.ts` instead of `shared/`

---

## 2. Dependency graph before cleanup

```text
core/analytics,forecast,scope  →  lib/format  →  formatMoney + monthKey
core/sheets                    →  typeof import("xlsx")  (objectsFromSheet)
workspace.repository           →  lib/tenant  (browser module)
auth/profile/nac-client        →  lib/phone
```

---

## 3. Issues found

1. **Engine → UI format module** — calendar keys lived next to money display.  
2. **xlsx types on the financial core** — only the parser needed `objectsFromSheet`.  
3. **Server → browser tenant module** — only needed two pure string helpers.  
4. **Phone helpers not in shared** — isomorphic, used on both sides.  
5. **`lib/utils.ts` mixed barrel** (cn + math) — unused; left in place.  
6. **`lib/smart-guard/index.ts`** — unused; policy+types only; left in place.

---

## 4. Files moved (implementation)

| From | To |
| --- | --- |
| `monthKey` / `monthLabel` / `ARABIC_MONTHS` (array) in `lib/format.ts` | `shared/constants/calendar.ts` |
| `objectsFromSheet` in `core/sheets.ts` | `server/financial-engine/parser/sheet-objects.ts` |
| `lib/phone.ts` body | `shared/phone.ts` |
| `normalizeEmail` / `fileSafeEmail` in `lib/tenant.ts` | `shared/identity.ts` |

`formatMoney` / `convertAmount` / `formatPct` / `formatDateAr` **stayed** in `lib/format.ts` (UI). Sheet-name month maps inside `core/sheets.ts` and `parser/index.ts` were **not** merged (different structures; changing them would risk parse/date behavior).

---

## 5. Files created

- `shared/constants/calendar.ts`
- `shared/phone.ts`
- `shared/identity.ts`
- `server/financial-engine/parser/sheet-objects.ts`
- `docs/p10-dependency-audit.md`
- `docs/p10-boundary-cleanup.md`

P10 tests were added to `tests/architecture-boundary.test.ts` (no new package.json architecture).

---

## 6. Files deleted

None.

---

## 7. Imports that changed

| Caller | Was | Now |
| --- | --- | --- |
| `core/analytics`, `forecast`, `scope` | `@/lib/format` | `@/shared/constants/calendar` |
| `lib/format.ts` | local month helpers | re-exports shared calendar |
| `parser/index.ts` | `objectsFromSheet` from core/sheets | `./sheet-objects` |
| `workspace.repository` | `@/lib/tenant` | `@/shared/identity` |
| `auth.service`, `profile.service`, `nac-client` | `@/lib/phone` | `@/shared/phone` |
| `lib/phone.ts` / `lib/tenant.ts` | implementations | re-export shared |

UI still imports `@/lib/format` and `@/lib/phone` (shims). That is fine.

---

## 8. Shared boundary

```text
shared/
  types/ financial + smart-guard
  contracts/ nac-contract
  constants/ math, calendar, guard
  validation/ zod
  phone.ts
  identity.ts
```

No React, Next, cookies, fs, Postgres, SMTP, secrets.

---

## 9. Frontend boundary

```text
UI → shared / client-safe engine → fetch("/api/...")
```

No server, repositories, postgres, json-store, SMTP, secrets, xlsx, unpdf, tesseract.

---

## 10. Backend boundary

```text
API → services → repositories → postgres / json-store
API → analyze.service → parser → financial core
API → guard.service → guard engine → repo / NAC
```

Routes still attach cookies via `server/crypto/session` (HTTP adapter). `/api/nac/*` still has no domain service (same as P6).

---

## 11. Database boundary

Unchanged. Frontend cannot import it. `lib/db/postgres.ts` remains an empty stub.

---

## 12. Financial engine boundary

```text
core/     analytics, advisor, forecast, opex, mapping, …  (no format.ts, no xlsx)
parser/   Excel/PDF/OCR + objectsFromSheet
shared/   math + calendar keys
```

Formulas unchanged. Golden KPIs identical.

---

## 13. Authentication boundary

Secrets stay server-only. Cookies, CSRF, IDOR, step-up, fail-closed, rate limits unchanged. SMTP remains `server/mail/`.

---

## 14. Security verification

Existing tests still pass: fail-closed evaluate, IDOR, auth, CSRF, step-up, integrity, golden KPIs (700/280/420/60% and opex net 600).

---

## 15. Legacy shims

**Kept (still imported):** `lib/types`, `lib/analytics`, `lib/engine`, `lib/serialize`, `lib/format` (UI + calendar re-export), `lib/phone`, `lib/tenant` (localStorage + identity re-export), `lib/smart-guard/types`, `server/validators/*`, P8 engine shims.

**Kept empty:** postgres, `lib/server/*`, parser stubs, Guard `run` stubs.

**Kept unused on purpose:** `lib/utils.ts` (mixed cn+math barrel, zero importers — deleting it is a later call), `lib/smart-guard/index.ts` (policy+types only).

---

## 16. Architecture tests

`tests/architecture-boundary.test.ts` now includes **P10 physical-split readiness**:

- Client ↛ server / db / repos / secrets / Node ingest  
- Shared ↛ server / db / React / Next headers  
- Server ↛ components / ui / recharts / dropzone  
- Financial core ↛ format / parser / db / secrets / xlsx  
- Core uses `@/shared/constants/calendar`  
- Workspace repo ↛ `lib/tenant`  
- Client barrels ↛ `export * from @/server`

---

## 17. `npm test`

**78 passed / 0 failed** (71 after P9 + 7 P10 readiness tests).

---

## 18. `next build`

**PASS.** Same json-store Turbopack warning (server-only). All `/api/*` URLs unchanged.

---

## 19. Client bundle

`.next/static`: no tesseract / unpdf / SheetJS / `sheet_to_json`. No `SESSION_SECRET` / `ADMIN_PASSWORD` / `NAC_API_KEY` / `MAIL_APP_PASSWORD`. `DATABASE_URL` only as i18n copy.

---

## 20. Remaining risks before a physical split (not P11)

- Still **one Next.js app**. Moving `app/` and `server/` into two packages needs a later phase (cookie origin, deploy, `@/` paths).
- `lib/admin/metrics.ts` still holds `AdminFacts` next to localStorage helpers (server type-imports only).
- Guard `policy.ts` still under `lib/smart-guard/` (pure; could move to shared later without behavior change).
- `/api/nac/*` has no domain service.
- Dual-write JSON + Postgres not cut over.
- `lib/utils.ts` mixed barrel remains as unused compatibility.
- Filling empty stubs with `export * from server` would recreate leaks.
- Turbopack traces json-store dynamically (server-only warning).

**Do not start P11 / do not create `frontend/` + `backend/` apps until review.**
