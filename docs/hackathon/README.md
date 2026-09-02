# Smart Profits — Phase 1 Hackathon Submission

**Event:** GSMA MENA Ignite Open Gateway Hackathon (Nokia Network-as-Code + CAMARA APIs)  
**Phase:** Idea Submission (deadline 23 August 2026)  
**Theme:** Theme 4 — Secure FinTech, Payments & Anti-Fraud Innovation

## Files in this folder

| File | Use |
|------|-----|
| **`HACKATHON.md`** | **Judge quick-start** — demo script, MSISDNs, `[nac-live]` logs |
| **`Smart-Profits-HACKATHON-PITCH-DECK.pptx`** | **Main pitch — 18 slides, submit/present this** |
| `PRESENTATION-GUIDE.md` | Slide map + 5–7 min script + judge checklist |
| `Smart-Profits-IDEA-CAPTURE-TEMPLATE-EN.docx` | Idea Capture — English Word file |
| `Smart-Profits-PITCH-DECK.pptx` | Legacy 10-slide version |
| `PITCH-DECK.html` | Browser version (Ctrl+P → PDF) |
| `IDEA-CAPTURE-TEMPLATE.md` | Markdown draft of the idea |

Regenerate the PowerPoint:

```bash
python docs/hackathon/build_pitch_pptx.py
```

## How to export PDF

1. Open the HTML file in Chrome / Edge.
2. `Ctrl + P` → Destination: **Save as PDF**.
3. Enable **Background graphics**.
4. For the pitch deck, set margins to **None** and paper to **Landscape**.

## Do not change product code for this submission

These documents describe the platform as a telco-secured FinTech product that already uses:

1. **GSMA CAMARA APIs** via **Nokia Network-as-Code**
2. An **AI Agent layer** that orchestrates those APIs and takes security decisions
