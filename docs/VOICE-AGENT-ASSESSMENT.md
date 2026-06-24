# Voice Agent — working-state assessment & phased fix plan

## TL;DR
The voice agent **code is complete and well-architected** — in fact there are **two** full implementations. What's missing to "actually call and sound human" is almost entirely **configuration + telephony infra**, plus some **code-level voice tuning** I can do. Nothing here is a rewrite.

---

## 1. What's actually built

There are **two switchable pipelines**, selected by the `ENABLE_LIVEKIT` env flag (**default `false` → Vapi**):

### Path A — LiveKit + Sarvam (the modern, Tamil-first one)
`apps/agent/main.py` (Python, LiveKit Agents 1.5):
- **STT:** Sarvam `saaras:v3` (ta-IN) · **LLM:** Groq `llama-3.3-70b-versatile` · **TTS:** Sarvam `bulbul:v2`, voice **"anushka"** (warm Tamil female)
- **VAD:** Silero · endpointing tuned (0.3–1.5s) · persona **"Reshma"** speaking Tanglish **in Tamil script**
- Full function tools: `update_lead_stage`, `schedule_appointment`, `schedule_follow_up`, `get_lead_info`, `get_product_info`, etc. — the agent manages the lead live.
- Dialing: creates a LiveKit room → **SIP participant via `LIVEKIT_SIP_TRUNK_ID`** to call the phone.

### Path B — Vapi (the default, English-leaning)
`apps/worker/src/jobs/voice-dial.ts` builds an inline Vapi assistant from DB config (configurable STT/LLM/TTS; ElevenLabs voice IDs wired). Function-calls hit `/webhooks/vapi`. Admin **test-dial** + **test-payload** endpoints exist.

**Gates already implemented (both paths):** DND check, business-hours check, daily call cap, duplicate-call check, retry cadence. 4 personas (excess-agent, karthik-sales, reshma-verify, reshma-followup).

---

## 2. Working state — what's blocking real calls

The code runs; **calls don't happen until config is complete.** Every voice key is `optional()` and `LIVEKIT_SIP_TRUNK_ID` is optional — when unset, the LiveKit path *creates the room and logs "waiting for SIP trunk setup"* (no call placed).

| Blocker | Path | Type | Status to verify |
|---|---|---|---|
| `SARVAM_API_KEY`, `GROQ_API_KEY`, `LIVEKIT_API_KEY/SECRET`, `AGENT_WEBHOOK_SECRET` | LiveKit | config | Set in prod? |
| **Python agent deployed** as a LiveKit worker (`python main.py start`) | LiveKit | infra | Running on Coolify? |
| **SIP trunk + outbound DID + caller ID** (`LIVEKIT_SIP_TRUNK_ID`) | LiveKit | **telephony** | **Most likely missing** |
| `VAPI_API_KEY` + assistant/phone IDs | Vapi | config | Set if using Vapi |
| **India DLT / TRAI** registration for outbound voice | both | **regulatory** | Required to dial legally |
| Recording for the LiveKit path (egress) | LiveKit | code gap | Not wired in the agent |

**Bottom line:** the #1 thing standing between you and live calls is **telephony — a SIP trunk (LiveKit) or Vapi number — connected to a provider with India outbound + DLT compliance.** That's infra, not code.

---

## 3. Can it speak like a human voice?

**Yes — credibly, especially for Tamil.**
- **LiveKit path (Sarvam bulbul:v2 "anushka"):** a neural Tamil voice that's genuinely warm and natural for **Tamil/Tanglish** — *better than ElevenLabs for Tamil*, which is the right call for your Coimbatore customers. Latency is well-tuned (Groq is fast, endpointing 0.3s, Silero VAD), so turn-taking feels conversational.
- **Vapi path (ElevenLabs):** extremely human for **English**, weaker for Tamil.

**What stops it from being indistinguishable** (all fixable in code):
- bulbul:v2 prosody is a little flat — no pace/pitch/emphasis variation per sentence.
- No **backchanneling** ("ம்ம்", "சரி" while listening) — humans do this.
- **Interruptions/barge-in** rely on LiveKit defaults — not explicitly tuned.
- No natural **filler/pauses**; occasional robotic cadence on long sentences.
- STT on heavy code-mixed Tanglish can mis-hear — affects flow.

---

## 4. The phased fix plan

> **Legend:** 🔧 = code I can do · 🔌 = config/infra you (or your telephony provider) must do.

### Phase 0 — Make it dial (BLOCKER) 🔌
Decide the path (**recommend LiveKit + Sarvam** for Tamil quality), then:
1. Set the keys: `SARVAM_API_KEY`, `GROQ_API_KEY`, `LIVEKIT_API_KEY/SECRET`, `AGENT_WEBHOOK_SECRET`, `ENABLE_LIVEKIT=true`.
2. **Deploy the Python agent** (`apps/agent`) as a LiveKit worker on Coolify (its Dockerfile runs `python main.py start`).
3. **Set up the SIP trunk:** a telephony provider (Plivo/Twilio/Telnyx/Exotel) with **India outbound + a caller-ID DID**, register it as a LiveKit outbound trunk, set `LIVEKIT_SIP_TRUNK_ID`.
4. **DLT/TRAI registration** for outbound voice (legal requirement in India).
*Without Phase 0, nothing else matters — this is the gate.*

### Phase 1 — Verify end-to-end 🔧🔌
Fire a **test-dial** to your own number → confirm STT → Groq → TTS → tools (stage change, appointment) → recording → call-status update all fire. Fix any wiring bugs surfaced. (I can fix code bugs; you place the test call.)

### Phase 2 — Human-voice tuning 🔧
- Per-sentence **prosody** (Sarvam `pace`/`pitch`/`loudness`), emphasis on key words.
- Explicit **barge-in / interruption** config + min-interruption tuning so it stops when the customer talks.
- **Backchannel fillers** ("ம்ம்", "சரி") during listening; natural pauses.
- Tighter **endpointing** + **preemptive synthesis** for lower latency.
- **Wire recording** for the LiveKit path (egress → S3, per your rules) so every call is reviewable.

### Phase 3 — Conversation quality 🔧
- Refine the 4 persona prompts (shorter turns, better objection handling, silence/repeat handling, explicit Tamil/English **language detection & switching**, heavier name usage).
- Add a "didn't understand → politely re-ask" path; handle voicemail/IVR detection.

### Phase 4 — Reliability & observability 🔧
- Verify retry cadence, DND/business-hours/daily-cap gates end-to-end.
- Call **summary + sentiment + outcome** already exist (insights) — surface them on each call; alert on failures; dashboards for connect-rate / qualify-rate.

### Phase 5 — Compliance & scale 🔌🔧
- TRAI business hours (09:00–21:00 IST), DND scrub, **recording-consent disclosure** in the opening line, opt-out handling, daily cap, concurrency limits.

---

## 5. What I can do now vs. what needs you
- **I can implement Phases 2, 3, 4** (voice tuning, prompts, reliability, recording wiring) — all code, fully testable locally except the actual Meta/telephony round-trip.
- **You/your telephony provider must do Phase 0** (keys, agent deploy, SIP trunk + DID, DLT) — that's the real blocker, and it's infra, not code.
- **Phase 1** is joint: I fix bugs, you place the test call.

**Recommended order:** confirm Phase 0 is done (or tell me which path + what's set) → I do Phase 2 (make it sound human) → Phase 3 (conversation) → Phase 1 verify on a live test call → Phase 4/5 hardening.
