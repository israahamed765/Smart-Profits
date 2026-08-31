# Architecture Rules

Checklist to review **before starting any new project** and again **before merge**. Framework-agnostic. Folder names stay in English.

Full explanation: `docs/architecture-standard.md`

---

## Structure

- [ ] `app/` at the repository root if the project is Next.js
- [ ] `frontend/` does not contain `app/`
- [ ] `frontend/` is not a second Next.js (or other) application (`no frontend/package.json` for that purpose)
- [ ] `backend/` holds HTTP adapters / handlers only
- [ ] `server/` holds services, repositories, and security
- [ ] `shared/` holds pure shared code only
- [ ] `tests/` holds automated tests
- [ ] `docs/` holds architecture and audit notes

## Frontend

- [ ] No database access
- [ ] No secrets (`SESSION_SECRET`, `DATABASE_URL`, API private keys, mail passwords)
- [ ] No `@/server` or `@/backend` imports
- [ ] No repositories
- [ ] No Node filesystem / parser / SMTP
- [ ] Talks to the product through HTTP APIs only

## Backend

- [ ] Handler contains no business formulas or authorization shortcuts
- [ ] Service contains business logic
- [ ] Repository reads and writes data only
- [ ] Database sits behind the repository
- [ ] Path: HTTP → Handler → Service → Repository → Database

## Security

- [ ] Frontend is untrusted
- [ ] Authentication is server-side
- [ ] Authorization is server-side (not the same as authentication)
- [ ] Identity comes from the session, not from the request body
- [ ] Secrets are server-only (never `NEXT_PUBLIC_` for secrets)
- [ ] Sensitive operations fail closed
- [ ] CSRF and CORS are enforced on the server

## Shared

- [ ] No React
- [ ] No browser APIs (`localStorage`, `window`, `document`)
- [ ] No database
- [ ] No Node I/O
- [ ] No secrets
- [ ] No imports from `frontend/` or `backend/`

## Architecture

- [ ] No copied business logic between Frontend and Backend
- [ ] No copied calculation / financial engine
- [ ] No copied Guard (or equivalent) policy
- [ ] No circular local imports
- [ ] Frontend does not depend on Backend as a module
- [ ] Dual-use code has **one** source file, I/O-free
- [ ] Next.js: never `frontend/app/`

## Before merge

- [ ] `npm test` (or the repo’s test script)
- [ ] Production build (`next build` or equivalent)
- [ ] Architecture boundary tests
- [ ] Security checks (authz, CSRF, secrets in client)
- [ ] Final dependency audit (Frontend ↛ DB/server/secrets)
