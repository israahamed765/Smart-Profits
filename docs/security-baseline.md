# Phase 1 — Security baseline (verified against current files)

No architecture folders were created. This is a **re-read of the code after the previous security patch**, not a new rewrite.

| # | Requirement | Current file evidence | Status |
| --- | --- | --- | --- |
| 1 | evaluate: action from body, never undefined, fail-closed | `resolveGuardIdentity` → `parseSensitiveAction(body.action)`. Catch returns `freeze` / `check_failed` / 503. Client has no `allowFallback`. | **Fixed** |
| 2 | step-up not trusting body.email when session exists | `identity.ts`: if session → `session.email`. Pre-auth login/reset only. | **Fixed** |
| 3 | SESSION_SECRET from env, no code fallback | `session.ts` throws if missing. httpOnly, SameSite Lax, Secure in production. Weak-length check **not** implemented. | **Mostly fixed** |
| 4 | No production admin password in source | `admin.service.ts` requires `ADMIN_EMAIL` + `ADMIN_PASSWORD`. | **Fixed** |
| 5 | Protected APIs use session ownership | workspace/profile/logs/analyze/demo use `requireMerchant` + session email. | **Fixed** for those routes |
| 6 | Zod + weak workspace | Auth/profile/admin/track Zod. Workspace: files shape + max 20, still `.passthrough()`. Workspace POST still stores client `parseResult`. | **Partial** |
| 7 | Authoritative finance on server | Upload → `/api/analyze`. What-if + HTML export still use `lib/advisor` / `lib/analytics` in the browser. | **Partial** |
| 8 | Rate limit preserved, later Redis | In-memory `Map` on login/register/reset/admin-login/evaluate/send/verify/analyze. Not Redis. | **Preserved, not distributed** |
| 9 | Parameterized SQL | `guard-log.ts` `$1…$19`; merchants/workspaces/events use `$1,$2`. | **OK** |
| 10 | CSRF | `assertSameOrigin` on mutating `apiRoute` except `/api/nac`. | **Origin check, not CSRF token** |

## Remaining (do not treat as “migration success”)

- Workspace JSON can still carry tampered financial blobs (integrity, not IDOR).
- Rate limiter is per-process.
- Step-up codes live in an in-memory `Map` (`network-code.ts`); replay is deleted after success, but not shared across instances.
- Simulator may return `demoCode`.
- No automated security tests yet (Phase 10).
- `SESSION_SECRET` not checked for minimum entropy.
- JSON files still exist and must stay until Phase 4 verification.

## Files deleted this phase

**ZERO.**
