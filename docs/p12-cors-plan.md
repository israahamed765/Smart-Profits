# P12.1 — CORS plan (document only)

**Date:** 2026-08-23  
**Rule:** **do not add CORS middleware in this phase.** The app is same-origin today.

---

## Current (production monolith)

```text
Browser  →  https://<same-host>/api/*     (cookies host-only, SameSite=Lax)
```

CSRF: `assertSameOrigin` — mutating requests need Origin/Referer matching `Host` or `APP_URL`.  
`/api/nac*` is exempt (CAMARA-shaped mock).

Local: `APP_URL=http://localhost:3000` (`.env.example`).  
Deployed UI (current): `https://smart-profits-ruddy.vercel.app` — still one Next.js origin.

---

## Future (when Backend is a separate origin)

```text
Frontend  --HTTPS, credentials: include-->  Backend API
```

| Setting | Planned value | Do not use |
| --- | --- | --- |
| Production frontend origin | the live Vercel (or later custom) **exact** origin | `*` |
| Development frontend origin | `http://localhost:3000` (UI) talking to API on another port **only after** P12.2+ | reflecting any Origin |
| Allowed methods | `GET`, `HEAD`, `POST`, `OPTIONS` (current surface; no PUT/PATCH/DELETE on product APIs) | |
| Allowed headers | `Content-Type`, and whatever the client already sends | |
| `Access-Control-Allow-Credentials` | `true` | credentials + `*` |
| Cookie `SameSite` | keep `lax` until a real cross-site case exists; cross-site would need `none` + `secure` — **product decision later** | silent flip in P12.1 |
| CSRF | keep Origin allowlist = frontend origins ∪ API host; or double-submit later | dropping CSRF because “we added CORS” |

---

## Why this is not implemented now

1. Frontend and API still share one origin; CORS would be unused and easy to misconfigure.
2. Changing cookie `Domain` / `SameSite` would be an Auth behavior change (forbidden in P12.1).
3. NAC mock exemption must stay until that surface is redesigned.

**P12.2+** may add an allowlist **only** when a second origin actually exists.
