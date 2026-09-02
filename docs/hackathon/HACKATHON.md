# Smart Profits — Judge & Reviewer Guide

**GSMA MENA Ignite · Theme 4 · Nokia Network-as-Code + Smart Guard AI Agent**

This document is for **hackathon judges, tech leads, and reviewers** who need to evaluate the project in under 5 minutes without reading the entire codebase.

---

## 1. What to verify first (30 seconds)

Open the repository README: [`../../README.md`](../../README.md)

Confirm both **mandatory requirements**:

| # | Requirement | Evidence |
|---|-------------|----------|
| A | GSMA CAMARA via Nokia Network-as-Code | `server/smart-guard/nokia-adapter.ts` + `[nac-live]` logs |
| B | AI Agent orchestrates APIs and decides | `lib/smart-guard/policy.ts` + `server/smart-guard/enforce.ts` |

---

## 2. Run locally (3 commands)

```bash
npm install
cp .env.example .env    # optional: add NAC_API_KEY for live Nokia
npm run db:setup && npm run dev
```

Open **http://localhost:3000/register**

---

## 3. Three-minute demo script

### Journey A — Clean merchant (Allow)

1. Register with:
   - Phone: **`99999991001`**
   - Email: `judge.demo.a@gmail.com` (any new email)
   - Password: `demo1234`
2. If Smart Guard overlay appears → enter **6-digit code** from yellow **demo inbox** box
3. Upload a sample Excel from `public/templates/`
4. Dashboard → health score, P&L, profit leaks
5. Advisor → ask *"What is my highest profit product?"*

**Expected:** Registration completes · analytics work · Smart Guard **Allow** or **Step-up then Allow**

---

### Journey B — SIM swap attack (Freeze)

1. Register or login with phone: **`99999991000`**
2. Use a **new email**

**Expected:**

- Smart Guard overlay shows **freeze** (SIM/device swap detected)
- Upload and sensitive actions **blocked**
- Message explains SMS OTP is not trusted after swap

---

### Journey C — Location mismatch (Step-up)

1. Register with phone: **`99999991002`**
2. Try to **upload a financial file**

**Expected:**

- **Step-up** required (location PARTIAL / soft mismatch)
- Network verification code in demo inbox (development mode)
- File upload blocked until step-up succeeds

---

## 4. Test MSISDN reference

| Number | Nokia sandbox behaviour | Smart Guard |
|--------|-------------------------|-------------|
| `+99999991001` | Clean SIM/device | Allow (may step-up if NV 401 on live) |
| `+99999991000` | Swap detected | **Freeze** |
| `+99999991002` | Location PARTIAL | **Step-up** on file upload |
| `+99999991003` | Location UNKNOWN | Step-up (live only) |

---

## 5. How to see live Nokia integration

### Option A — Terminal logs (recommended)

Set `NAC_API_KEY` in `.env` (RapidAPI Nokia key). Restart `npm run dev`.

Register or login → watch terminal:

```text
[nac-live] nacMode=live provider=Nokia transport=RapidAPI api=sim-swap ... status=200
[nac-live] nacMode=live provider=Nokia transport=RapidAPI api=device-swap ... status=200
[nac-live] nacMode=live provider=Nokia transport=RapidAPI api=number-verification ... status=401 outcome=auth
[smart-guard] Nokia Number Verification unavailable ... Step-up required — not treated as verified.
```

**Why 401 is correct:** Live Number Verification requires operator OAuth. The agent **does not fake success** — it routes to **Step-up** (hackathon-safe, fail-closed).

### Option B — Admin panel

1. Login to `/admin` with credentials from `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`)
2. Go to **Users** → table shows:
   - Phone number
   - **Smart Guard** status (Allow / Step-up / Freeze)
   - Last login · guard reason

### Option C — Automated tests

```bash
npm test -- tests/nac-provider.test.ts tests/smart-guard-policy.test.ts tests/backend-guard.test.ts
```

---

## 6. Architecture one-pager

```
Merchant action (login / upload / export)
        │
        ▼
server/smart-guard/enforce.ts  ← fail-closed (403/503 if not allow)
        │
        ▼
server/smart-guard/run.ts  ← gather CAMARA signals
        │
        ├── nokia-adapter.ts (live) OR nokia-mock.ts (simulator)
        │
        ▼
lib/smart-guard/policy.ts  ← pure Allow / Step-up / Freeze
        │
        ▼
UI: frontend/components/guard/smart-guard-overlay.tsx
```

**Important:** `policy.ts` is unchanged by design — Nokia results flow through `nac-live-mapper.ts`.

---

## 7. CAMARA endpoints used (live)

| API | Endpoint (passthrough) |
|-----|------------------------|
| SIM Swap check | `/passthrough/camara/v1/sim-swap/sim-swap/v0/check` |
| SIM Swap date | `/passthrough/camara/v1/sim-swap/sim-swap/v0/retrieve-date` |
| Device Swap check | `/passthrough/camara/v1/device-swap/device-swap/v1/check` |
| Device Swap date | `/passthrough/camara/v1/device-swap/device-swap/v1/retrieve-date` |
| Number Verification | `/passthrough/camara/v1/number-verification/number-verification/v0/verify` |
| Location Verification | `/location-verification/v1/verify` |

---

## 8. Files judges should skim

| Path | Why |
|------|-----|
| `lib/smart-guard/policy.ts` | Decision policy (Allow/Step-up/Freeze) |
| `server/smart-guard/enforce.ts` | Server blocking + provider error messages |
| `server/smart-guard/nokia-adapter.ts` | Live Nokia HTTP + `[nac-live]` logging |
| `server/smart-guard/nac-client.ts` | Live vs mock routing |
| `backend/src/http/auth-register.ts` | Guard before account creation |
| `tests/nac-provider.test.ts` | 401/404 → step-up, not fake allow |

---

## 9. Pitch materials

| File | Description |
|------|-------------|
| `Smart-Profits-HACKATHON-PITCH-DECK.pptx` | 18-slide deck |
| `PRESENTATION-GUIDE.md` | Presenter script |
| `IDEA-CAPTURE-TEMPLATE.md` | Written submission |

Regenerate deck: `python docs/hackathon/build_pitch_pptx.py`

---

## 10. Submission checklist (team)

- [ ] README links to **live demo URL**
- [ ] README links to **3-minute demo video**
- [ ] `.env` not committed · `.env.example` complete
- [ ] Pitch deck uploaded to HackerEarth / GSMA portal
- [ ] GitHub repo public and README renders correctly

---

## 11. FAQ for judges

**Q: Is Smart Guard just a chatbot?**  
A: No. It is a **policy engine + server enforcement** that calls CAMARA tools and returns Allow / Step-up / Freeze before sensitive actions proceed.

**Q: Why step-up on +99999991001 with live key?**  
A: Number Verification returns 401 without operator OAuth on RapidAPI. The agent step-ups instead of faking verification — see `camara.ts` and `[nac-live]` logs.

**Q: Where is Device Status API?**  
A: We use **Device Swap** (CAMARA) as the equivalent signal for device change detection.

**Q: Is `/api/nac/*` the production guard?**  
A: No. `/api/nac/*` is a **local simulator catalog** for demos. Production Smart Guard uses `nac-client.ts` → live or mock based on `NAC_API_KEY`.

---

<p align="center"><strong>Thank you for reviewing Smart Profits.</strong><br/>
Israa Nael Hamad · Mir Kashif · Bitsandbytesdude · University of Palestine, Gaza</p>
