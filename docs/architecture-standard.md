# Architecture Standard

Reusable standard for product applications (including Next.js). Copy this document into a new repo and follow it before writing features.

This is a **module-boundary** architecture inside one product. It is not two separate deployments unless you later choose that explicitly.

---

## A. Project Structure

```text
project/
├── app/              Next.js routing, pages, layouts, BFF compatibility
├── frontend/         UI modules only (not a second Next app)
├── backend/          HTTP adapters / controllers / handlers
├── server/           Services, repositories, security, ingest, mail
├── shared/           Types, contracts, schemas, constants, pure utilities
├── lib/              Documented dual-use kernels only (optional)
├── public/           Static assets for the web app
├── tests/            Automated tests, including architecture boundaries
└── docs/             Architecture, audits, migration notes
```

| Folder | Responsibility | Must not contain |
| --- | --- | --- |
| `app/` | Framework routing. In Next.js: pages, layouts, and thin BFF routes that delegate to `backend/`. | Domain repositories, SQL, secrets, parser, SMTP |
| `frontend/` | Components, context, API clients, i18n, UI helpers, browser-only code | Database, secrets, server services, Node filesystem |
| `backend/` | HTTP mapping: parse request, call a service, write response | Fat business rules, direct SQL, React UI |
| `server/` | Business services, repositories, authn/authz, CSRF, sessions, parsers | React components, Tailwind UI, browser APIs |
| `shared/` | Pure shared contracts used by both sides | React, `localStorage`, `pg`, `node:fs`, secrets |
| `lib/` | Single-source kernels that are safe for both sides (e.g. pure calculations, policy functions with no I/O) | A second copy of those kernels under `frontend/` or `backend/` |
| `public/` | Images and static files | Source code, secrets |
| `tests/` | Behavior + architecture + security tests | Production secrets |
| `docs/` | The standard, checklists, audit history | Runtime configuration secrets |

Optional later: `database/` for SQL migrations. Until that folder exists, schema still lives behind repositories (never in Frontend).

---

## B. Frontend Architecture

### `app/` (Next.js infrastructure)

- Routing, layouts, pages
- BFF compatibility routes only (`app/api/*` delegates to backend handlers; it is not a second domain layer)
- Stays at the **repository root**

### `frontend/` (UI modules)

- `components/` — React UI
- `context/` — client state
- API clients (`fetch` / `credentials: "include"`)
- i18n copy
- UI utilities (class names, chart theme)
- Client-only helpers (localStorage keys, display money, Guard **HTTP client**)

### Frontend must never

- Open a database or import `pg` / SQL builders
- Import repositories
- Import server services
- Read `SESSION_SECRET`, `DATABASE_URL`, `NAC_API_KEY`, mail passwords, or any secret
- Use `node:fs` / `node:crypto` for product security
- Run file parsers, OCR, PDF extraction
- Send SMTP
- Import `@/server/*`, `@/backend/*`, or `@/lib/db/*`

Frontend talks to the product only through **HTTP APIs**.

---

## C. Backend Architecture

```text
HTTP  →  Handler  →  Service  →  Repository  →  Database
```

| Layer | Does | Must not |
| --- | --- | --- |
| **Handler** (controller) | Read method/path/headers/cookies, call one service, map result to status/body | Embed formulas, authorize by trusting `body.email`, query SQL |
| **Service** | Business rules, authentication, authorization, fail-closed decisions | Import React, write CSS, open raw SQL if a repository exists |
| **Repository** | Load and persist records | Decide prices, freeze accounts, mint sessions |
| **Database** | Durable state | Be reached from Frontend or from a React component |

`backend/` holds HTTP adapters. `server/` holds services, repositories, crypto, middleware, and ingest. Do not invert that.

---

## D. Shared Architecture

`shared/` is the only place for **framework-free** contracts both sides may import:

- Types
- Contracts (NAC, API shapes that are not UI)
- Schemas (Zod / equivalent)
- Constants
- Pure utilities (math, identity normalization)

### Shared must never

- Import React, Next, or UI packages
- Call `localStorage`, `window`, `document`
- Import database adapters
- Use Node I/O (`node:fs`, sockets)
- Read environment secrets
- Import `@/frontend/*` or `@/backend/*`

Direction: **Frontend → shared** and **Backend/server → shared**. Never the reverse.

---

## E. Business Logic Placement

| Concern | Where | Rule |
| --- | --- | --- |
| Financial calculations | One pure kernel (`lib/financial-engine/core` in this product, or `shared/` if it stays I/O-free) | Never copy into Frontend |
| Authentication | `server/` services + crypto | Never “login” by trusting the client |
| Authorization | `server/` (session + resource ownership) | Never equal to “is logged in” |
| Sessions / cookies | `server/` crypto + HTTP adapter | `httpOnly`, no secret in JS |
| Smart Guard **policy** | One kernel (here: `lib/smart-guard/policy.ts`) | Client only calls APIs |
| NAC / network checks | `server/` only | Keys never `NEXT_PUBLIC_*` |
| Validation | Schemas in `shared/`; **enforced** on the server | Client validation is UX only |
| Formatting / i18n | `frontend/` | Not a second engine |

**Do not copy business logic between Frontend and Backend.** If both sides need the same pure function, they import the **same file**.

---

## F. Security Boundary

1. **Frontend = untrusted.** Treat every browser payload as hostile.
2. **Authentication ≠ Authorization.** A valid cookie does not grant another user’s data.
3. **Identity comes from the session**, not from `body.email` / `body.userId` chosen by the client.
4. **Secrets are server-only.** No `NEXT_PUBLIC_` for session keys, DB URLs, NAC keys, or mail passwords.
5. **Database is server-only.** Path: Frontend → API → Service → Repository → Database.
6. **Sensitive operations fail closed** (deny / freeze when a check fails).
7. **CSRF and CORS are enforced server-side** on explicit origins. Never `Access-Control-Allow-Origin: *` with credentials.

---

## G. Dependency Direction

Allowed:

```text
app UI   →  frontend  →  shared
app BFF  →  backend   →  server  →  shared
```

Both sides may import **documented dual-use kernels** (pure engine, Guard policy, shared types). Those kernels must not import UI or database.

Forbidden:

```text
frontend  →  backend | server | database | secrets
shared    →  frontend | backend | database
backend   →  frontend
server    →  frontend
```

No circular imports among local TypeScript modules.

---

## H. Rules for Next.js Projects

- `app/` **stays at the repo root**. Next.js requires it.
- **Forbidden:** `frontend/app/`
- **Forbidden:** `frontend/package.json` as a second Next application
- **Forbidden:** a second `middleware.ts` under `frontend/`
- `frontend/` is a **folder of modules**, not a deployable Next app
- Keep `@/*` (or equivalent) working; do not break the App Router

Non-Next projects may omit `app/` and put UI exclusively under `frontend/`, still without a nested second framework app.

---

## I. Database Rule

```text
Frontend  →  API  →  Service  →  Repository  →  Database
```

Not:

```text
Frontend  →  Database
Handler   →  Database     (skip the service when a service exists)
```

Schema changes are migrations, not Frontend work. Do not put connection strings in client bundles.

---

## J. Migration Rule

Move a legacy monolith **one gate at a time**. Do not start the next phase until tests for the current phase pass.

```text
Audit
  → Boundaries
  → Backend separation
  → Frontend organization
  → Import cleanup
  → Tests
  → Final audit
```

Rules during migration:

- Do not copy production files to create a second engine or second app
- Keep API paths, cookies, and CORS stable unless the phase is explicitly about those
- Leave dual-use kernels in one place
- If a move would create `frontend → server` or `backend → frontend`, do not move that file; document why
- Compatibility shims are temporary; they must not re-export server code into the client

---

## K. Single Source of Truth

Never duplicate:

- Financial / calculation engines
- Smart Guard (or equivalent) **policy**
- Authentication / session minting
- Business calculations
- Canonical validation rules

If code is pure and both sides need it, **one module**, imported twice. If code needs Node, the database, or secrets, it stays on the server and the client calls an API.

---

## Mapping notes (this repository)

These are **historical placements**, not an invitation to copy kernels into `frontend/`:

| Kernel | Location here | Why |
| --- | --- | --- |
| Financial engine | `lib/financial-engine/core` | Pure calculations; Client and Backend import the same files |
| Guard policy | `lib/smart-guard/policy.ts` | Same decision function; NAC I/O stays in `server/` |
| Admin plan types | `lib/admin/config.ts`, `lib/admin/types.ts` | Used by UI and `server/` |
| Mixed leftover | `lib/utils.ts` | Compatibility shim; do not delete in a docs-only wave |

Greenfield projects may put pure kernels under `shared/` from day one, provided they remain I/O-free.
