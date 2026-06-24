# P2 — The AI Layer (scope & implementation plan)

Goal: make Excess CRM the one CRM that **tells reps what to do next and drafts it for them** — turning the existing AI plumbing into visible, daily-use intelligence.

> **Trust principle:** every AI output is a *suggestion a human reviews/edits*. No autonomous sends or stage changes. This keeps it fast to adopt and DPDP/TRAI-safe.

---

## What already exists (we build on this — don't rebuild)
| Capability | Where |
|---|---|
| `llmComplete(prompt, opts)` — Groq text AI, returns null if unconfigured | `apps/api/src/lib/llm.ts` |
| Lead summarization | `leads.ts` (`leads.summarize`) |
| AI broadcast copy generation | `broadcasts.ts` (`llmComplete`) |
| Call transcript analysis (`llmAnalysis`) + insights endpoint | voice-agent webhook, `calls/:id/insights` |
| Rule-based lead scoring (explainable factors) | `packages/shared/src/lead-scoring.ts` |

**So the model access, graceful config-gating, and call analysis are done.** P2 is mostly *surfacing + new endpoints*, not new infrastructure.

---

## The 5 AI features (prioritized)

### 1. ✨ AI Draft Reply (WhatsApp/email) — *flagship, fast*
One-click "Draft with AI" in the lead conversation composer → a contextual reply the rep edits and sends.
- **API:** `POST /leads/:id/draft-reply { channel }` → `llmComplete` with conversation history + lead context + brand tone.
- **UI:** a button on the WhatsApp/email composer in `lead-detail-view.tsx`.
- **Effort:** ~2 days · helper already exists.

### 2. 🧠 AI Next-Best-Action (per lead) — *highest strategic value*
For each lead, the single best next step (Call now / Send template X / Book survey / Send quote / Mark not-answered) + a one-line reason.
- **API:** `GET /leads/:id/next-action` → prompt from {stage, aiScore, factSheet, recent activities, days-in-stage, SLA status}; **cache in Redis** ~4h.
- **UI:** a chip on the lead row + a prominent card in lead detail.
- **Effort:** ~3 days.

### 3. 📞 AI Call Summary + Action Items — *quick win*
After every AI/voice call, a clean summary + sentiment + objections + next steps (the data is already captured in `llmAnalysis`).
- **Work:** refine the analysis prompt to emit `{summary, sentiment, intent, objections, nextSteps}`; surface it on the lead + calls pages.
- **Effort:** ~1–2 days (mostly UI + prompt).

### 4. 🌅 Daily AI Briefing ("Your Day")
A dashboard card (and optional morning WhatsApp): "3 hot leads to call, 2 follow-ups overdue, ₹X pipeline at risk," AI-phrased with suggested actions.
- **API:** `GET /ai/daily-brief` → aggregate (top scores, overdue SLA, stalled deals) → `llmComplete` to phrase; **cache per user/day**.
- **UI:** dashboard card; optional push via the existing notification/WhatsApp queues.
- **Effort:** ~2–3 days.

### 5. 📈 AI-Augmented Lead Scoring
Blend the explainable rule-based score with an LLM **intent** signal from notes/transcripts ("budget confirmed, ready to buy" → boost).
- **Work:** add an AI-intent factor in `lead-scoring.ts`; the `lead-score` worker calls `llmComplete` on text signals → merged adjustment (base stays explainable).
- **Effort:** ~2–3 days.

---

## Phased plan

| Phase | Ships | Why first |
|---|---|---|
| **A — Quick wins (week 1)** | #1 Draft Reply + #3 Call Summary | Build directly on existing helpers; visible value immediately |
| **B — The brain (week 2)** | #2 Next-Best-Action + #4 Daily Brief | The flagship differentiators; need A's patterns |
| **C — Depth (week 3)** | #5 AI scoring + prompt versioning + acceptance analytics | Compounding quality once usage data exists |

---

## Cross-cutting (do these alongside)
- **Cost/latency:** Groq (llama) is fast + cheap. Cache next-action & daily-brief; run scoring async in the worker, never on the request path.
- **Prompt management:** version prompts in `packages/voice-agent/prompts/`-style files (already the pattern for voice). Add an `ai/prompts/` set.
- **Guardrails:** AI = suggestion only; human edits before any send/transition. Log token/latency; track **acceptance rate** (did the rep use the draft/action) to tune prompts.
- **Config:** needs `GROQ_API_KEY` (cheap). Everything degrades gracefully without it — features simply hide.

## Definition of done
Each feature: endpoint + UI + cached/async as noted + prompt file + a live E2E added to the per-role suites (the CI gate already in place) + acceptance logging.

---

**Recommended start:** Phase A — **AI Draft Reply** first. It's ~2 days, rides on `llmComplete`, and is the single most-felt "wow, the CRM writes my messages" moment for daily users.
