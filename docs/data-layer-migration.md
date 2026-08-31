# Data Layer Migration Inventory (P5)

**Date:** 2026-08-21  
**Baseline:** 54 tests pass. `next build` passes. Dual-write JSON + Postgres **stays**.  
**This phase does not:** delete JSON, run SQL/data migration, change schema, change API/auth/Guard rules, or touch the financial engine.

Target call chain after P5:

```text
API route
  → Service
    → Repository
      → Data Access Adapter
           ├─ server/db/postgres.ts
           └─ server/storage/json-store.ts
```

Not yet: PostgreSQL as the only source of truth.

---

## 1. Every repository (before P5)

| Repository | File | Real body today | Public functions |
| --- | --- | --- | --- |
| Users / merchants | `server/repositories/user.repository.ts` | **same file** | `readAccounts`, `upsertAccount`, `findAccount`, `findAccountByPhone`, `publicAccount` |
| Workspaces | `server/repositories/workspace.repository.ts` | **re-export** of `lib/server/workspaces.ts` | `loadWorkspace`, `saveWorkspace`, `listWorkspaces` |
| Track events | `server/repositories/event.repository.ts` | **re-export** of `lib/server/events.ts` | `readEvents`, `appendEvent`, `mergeEvents` |
| Guard decisions | `server/repositories/guard-log.repository.ts` | **same file** (moved in P4) | `appendGuardDecision`, `listGuardDecisions` |
| Guard demo flags | **none** | `server/smart-guard/demo.ts` | `readDemoFlags`, `writeDemoFlags` (+ in-memory session maps) |

Alias (not a repository): `lib/server/accounts.ts` re-exports `user.repository`.

---

## 2. Every data source

| Source | Kind | Module | Notes |
| --- | --- | --- | --- |
| PostgreSQL | Optional (`DATABASE_URL`) | `server/db/postgres.ts` (`lib/db/postgres.ts` is a P3 shim) | Pool + `CREATE TABLE IF NOT EXISTS` at first query. 30s downtime window on error. |
| JSON filesystem | Always (fallback / dual-write) | `lib/server/json-store.ts` | Local: `data/`. Vercel: write `/tmp/smartprofit-data`, read that then shipped `data/`. |
| In-memory Map | Process | same json-store | Same relative keys as files. Survives a failed disk write on this instance. |
| In-memory OTP | Process | `server/smart-guard/network-code.ts` | Step-up codes. Not a repository. |
| In-memory NV / step-up session | Process | `server/smart-guard/demo.ts` | TTL maps. Not JSON/PG. |
| SMTP | Side channel | `lib/server/send-password-email.ts` | Auth reset only. |
| Browser localStorage | Client | not server data | Out of P5. |

Read preference (must not change in P5):

- **Users:** Postgres rows if any exist; else JSON. Empty PG + non-empty JSON backfills PG then returns JSON.
- **Workspaces:** Postgres row if it has `files`; else JSON. If JSON has `files` and PG was reachable but empty, save JSON into PG.
- **Events:** Postgres if `fromPg && length > 0`; if PG reachable but empty, JSON; if PG down, JSON.
- **Guard logs:** insert/list PG first; JSON file only when `queryPostgres` returns null.
- **Demo flags:** JSON only. No Postgres table.

Write preference (must not change in P5):

- **Users:** PG upsert, then JSON array write. On Vercel, PG configured but write failed → throw.
- **Workspaces / events:** JSON write, then PG. Same Vercel throw.
- **Guard logs:** PG insert; if that returns null, prepend JSON (cap 2000).
- **Demo flags:** JSON only.

These four write/read shapes are **not** the same. P5 must not “unify” them.

---

## 3. Every JSON file

| Relative key | Path (local) | Owner | Shape |
| --- | --- | --- | --- |
| `users.json` | `data/users.json` | `user.repository` | `StoredAccount[]` |
| `workspaces/{fileSafeEmail}.json` | `data/workspaces/*.json` | `lib/server/workspaces.ts` | one `PersistedWorkspace` per merchant |
| `events.json` | `data/events.json` | `lib/server/events.ts` | `TrackEvent[]` (cap 2000) |
| `guard-decisions.json` | `data/guard-decisions.json` | `guard-log.repository` | `GuardDecisionLog[]` (cap 2000) |
| `nac-demo.json` | `data/nac-demo.json` | `server/smart-guard/demo.ts` | `{ [email]: NacDemoFlags }` |

`fileSafeEmail` lives in `lib/tenant.ts`. Workspace list reconstructs email from `ownerEmail` or filename `_at_` → `@`.

P5 **must not** rename these keys or delete files.

---

## 4. Every PostgreSQL table

Created at runtime by `SCHEMA_SQL` in `server/db/postgres.ts`. No `migrations/` folder.

| Table | Key | Payload | Used by |
| --- | --- | --- | --- |
| `merchants` | `email` PK | `payload JSONB` (`StoredAccount`) | `user.repository` |
| `workspaces` | `email` PK | `payload JSONB` (`PersistedWorkspace`) | `lib/server/workspaces.ts` |
| `track_events` | `id` PK | `at BIGINT` + `payload JSONB` (`TrackEvent`) | `lib/server/events.ts` |
| `guard_decisions` | `id` PK | typed columns + `traces JSONB` | `guard-log.repository` |

No table for `nac-demo.json`.

P5 **must not** change this SQL.

---

## 5. Every service → repository

| Service | Repositories | Routes |
| --- | --- | --- |
| `auth.service` | `user.repository` | `/api/auth/login`, `register`, `me`, `forgot-password`, `reset-password` |
| `profile.service` | `user.repository` | `/api/auth/profile` |
| `admin.service` | `user` + `workspace` + `event` | `/api/admin/login`, `snapshot`, `users` |
| `workspace.service` | `workspace.repository` | `GET/POST /api/workspace` |
| `track.service` | `event.repository` (`appendEvent` only; `mergeEvents` unused) | `POST /api/track` |

Mail: `auth.service` → `lib/server/send-password-email.ts` (not a store).

---

## 6. Direct filesystem / database access outside repositories

| Caller | What it touches | Should be after P5 |
| --- | --- | --- |
| `lib/server/workspaces.ts` | json-store + postgres | **body moves into** `workspace.repository` |
| `lib/server/events.ts` | json-store + postgres | **body moves into** `event.repository` |
| `lib/server/json-store.ts` | `fs` / `/tmp` / `data/` | **adapter** `server/storage/json-store.ts`; old path re-exports |
| `lib/db/postgres.ts` | re-export of pool | stays shim |
| `server/smart-guard/demo.ts` | `nac-demo.json` via json-store | keep flags behind a repository or adapter import; **do not change flag semantics** |
| `POST /api/smart-guard/step-up/send` | `user.repository.findAccount` (skips service) | leave (Guard identity / phone lookup) |
| `GET /api/smart-guard/logs` | `server/smart-guard/logs` → guard-log repo | Route → Guard module → repository. No service. Leave unless a thin pass-through is added. |
| `GET/POST /api/smart-guard/demo` | `server/smart-guard/demo` | JSON flags; no service |
| `server/smart-guard/run.ts` | `user.repository` + `guard-log.repository` | engine → repository is correct (not HTTP) |
| `lib/server/request-meta.ts` | headers only | not data |
| `POST /api/analyze` | parser + engine | not a store |

No `"use client"` file imports json-store, postgres, or repositories.

---

## 7. Duplicated data-access logic

| Duplication | Risk if “cleaned” blindly |
| --- | --- |
| Dual-write JSON+PG copied in users, workspaces, events, guard-log — **different order and fallback** | Unifying writers would change persistence. **Do not merge in P5.** |
| `lib/server/accounts.ts` vs `user.repository` | Two import paths, one implementation. Keep shim. |
| `workspace.repository` vs `lib/server/workspaces.ts` | Forward shim. Collapse into the repository. |
| `event.repository` vs `lib/server/events.ts` | Same. |
| PG import `@/lib/db/postgres` vs `@/server/db/postgres` | Same module. Point repositories at `server/db`. |
| Guard log PG-first vs workspace JSON-first | Intentional. Leave. |

---

## 8. Dependencies on JSON behavior

These must keep working after P5 (refactor only):

- Relative file names (`users.json`, `events.json`, `workspaces/{email}.json`, …).
- In-memory Map so a write that cannot hit disk still reads back on this process.
- Vercel `/tmp` vs shipped `data/`.
- Workspace email encoding via `fileSafeEmail`.
- Empty PG + existing JSON backfill for merchants and workspaces.
- Events: PG empty array does **not** hide JSON (`if (fromPg && fromPg.length > 0)`).
- Vercel throw when PG is configured but the write returns null.
- `mergeEvents` JSON-only (no PG insert) — unused by HTTP, still part of the module.

---

## 9. Risks if PostgreSQL became the only source (later — not P5)

| Risk | Why |
| --- | --- |
| Local/dev without `DATABASE_URL` | Today JSON is the product. PG-only would empty merchants/workspaces. |
| Vercel `/tmp` vs Postgres | Demo flags and any JSON-only data (`nac-demo.json`) have **no** table. |
| Event `id` | PG insert uses a new `randomUUID()`; JSON array is the full list. A PG-only reader ignores the JSON list identity. |
| Guard log JSON cap 2000 vs unbounded PG | Switching list to PG-only changes history length. |
| Dual-write divergence | A row in JSON but not PG (or the reverse) would be dropped. Needs an explicit copy job — **not this phase**. |
| `CREATE TABLE IF NOT EXISTS` | Not a migration history. PG-only still would not backfill from `data/*.json` automatically except the current opportunistic loops. |
| In-memory OTP / NV maps | Lost on restart either way; unrelated to PG. |

P5 only relocates modules so a later, separate data project can swap adapters **without** changing Services or API routes.

---

## P5 implementation choice (smallest)

1. Copy `json-store` to `server/storage/json-store.ts`. Old path re-exports. Behavior unchanged.
2. Move workspace persistence **into** `workspace.repository.ts`. `lib/server/workspaces.ts` re-exports the repository.
3. Move event persistence **into** `event.repository.ts`. `lib/server/events.ts` re-exports the repository.
4. Point remaining repositories at `server/db/postgres` + `server/storage/json-store`.
5. Put `nac-demo.json` behind `demo.repository.ts`; `server/smart-guard/demo.ts` keeps in-memory session maps and re-exports flags.
6. Do **not** delete JSON, change SQL, change dual-write order, or rewire Guard identity / rate limits.
7. `npm test` after each move. Then `next build` if tests pass.

Out of P5: PG-only cutover, deleting `data/`, Guard security, engine, API contracts, P6.

---

## After P5 (refactor result)

```text
API  →  Service  →  Repository  →  Adapter
                                    ├─ server/db/postgres.ts
                                    └─ server/storage/json-store.ts
```

| Repository | Body | Adapter |
| --- | --- | --- |
| `user.repository.ts` | real | postgres + json-store |
| `workspace.repository.ts` | **real** (was shim) | postgres + json-store |
| `event.repository.ts` | **real** (was shim) | postgres + json-store |
| `guard-log.repository.ts` | real | postgres + json-store |
| `demo.repository.ts` | **new** (`nac-demo.json`) | json-store only |

Shims kept (not deleted): `lib/server/json-store.ts`, `lib/server/workspaces.ts`, `lib/server/events.ts`, `lib/server/accounts.ts`, `lib/db/postgres.ts`.

JSON files, SQL, dual-write order, and API routes were not changed.

Remaining (not P5): `POST /api/smart-guard/step-up/send` still calls `user.repository` directly; Guard logs/demo HTTP still go through `server/smart-guard/*` rather than a domain service. In-memory OTP/NV maps are not repositories.

