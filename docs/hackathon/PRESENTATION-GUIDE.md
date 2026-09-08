# Smart Profits — Hackathon Presentation Guide

## Main file (submit this)

**`Smart-Profits-HACKATHON-PITCH-DECK.pptx`** — 19 slides, 16:9, English, Theme 4.

Also copy to Desktop after regenerate if judges ask for that path.

Regenerate after edits:

```bash
python docs/hackathon/build_pitch_pptx.py
```

Optional screenshots (improves product slide):

```bash
npm run dev
node docs/hackathon/capture_screens.mjs
python docs/hackathon/build_pitch_pptx.py
```

---

## Pitch strategy (say this out loud)

### Open with the story (30–45s)

> “A merchant in the Middle East runs the business from Excel. Their phone line is hijacked through a SIM swap. The attacker opens the advisor, downloads the P&L, and changes product prices. **Smart Profits stops that — from registration until the latest financial upload.**”

Then go live: `91001` allow → `91000` freeze.

### Three talking points judges still need (the last 4–8 points)

1. **AI Agent ≠ plain if/else**  
   Soft network change + ordinary purchases → **Allow**.  
   Soft network change + sensitive P&L / price change → **Step-up**.  
   SIM swap → **Freeze**.  
   Say: *“We fuse CAMARA tools with financialSuspicion — file size, dump names, new account + large file.”*

2. **Silent Authentication / no friction**  
   Number Verification on 4G/5G in the background when clean.  
   Merchant does **not** wait for SMS every day.  
   Freeze only when SIM swap (or hard location) is real.

3. **Operator money (B2B2X)**  
   Every login, upload, export, price change = metered CAMARA API calls.  
   More active merchants = recurring Open Gateway revenue for the telco.

---

## Slide map (19 slides)

| # | Slide | Purpose for judges |
|---|--------|-------------------|
| 01 | Title | Theme 4 + both mandatory tags |
| 02 | **The Story** | Pitch opener — SIM swap hijacks Excel P&L |
| 03 | Executive summary | 30-second scan + mandatory requirements |
| 04 | Problem | Excel + fraud + Theme 4 gap |
| 05 | MENA market | Regional fit |
| 06 | Solution | Financial AI + Smart Guard + silent auth |
| 07 | Mandatory requirements | **Critical scoring slide** |
| 08 | CAMARA APIs | What/when/decision + **Silent Authentication** |
| 09 | AI Agent | Sense→Query→Decide→Act + **network × financial fusion** |
| 10 | Architecture | Stack + GitHub link |
| 11 | Live evidence | Nokia logs + tests + demo numbers |
| 12 | Demo walkthrough | 3-minute script A/B/C |
| 13 | Screenshots | Product proof |
| 14 | Differentiation | vs generic Excel AI |
| 15 | Business model | SaaS + **operator B2B2X API usage** |
| 16 | Impact | Why GSMA/Nokia care |
| 17 | Roadmap | Hackathon → MWC Doha |
| 18 | Team | Israa + Mir + Bitsandbytesdude |
| 19 | The Ask | Declaration + thank you |

---

## Recommended live pitch (5–7 minutes)

1. **Slide 02 — Story** (45s)
2. **Slide 09 — AI Agent fusion** (60s) — network × financial sensitivity
3. **Live demo** (90s) — `91001` allow → `91000` freeze → optional `91002` step-up
4. **Slide 08 — Silent Auth** (20s) — no SMS friction when clean
5. **Slide 15 — B2B2X** (40s) — every sensitive action = billable CAMARA usage
6. **Slide 11 — logs** (20s) — `[nac-live] provider=Nokia status=200`
7. **Slide 19 — Close** (20s)

---

## Before presenting — checklist

- [ ] Replace live demo URL placeholder if still empty
- [ ] Add screenshots to `docs/hackathon/screenshots/`
- [ ] Re-run `build_pitch_pptx.py`
- [ ] Test demo numbers: +99999991001, +99999991000, +99999991002
- [ ] Have GitHub open: https://github.com/israahamed765/Smart-Profits
- [ ] Postgres running before local demo (`npm run db:setup`)

---

## Judging criteria alignment

| Criterion | Slides |
|-----------|--------|
| CAMARA via Nokia NaC | 07, 08, 10, 11 |
| AI Agent orchestration | 07, 09 |
| Silent / frictionless security | 06, 08 |
| Theme 4 FinTech anti-fraud | 02, 04, 06, 12 |
| Operator commercial fit (B2B2X) | 15, 16 |
| Working prototype | 11, 12, 13 |
| MENA relevance | 02, 05, 14, 18 |
