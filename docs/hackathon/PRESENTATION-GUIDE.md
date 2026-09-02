# Smart Profits — Hackathon Presentation Guide

## Main file (submit this)

**`Smart-Profits-HACKATHON-PITCH-DECK.pptx`** — 18 slides, 16:9, English, Theme 4.

Regenerate after edits:

```bash
python docs/hackathon/build_pitch_pptx.py
```

Optional screenshots (improves slide 10):

```bash
npm run dev
node docs/hackathon/capture_screens.mjs
python docs/hackathon/build_pitch_pptx.py
```

---

## Slide map (18 slides)

| # | Slide | Purpose for judges |
|---|--------|-------------------|
| 01 | Title | Theme 4 + both mandatory tags |
| 02 | Executive summary | 30-second scan + explicit requirements |
| 03 | Problem | Excel + fraud + Theme 4 gap |
| 04 | MENA market | Regional fit |
| 05 | Solution | Financial AI + Smart Guard |
| 06 | Mandatory requirements | **Critical scoring slide** |
| 07 | CAMARA APIs | What/when/decision + test MSISDNs |
| 08 | AI Agent | Sense→Query→Decide→Act + Allow/Step-up/Freeze |
| 09 | Architecture | Stack + GitHub link |
| 10 | Live evidence | Nokia logs + tests + demo numbers |
| 11 | Demo walkthrough | 3-minute script A/B/C |
| 12 | Screenshots | Product proof |
| 13 | Differentiation | vs generic Excel AI |
| 14 | Business model | SaaS + operator B2B2X |
| 15 | Impact | Why GSMA/Nokia care |
| 16 | Roadmap | Hackathon → MWC Doha |
| 17 | Team | Israa + Mir + Bitsandbytesdude |
| 18 | The Ask | Declaration + thank you |

---

## Recommended live pitch (5–7 minutes)

1. **Slide 02** (45s) — Problem + both mandatory requirements met.
2. **Slide 08** (60s) — Smart Guard is an agent, not a chatbot.
3. **Slide 11** (90s) — Live demo or video: 91001 allow → 91000 freeze → 91002 step-up.
4. **Slide 10** (30s) — Show terminal `[nac-live] provider=Nokia status=200`.
5. **Slide 13–15** (60s) — Differentiation + impact.
6. **Slide 18** (20s) — Close.

---

## Before presenting — checklist

- [ ] Replace `[deploy before submission]` on slide 11 with live URL
- [ ] Add screenshots to `docs/hackathon/screenshots/`
- [ ] Re-run `build_pitch_pptx.py`
- [ ] Test demo numbers: +99999991001, +99999991000, +99999991002
- [ ] Have GitHub open: https://github.com/BITSANDBYTESDUDE/Smart-Profits

---

## Judging criteria alignment

| Criterion | Slides |
|-----------|--------|
| CAMARA via Nokia NaC | 06, 07, 09, 10 |
| AI Agent orchestration | 06, 08 |
| Theme 4 FinTech anti-fraud | 03, 05, 11 |
| Technical depth | 09, 10 |
| MENA relevance | 04, 13, 17 |
| Commercial viability | 14, 16 |
| Working prototype | 10, 11, 12 |
