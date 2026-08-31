# Data Access Inventory (before P3)

**Date:** 2026-08-21  
**Rule:** audit only in this file. Dual-write JSON + Postgres stays. No schema change. No JSON deletion.

P3 after this document: move the **Postgres client module** to `server/db/postgres.ts` and leave `lib/db/postgres.ts` as a re-export. Do **not** move `json-store`, workspaces, events, or Guard files in P3.

---

## 1. Data sources that exist today

| Store | Kind | Location | Tables / files |
| --- | --- | --- | --- |
| PostgreSQL | Optional (`DATABASE_URL`) | `lib/db/postgres.ts` (pre-P3) | `merchants` JSONB, `workspaces` JSONB, `track_events` JSONB, `guard_decisions` typed columns |
| JSON filesystem | Always | `data/` locally; `/tmp/smartprofit-data` on Vercel | `users.json`, `workspaces/*.json`, `events.json`, `guard-decisions.json`, `nac-demo.json` |
| In-memory | Process | `json-store.ts` `Map` | Same relative keys as JSON files |
| In-memory OTP | Process | `lib/smart-guard/network-code.ts` | Step-up codes (not a repository) |
| Browser localStorage | Client | `lib/admin/track.ts`, analysis workspace keys | Not server data access |

Schema is created at runtime (`CREATE TABLE IF NOT EXISTS` in the Postgres module). There is **no** `migrations/` folder.

When Postgres is up, writers typically **dual-write** JSON then PG. On Vercel, a failed PG write **throws**. When PG is down, `queryPostgres` returns `null` and callers use JSON.

---

## 2–4. Repository / service / source

| Domain | Repository (name used by services) | Real implementation | Service | JSON | Postgres |
| --- | --- | --- | --- | --- | --- |
| Merchants / users | `server/repositories/user.repository.ts` | **same file** (real) | `auth.service`, `profile.service`, `admin.service` | `users.json` | `merchants.payload` |
| Workspaces | `server/repositories/workspace.repository.ts` | **re-export** of `lib/server/workspaces.ts` | `workspace.service` | `data/workspaces/{email}.json` | `workspaces.payload` |
| Track events | `server/repositories/event.repository.ts` | **re-export** of `lib/server/events.ts` | `track.service` | `events.json` | `track_events.payload` |
| Guard decisions | **none under `server/repositories`** | `lib/server/guard-log.ts` | **no service** | `guard-decisions.json` | `guard_decisions` |
| Guard demo flags | none | `lib/smart-guard/demo.ts` | **no service** | `nac-demo.json` | no |
| Mail | n/a | `lib/server/send-password-email.ts` | `auth.service` (SMTP, not a DB) | no | no |

Alias: `lib/server/accounts.ts` re-exports `user.repository` (reverse shim).

---

## 5. Every file that reaches data directly

These modules call `queryPostgres` and/or `readJsonFile` / `writeJsonFile` / `listJsonFiles`:

| File | Postgres | JSON store |
| --- | --- | --- |
| `lib/db/postgres.ts` | pool + `ensureGuardSchema` | no |
| `lib/server/json-store.ts` | no | yes (implementation) |
| `server/repositories/user.repository.ts` | `merchants` | `users.json` |
| `lib/server/workspaces.ts` | `workspaces` | `workspaces/*.json` |
| `lib/server/events.ts` | `track_events` | `events.json` |
| `lib/server/guard-log.ts` | `guard_decisions` | `guard-decisions.json` |
| `lib/smart-guard/demo.ts` | no | `nac-demo.json` |

No `"use client"` file imports these.

---

## 6. Routes that skip Service / Repository

**Already layered (Route → Service → Repository):**

- `/api/auth/*` → `auth.service` / `profile.service` → `user.repository`
- `/api/workspace` → `workspace.service` → `workspace.repository`
- `/api/track` → `track.service` → `event.repository`
- `/api/admin/snapshot`, `/api/admin/users`, `/api/admin/login` → `admin.service` → user/workspace/event repos

**Route → `lib/server/*` (the gap P3 does not close — Smart Guard is frozen this round):**

| Route | Direct import | Missing layer |
| --- | --- | --- |
| `GET /api/smart-guard/logs` | `listGuardDecisions` from `lib/server/guard-log` | no repository, no service |
| `POST /api/smart-guard/step-up/send` | `findAccount` from `lib/server/accounts` | skips `auth.service`; uses reverse shim |
| `POST /api/smart-guard/evaluate` | `requestMeta` from `lib/server/request-meta` | not data; HTTP helper |
| `POST /api/smart-guard/step-up/verify` | `requestMeta` | same |
| `GET/POST /api/smart-guard/demo` | `lib/smart-guard/demo` | JSON flags; no repository |

**Route → engine, not a store:** `POST /api/analyze` (file bytes → parser + `runFullAnalysis`). Session only.

**NAC mock routes:** in-memory simulator profiles, not merchant JSON/PG.

---

## 7. Duplication: `server/repositories` vs `lib/server`

| Pair | What it is |
| --- | --- |
| `lib/server/accounts.ts` → `user.repository.ts` | Reverse shim. Two import paths for the same users store. |
| `workspace.repository.ts` → `lib/server/workspaces.ts` | Forward shim. Implementation still under `lib/server`. |
| `event.repository.ts` → `lib/server/events.ts` | Forward shim. Same. |
| Guard log | Implementation only under `lib/server`; **no** `server/repositories/guard-log.repository.ts`. |

Risk of a later real import cycle if someone adds `user.repository` → `accounts.ts`.

---

## 8. Risks of moving files (for P3 and later)

| Move | Risk | P3? |
| --- | --- | --- |
| Postgres module to `server/db` with old path re-export | Low if formulas/SQL unchanged; `pg` stays `serverExternalPackages` | **Yes — this is P3** |
| `json-store.ts` | Medium: Vercel `/tmp` vs `data/`; in-memory Map identity | P4 — not this round |
| Collapse workspace/events into `server/repositories` | Medium: dual-write + email file names | P5 — not this round |
| Rewire Guard routes off `lib/server` | High: fail-closed / step-up identity | Frozen — do not touch Smart Guard |
| Changing SQL or JSON keys | High: data loss | Forbidden |

**P3 must not:** migrate JSON → Postgres, delete JSON, change `CREATE TABLE` text, change API URLs, cookies, engine, or Guard.

---

## Desired call chain (target)

```text
API Route  →  Service  →  Repository  →  Data Access (server/db + json-store)
```

**Today for merchants/workspaces/track:** already true at the Route→Service→Repository names, but workspace/event **bodies** still live in `lib/server`.

**Today for Guard logs / demo / step-up send:** Route still imports `lib/server` or `lib/smart-guard/demo`. Out of P3.

---

## P3 implementation choice (smallest)

1. Copy Postgres client to `server/db/postgres.ts` (same SQL, same pool).
2. Turn `lib/db/postgres.ts` into `export * from "@/server/db/postgres"`.
3. Leave all current importers on `@/lib/db/postgres` (shim).
4. Do not move `json-store` or `lib/server/workspaces|events|guard-log`.
