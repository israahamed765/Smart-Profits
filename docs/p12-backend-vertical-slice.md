# P12.2 — Backend vertical slice

**Date:** 2026-08-23  
**Baseline before edits:** `npm test` 99 passed / 0 failed. `next build` PASS.

---

## Why this endpoint

**Selected:** `GET /api/workspace`

From `docs/p12-api-contract-inventory.md`, this is a **read-only** merchant workspace fetch:

| Avoided | Why GET /api/workspace is safer |
| --- | --- |
| Login / cookie writes | Does not `Set-Cookie` |
| `/api/analyze` | No file upload, parser, OCR, Excel |
| Smart Guard / NAC | No evaluate, no `NAC_API_KEY` |
| POST /api/workspace | No write / parseResult sanitize on this slice |
| GET /api/nac | No repository / database — would not prove the full stack |

It still exercises the required chain:

```text
HTTP → workspace.service → workspace.repository → Postgres + JSON adapters
```

Session **verification** is reused (`session-core` HMAC). Cookie **names/flags are unchanged**. CORS was **not** added: the browser still calls the Next.js origin.

---

## Current vs new architecture

**Before:** Browser `fetch("/api/workspace")` → Next.js `app/api/workspace/route.ts` → `getMerchantWorkspace` → repository.

**After (default, tests & single process):** same public URL. Next.js GET calls `backend/src/http/workspace-get.ts`, which calls the **existing** `server/services/workspace.service.ts` (via a re-export). No second engine.

**After (two-process proof):** Next.js GET proxies to `BACKEND_URL` (server-only). Standalone Node server on port 4000 serves the same GET.

| | URL |
| --- | --- |
| Current / browser | `GET /api/workspace` |
| Backend process | `http://127.0.0.1:4000/api/workspace` |
| Compatibility | In-process handler, or `BACKEND_URL` proxy. Cookies stay host-only on the Next origin. |

POST `/api/workspace` **stays** on Next.js (not part of this slice).

---

## Backend structure

```text
backend/
  src/http/          Node HTTP + GET /api/workspace handler
  src/services/      re-export of server/services (no copy)
  src/repositories/  re-export only (HTTP must not import this)
  src/storage/       re-export of postgres + json-store
  src/config/        port + chdir to repo root (same data/)
  src/shared/        re-export of shared/identity
```

**Runtime:** Node.js `node:http` (no Express/Hono/Fastify). `tsx` to run TypeScript. Same `pg` / `zod` via the parent `node_modules`.

---

## Request / response / database / auth / CORS / env

- **Request:** `GET`, `Cookie: sp_session=…`
- **Response:** `{ workspace }` or `{ error }` with 401/500 — same strings as before
- **Database:** `loadWorkspace` in the existing repository; JSON files still under repo `data/` (`chdir` to repo root)
- **Auth:** `requireMerchant` → `readMerchantSession` in `session-core.ts` (moved out of `next/server` only so the backend process does not load Next.js). HMAC, TTLs, cookie names unchanged. `session.ts` still sets cookies for login routes.
- **CORS:** none
- **Env:** `SESSION_SECRET` (required to verify cookies), optional `DATABASE_URL`, optional `BACKEND_PORT` / `BACKEND_HOST` / `BACKEND_URL`. No `NEXT_PUBLIC_*` secrets.

Errors to the client: `{ error: string }` only. No stack traces, no connection strings.

---

## Files

**Created:** `backend/**`, `server/crypto/session-core.ts`, `tests/backend-vertical-slice.test.ts`, this doc.

**Modified:** `server/crypto/session.ts` (Next cookie attach only), `server/middleware/authenticate.ts` (imports core), `app/api/workspace/route.ts` (GET delegates), `package.json`, `.env.example` (commented optional backend vars), `tests/architecture-boundary.test.ts`.

**Moved:** HMAC/session read logic `session.ts` → `session-core.ts` (one copy).

**Deleted:** none.

---

## Duplication check

No second financial engine, Guard policy, `Pool`, JSON `dataDir`, or HMAC encoder under `backend/` — only `export { … } from "@/server/…"`.

---

## Rollback

1. Point `GET` in `app/api/workspace/route.ts` back at `apiRoute` + `getMerchantWorkspace` (pre-P12.2).
2. Stop using `backend/`.
3. Leave `session-core.ts` or inline it back into `session.ts` — cookie behavior is identical.

Do not delete `data/*.json` or Postgres data.
