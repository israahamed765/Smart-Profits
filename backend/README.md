# Smart Profits backend

Standalone Node HTTP process. It does **not** copy the financial engine, Smart Guard, auth hashing, Admin credential check, or adapters.

```bash
npm run backend
```

Default: `http://localhost:4000`.

## On this process

Workspace, track, analyze, merchant Auth, and **Admin** (`/api/admin/login|me|logout|snapshot`, POST `/api/admin/users`).

Smart Guard, Step-Up, and NAC stay on Next.js.

Cookies `sp_session` / `sp_admin`: httpOnly, SameSite=Lax, host-only. See `docs/p12.4-admin-migration.md`.
