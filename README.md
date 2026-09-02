# Smart Profits

**AI-Driven Financial Analytics & Telco-Secured Merchant Platform**

[![Theme 4](https://img.shields.io/badge/GSMA-Theme%204%20FinTech-0f9e94)](#business-value)
[![Nokia NaC](https://img.shields.io/badge/Nokia-Network--as--Code-4fd1c5)](#camara-api-coverage)
[![Smart Guard](https://img.shields.io/badge/AI%20Agent-Smart%20Guard-e8c56b)](#architecture)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](#tech-stack)
[![Tests](https://img.shields.io/badge/tests-40%2B%20suites-blue)](#testing--quality)

> **GSMA MENA Ignite Open Gateway Hackathon 2026** · Theme 4: Secure FinTech, Payments & Anti-Fraud Innovation

Arabic-first (RTL) merchant SaaS that turns messy Excel/CSV into profit decisions — protected by **GSMA CAMARA APIs** via **Nokia Network-as-Code**, orchestrated by the **Smart Guard AI Agent** (Allow · Step-up · Freeze).

**Team:** Israa Nael Hamad · University of Palestine, Gaza · [Bitsandbytesdude](https://bitsandbytesdude.vercel.app/)

---

## For judges — start here (2 minutes)

| Resource | Link |
|----------|------|
| **Judge quick-start** | [`docs/hackathon/HACKATHON.md`](docs/hackathon/HACKATHON.md) |
| **Pitch deck (18 slides)** | [`docs/hackathon/Smart-Profits-HACKATHON-PITCH-DECK.pptx`](docs/hackathon/Smart-Profits-HACKATHON-PITCH-DECK.pptx) |
| **Presentation guide** | [`docs/hackathon/PRESENTATION-GUIDE.md`](docs/hackathon/PRESENTATION-GUIDE.md) |
| **Live demo** | _Add your deployed URL before submission_ |
| **Demo video (3 min)** | _Add YouTube/Loom link before submission_ |
| **Source code** | https://github.com/israahamed765/Smart-Profits |

### Mandatory hackathon requirements — both implemented

| Requirement | Where to verify |
|-------------|-----------------|
| **A — GSMA CAMARA via Nokia Network-as-Code** | `server/smart-guard/nokia-adapter.ts` · live logs `[nac-live] provider=Nokia` |
| **B — AI Agent orchestration & decisions** | `lib/smart-guard/policy.ts` · `server/smart-guard/enforce.ts` · UI overlay |

---

## Quick start (local)

### Prerequisites

- **Node.js** 20+
- **PostgreSQL** (Docker recommended) or embedded PG on Windows via `npm run db:setup`

### 1. Clone & install

```bash
git clone https://github.com/israahamed765/Smart-Profits.git
cd Smart-Profits
npm install
```

### 2. Environment

```bash
cp .env.example .env
# Edit .env — see Environment variables below
```

Never commit `.env`. Secrets stay server-side only (`NAC_API_KEY`, `SESSION_SECRET`, etc.).

### 3. Database (first run)

```bash
npm run db:setup
```

### 4. Run

```bash
npm run dev
```

Open **http://localhost:3000**

| Page | URL |
|------|-----|
| Register / Login | `/register` · `/login` |
| Merchant dashboard | `/dashboard` |
| Admin portal | `/admin` (uses `ADMIN_EMAIL` / `ADMIN_PASSWORD`) |

---

## Test credentials (Nokia sandbox MSISDNs)

Use these **official Nokia Network-as-Code test numbers** — no real SIM required.

| MSISDN | Expected Smart Guard behaviour | Demo action |
|--------|----------------------------------|-------------|
| **`99999991001`** or `+99999991001` | **Allow** (clean SIM/device) | Register → step-up code (if live NV) → upload Excel → advisor Q&A |
| **`99999991000`** | **Freeze** (SIM/device swap) | Register/login → account frozen · upload blocked |
| **`99999991002`** | **Step-up** (location PARTIAL) | Upload financial file → network verification code |
| **`99999991003`** | Location unknown (live API only) | Step-up path |

**Email:** use a **new address** each demo run (e.g. `judge.demo+1@gmail.com`).  
**Password:** minimum 6 characters.

**Step-up code:** in development, a 6-digit code appears in the **yellow demo inbox** on the Smart Guard overlay — it is generated locally for hackathon demos, not SMS.

With `NAC_API_KEY` set, the app calls **live Nokia RapidAPI**. Terminal shows:

```text
[nac-live] nacMode=live provider=Nokia transport=RapidAPI api=sim-swap status=200 ...
[nac-live] api=number-verification status=401 outcome=auth  → step-up (not fake success)
```

Full judge walkthrough: [`docs/hackathon/HACKATHON.md`](docs/hackathon/HACKATHON.md)

---

## Architecture

Smart Guard is a **separate decision engine** — not UI glue. Policy is pure; Nokia I/O is adapter-only.

```
┌─────────────────────────────────────────────────────────────┐
│  Merchant UI (Next.js) · AR + EN · Dashboard · Upload       │
└───────────────────────────┬─────────────────────────────────┘
                            │ sensitive actions
┌───────────────────────────▼─────────────────────────────────┐
│  API routes · auth · workspace · enforce.ts (fail-closed)     │
└─────────────┬───────────────────────────────┬─────────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────┐
│  Financial engine         │     │  Smart Guard AI Agent       │
│  parse · P&L · advisor    │     │  policy.ts → Allow/Step/Freeze │
└─────────────────────────┘     └──────────────┬──────────────┘
                                                 │
                              ┌──────────────────▼──────────────┐
                              │  nokia-adapter.ts (live/mock)   │
                              │  nac-live-mapper.ts             │
                              └──────────────────┬──────────────┘
                                                 │
                              ┌──────────────────▼──────────────┐
                              │  Nokia Network-as-Code (RapidAPI) │
                              │  GSMA CAMARA · 4G/5G networks     │
                              └─────────────────────────────────┘
```

**Design rules (for reviewers):**

- `lib/smart-guard/policy.ts` — **pure policy** (no HTTP, no secrets)
- `server/smart-guard/nokia-adapter.ts` — live RapidAPI + structured audit logs
- Provider failures ≠ business rejection (distinct messages in `enforce.ts`)
- No hardcoded Nokia outcomes in policy — mapped from API responses

---

## CAMARA API coverage

| CAMARA API | Trigger | Agent outcome |
|------------|---------|---------------|
| **SIM Swap** | Login, register, reset, sensitive settings | Recent swap → **Freeze** |
| **Number Verification** | Login, step-up | Silent 4G/5G check; 401 on live → **Step-up** |
| **Location Verification** | Excel/CSV/PDF upload, export | Geofence mismatch → **Step-up** or block |
| **Device Swap** | Same as SIM | Recent device change → **Freeze** |

Live passthrough paths (examples):

- `/passthrough/camara/v1/sim-swap/sim-swap/v0/check`
- `/passthrough/camara/v1/number-verification/number-verification/v0/verify`
- `/location-verification/v1/verify`

Local simulator catalog: `POST /api/nac/mock/gate` (demo routes only; Smart Guard uses `nac-client.ts` routing).

---

## Business value & impact

**Problem:** MENA merchants run the business from Excel. Phantom profit hides real cash flow. SIM swap defeats SMS OTP — then attackers own P&L files, prices, and exports.

**Solution:** CFO-grade analytics **on the same login** protected by telco-grade CAMARA signals — the way banks use Open Gateway, applied to SME books.

**Why Theme 4:** FinTech anti-fraud on the files that *are* the business, not slide-only API integration.

**Operator angle:** Every secured login, upload, and export consumes CAMARA API value (future B2B2X).

---

## Project structure

```
smart-profit/
├── app/                    # Next.js App Router (pages + /api BFF)
├── frontend/               # React UI, contexts, i18n, admin
├── backend/src/http/       # Standalone API handlers (also proxied from app/api)
├── server/
│   ├── smart-guard/        # ★ Agent stack: enforce, camara, nokia-adapter, run
│   ├── services/           # auth, guard, admin, nac
│   └── repositories/       # PostgreSQL persistence
├── lib/smart-guard/        # ★ Pure policy + shared types
├── shared/contracts/       # nac-provider contract, validation
├── tests/                  # 40+ test suites (policy, guard, nac, auth, architecture)
└── docs/hackathon/         # Pitch deck, judge guide, idea capture
```

---

## Environment variables

Copy `.env.example` → `.env`. **Never commit real keys.**

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `SESSION_SECRET` | Yes | Merchant session cookies |
| `NAC_API_KEY` | For live Nokia | RapidAPI key → live CAMARA calls |
| `NAC_BASE_URL` | No | Default Nokia RapidAPI base |
| `NAC_RAPIDAPI_HOST` | No | RapidAPI host header |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Yes | Admin portal |
| `FRONTEND_ORIGIN` | Yes | CSRF + CORS (e.g. `http://localhost:3000`) |
| `MAIL_*` | No | Password reset emails |

**Modes:**

- `NAC_API_KEY` **set** → Smart Guard uses **live Nokia** (`nacMode=live`)
- `NAC_API_KEY` **empty** → local **simulator** only

---

## Testing & quality

```bash
npm test          # Full test suite (policy, guard, nac, auth, architecture boundaries)
npm run lint      # ESLint
npm run build     # Production build check
```

**Key test files for judges:**

| File | What it proves |
|------|----------------|
| `tests/smart-guard-policy.test.ts` | Allow / Step-up / Freeze policy |
| `tests/nac-provider.test.ts` | Live mapper; 401 → step-up not fake success |
| `tests/backend-guard.test.ts` | Server fail-closed enforcement |
| `tests/architecture-boundary.test.ts` | No secrets in client bundle |

---

## Security notes

- API keys and session secrets are **server-only** (never `NEXT_PUBLIC_*`)
- Passwords stored with **scrypt** (`server/crypto/password.ts`)
- Smart Guard **blocks** sensitive routes until `decision=allow` (`enforce.ts`)
- CSRF same-origin on mutating API routes
- `.gitignore` excludes `.env`, local `data/`, credentials

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind · RTL Arabic + English |
| Backend | Next.js API routes + optional standalone backend |
| Database | PostgreSQL |
| Financial parsing | xlsx · papaparse · unpdf · tesseract.js |
| Network security | Nokia Network-as-Code · GSMA CAMARA via RapidAPI |
| Validation | Zod |

---

## Scripts reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run db:setup` | Docker Postgres + migrations |
| `npm test` | Run all tests |
| `npm run backend` | Standalone backend (optional) |

---

## Documentation index

| Document | Audience |
|----------|----------|
| [`docs/hackathon/HACKATHON.md`](docs/hackathon/HACKATHON.md) | **Judges** — 3-min demo script + logs |
| [`docs/hackathon/PRESENTATION-GUIDE.md`](docs/hackathon/PRESENTATION-GUIDE.md) | Presenters — slide map |
| [`docs/hackathon/IDEA-CAPTURE-TEMPLATE.md`](docs/hackathon/IDEA-CAPTURE-TEMPLATE.md) | Phase 1 submission |
| [`.env.example`](.env.example) | Environment template |

---

## Team & contact

| Role | Name |
|------|------|
| Founder / Product | **Israa Nael Hamad** — University of Palestine, Gaza |
| Engineering | **Mir Kashif** — Bitsandbytesdude Software Agency |

**Repository:** https://github.com/israahamed765/Smart-Profits  
**Studio:** https://bitsandbytesdude.vercel.app/

---

## License

Private / hackathon submission — © Smart Profits Team · Bitsandbytesdude · 2026

---

<p align="center">
  <strong>Smart Profits</strong> — Real merchant SaaS · Real AI Agent · Real CAMARA APIs via Nokia Network-as-Code
</p>
