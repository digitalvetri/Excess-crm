# Voice Agent — Phase 0 setup (LiveKit + Sarvam, from scratch)

Goal: get the agent **actually placing human-sounding calls**. This is config + telephony — do it once, in order. Code is already done.

> Cost reality: this needs paid accounts (LiveKit, Sarvam, a telephony provider) and **India DLT registration**. There's no code-only shortcut — automated outbound voice in India is regulated.

---

## Step 1 — Accounts & API keys (~1 hour)
| Service | What you get | Env var |
|---|---|---|
| **LiveKit Cloud** (livekit.io — easiest; or self-host the included `docker-compose.livekit.yml`) | project URL + key/secret | `LIVEKIT_URL` (wss://…), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| **Sarvam AI** (sarvam.ai) | API key for STT (saaras) + TTS (bulbul) | `SARVAM_API_KEY` |
| **Groq** | ✅ already have it (you set it for the text AI) | `GROQ_API_KEY` |
| generate yourself | a random 16+ char string | `AGENT_WEBHOOK_SECRET` (same value on API **and** agent) |

Then set `ENABLE_LIVEKIT=true`.

## Step 2 — Telephony / SIP trunk (the real work, ~half a day + provider approval)
LiveKit dials phones through a **SIP trunk** to a provider that supports **India outbound**. Pick one:
- **Plivo** (India-friendly, straightforward SIP trunking) — recommended for India.
- **Twilio** Elastic SIP Trunking (needs India "regulatory bundle").
- **Telnyx** (SIP trunking, India coverage).

From the provider you need: an **outbound SIP trunk** (host + credentials) and a **caller-ID phone number (DID)**.

Then register it with LiveKit (LiveKit dashboard or `lk sip` CLI) as an **outbound trunk** → it gives you a **trunk ID** → set `LIVEKIT_SIP_TRUNK_ID`. Set the DID as the caller ID.

## Step 3 — India DLT / TRAI compliance (do this in parallel — it has lead time)
Automated outbound voice in India legally requires:
- **DLT registration** (via an operator portal — Jio/Airtel/Vi) for your entity + caller ID.
- Respect **TRAI calling hours** (the app already enforces 09:00–21:00 IST) and **DND scrubbing** (already gated in code).
- A **consent/disclosure** line at call start (Phase 2 will add this to the script).
> Skipping this risks number blocking + penalties. Start it early — approvals take days.

## Step 4 — Deploy the Python agent (~30 min)
`apps/agent` must run as a **long-lived LiveKit worker** (its Dockerfile runs `python main.py start`). On Coolify, add it as a new service with env:
`CRM_API_URL`, `AGENT_WEBHOOK_SECRET`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `SARVAM_API_KEY`, `GROQ_API_KEY`.
It connects to LiveKit and waits to be dispatched into call rooms.

## Step 5 — Set env on API + worker too
On the **api** and **worker** Coolify services set: `ENABLE_LIVEKIT=true`, `LIVEKIT_URL/API_KEY/API_SECRET`, `LIVEKIT_SIP_TRUNK_ID`, `SARVAM_API_KEY`, `GROQ_API_KEY`, `AGENT_WEBHOOK_SECRET`. (The worker creates the room + SIP participant; the agent joins it.)

## Step 6 — Test (Phase 1)
- Admin → Voice Agent → **test-dial** to your own number (or create a lead and let the pipeline dial).
- Watch the **worker logs**: `LiveKit room created` → `SIP participant created for <phone>` → your phone rings → "Reshma" speaks.
- Confirm: you hear the Tamil voice, it responds, a **call record** appears with status updating.
- If the phone never rings → the SIP trunk/DID (Step 2) is the issue. If it rings but no voice → the agent isn't deployed/connected (Step 4) or Sarvam key missing.

---

## The minimal env checklist (copy to verify)
```
ENABLE_LIVEKIT=true
LIVEKIT_URL=wss://<your-project>.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_SIP_TRUNK_ID=<from step 2>
SARVAM_API_KEY=...
GROQ_API_KEY=...            # already set
AGENT_WEBHOOK_SECRET=<16+ chars, same on api + agent>
```

## What I'll do in parallel (code — no telephony needed)
While you work Steps 1–3, I can ship **Phase 2 (human-voice tuning)** + **Phase 3 (conversation quality)** so it sounds great the moment telephony goes live:
- Per-sentence prosody, explicit barge-in/interruption tuning, backchannel fillers, lower latency.
- Wire **call recording → S3** for the LiveKit path (currently only the Vapi path records).
- Refine the 4 persona prompts + add the consent/disclosure opening line (Step 3 compliance).

Tell me to go and I'll start on the code while you set up the accounts.
