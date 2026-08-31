# P12.1 — Database boundary

**Date:** 2026-08-23  
**Rule:** no schema change, no SQL migration, no JSON deletion, no cutover.

```text
Frontend
    ❌ Database
    ❌ JSON files
    ❌ Repositories

Backend
    API → Services → Repositories → Adapters → Postgres / JSON
```

---

## Ownership

| Store | Owner | Frontend |
| --- | --- | --- |
| Postgres (`DATABASE_URL`) | `server/db/postgres.ts` | never |
| JSON files under `data/` (or `/tmp/smartprofit-data` on Vercel) | `server/storage/json-store.ts` | never |
| Dual-write merge | each repository | never |

Client persistence of analysis is **workspace JSON via** `POST /api/workspace` (session email), not direct disk.

---

## Adapters

### Postgres (`server/db/postgres.ts`)

- `pg` `Pool` (max 5). `serverExternalPackages` includes `pg`.
- `ensureGuardSchema` runs `CREATE TABLE IF NOT EXISTS` for:
  - `guard_decisions`
  - `merchants` (JSONB payload)
  - `workspaces` (JSONB payload)
  - `track_events` (JSONB payload)
- `queryPostgres` returns `null` on failure and backs off 30s (fail toward JSON). **P12.1 does not change this.**

### JSON (`server/storage/json-store.ts`)

- Read: writable dir then shipped `data/`.
- Write: writable dir; ignore EROFS on Vercel.
- In-memory cache per process.

---

## Repositories (only these talk to adapters)

| Repository | JSON path | Postgres | Dual-write |
| --- | --- | --- | --- |
| `user.repository.ts` | `users.json` | `merchants` | PG read if rows exist; else JSON; upsert writes both. On Vercel if PG configured and write fails → throw. |
| `workspace.repository.ts` | `workspaces/{fileSafeEmail}.json` | `workspaces` | same pattern |
| `event.repository.ts` | `events.json` | `track_events` | same pattern |
| `guard-log.repository.ts` | `guard-decisions.json` (cap 2000) | `guard_decisions` | append both |
| `demo.repository.ts` | `nac-demo.json` | none | JSON only |

`server/smart-guard/run.ts` and `demo.ts` may call repositories (Guard **implementation**, not API). API routes must not.

---

## Data files (do not delete)

- `data/users.json`
- `data/workspaces/*.json`
- `data/events.json`
- `data/guard-decisions.json`
- `data/nac-demo.json`

---

## Migration risks (later phases)

1. Cutting over to Postgres-only without backfill loses local JSON merchants/workspaces.
2. Vercel `/tmp` is not durable; PG is the durable path when configured.
3. JSONB `payload` is not a normalized schema — changing `StoredAccount` / `PersistedWorkspace` is a data migration, not a folder move.
4. Dual-write races if two instances write JSON without PG.

**P12.1:** leave dual-write as-is.
