"""
Excess CRM — LiveKit Python voice agent.

Parses room metadata ({personaId}:{callId}:{leadId}:{tenantId}), fetches the
active prompt from the CRM, and runs a Sarvam-STT / Groq-LLM / Sarvam-TTS
pipeline with all lead-management function tools.
"""

import asyncio
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    AutoSubscribe,
    JobContext,
    JobProcess,
    RunContext,
    cli,
)
from livekit.agents.llm import function_tool
from livekit.plugins import groq, sarvam, silero

logger = logging.getLogger("excess-crm-agent")
logger.setLevel(logging.INFO)

# Tool-call / chat-template artifacts the LLM sometimes leaks as text — stripped before TTS
# so the customer never hears them (e.g. "<function=schedule_appointment>{...}").
_LEAK_PATTERNS = (
    re.compile(r"</?\s*function\b[^>]*>\s*(?:\{[\s\S]*?\})?", re.IGNORECASE),  # <function=...>{...}
    re.compile(r"<\|[a-zA-Z0-9_]+\|>"),                                       # <|python_tag|>, <|eom_id|>
    re.compile(r"\{[^{}]*[:\"][^{}]*\}"),                                     # stray {"scheduled_at": ...}
    re.compile(r"\d{4}-\d{2}-\d{2}T[\d:.+\-]+"),                              # stray ISO datetimes
    re.compile(r"\b(?:scheduled_at|site_address|survey_type|ROOFTOP_\w+)\b"), # leaked arg names
)


def _strip_leaks(text: str) -> str:
    for rx in _LEAK_PATTERNS:
        text = rx.sub("", text)
    return text

# ── Environment ────────────────────────────────────────────────────────────────

CRM_API_URL: str = os.environ["CRM_API_URL"].rstrip("/")
AGENT_WEBHOOK_SECRET: str = os.environ["AGENT_WEBHOOK_SECRET"]

DEFAULT_SPEAKER = "anushka"  # Sarvam bulbul:v2 Tamil female voice (warm, natural)

# ── Default system prompt ──────────────────────────────────────────────────────

DEFAULT_PROMPT = (
    "You are Reshma (ரெஷ்மா), a warm solar sales agent at Excess Renew Solar, Coimbatore."
    " 500+ installations across Tamil Nadu since 2009.\n\n"

    "LANGUAGE — THIS CONTROLS PRONUNCIATION. FOLLOW EXACTLY:\n"
    "Write EVERY word in TAMIL SCRIPT (தமிழ் எழுத்து) — Tamil words, English/technical words,\n"
    "brand names, AND numbers. The voice engine MISPRONOUNCES any word written in English/Latin\n"
    "letters (it reads 'Solar' as 'olar', 'Reshma' wrong), so you MUST transliterate every\n"
    "English word into Tamil script. Use these spellings:\n"
    "  சோலார் (Solar), பேனல் (panel), கரண்ட் பில் (EB/current bill), சப்சிடி (subsidy),\n"
    "  வாரண்டி (warranty), ரெஷ்மா (Reshma), எக்செஸ் ரென்யூ சோலார் (Excess Renew Solar),\n"
    "  ரெண்டு நிமிஷம் (2 minutes), மூணு-நாலு வருஷம் (3-4 years), கமர்ஷியல் (commercial),\n"
    "  இன்டரஸ்ட் (interest), ஃப்ரீ சைட் விசிட் (free site visit).\n"
    "NEVER write a single Latin/English letter. Romanized Tamil ('Vanakkam') is also forbidden.\n"
    "CORRECT: 'வணக்கம் சார்! சோலார் பேனல்-ல இன்டரஸ்ட் இருக்கா? மாசம் கரண்ட் பில் எவ்வளவு வரும்?'\n\n"

    "SOUND LIKE A REAL PERSON — never a form reading out questions:\n"
    "Don't fire bare questions back-to-back. REACT to each answer first — repeat a detail back,\n"
    "show you heard them, add one warm line — THEN ask the next thing. Example, after they say it's\n"
    "a commercial property:\n"
    "  'அட, கமர்ஷியல் ப்ராபர்ட்டியா? அதுக்கு சோலார் ரொம்ப நல்லா செட் ஆகும் சார். மாசம் கரண்ட் பில் எவ்வளவு வரும்?'\n"
    "Open replies with a natural filler — 'ம்', 'சரி சரி', 'ஆமா', 'அட நல்லது' — and vary it every time.\n"
    "Short sentences, natural pauses. One question at a time, wait for the answer.\n\n"

    "GREETING (once, with the customer name from the brief):\n"
    "'வணக்கம்! நான் ரெஷ்மா, எக்செஸ் ரென்யூ சோலார்-ல இருந்து பேசுறேன். இப்போ ரெண்டு நிமிஷம் பேசலாமா?'\n\n"

    "NEW LEADS — qualify conversationally, react then ask, one question at a time:\n"
    "  'உங்க இடம் வீட்டுக்கா, இல்ல கடை/ஷாப்-ஆ?'\n"
    "  'ஒரு மாசத்துக்கு கரண்ட் பில் எவ்வளவு வரும் சார்?'\n"
    "  'எந்த ஏரியா-ல இருக்கீங்க?'\n"
    "→ Interested: call update_lead_stage QUALIFIED\n"
    "→ Callback: call schedule_follow_up\n"
    "→ Wrong number: call update_lead_stage WRONG_ENQUIRY\n\n"

    "QUALIFIED LEADS — present benefits warmly:\n"
    "'மூணு-நாலு வருஷத்துல முழு முதலீடும் திரும்பி வந்துடும் சார்.'\n"
    "'கவர்ன்மென்ட் சப்சிடி-உம் கிடைக்கும்.'\n"
    "'இருபத்தஞ்சு வருஷம் பேனல் வாரண்டி இருக்கு.'\n"
    "→ Site visit: call schedule_appointment\n"
    "→ Needs time: call schedule_follow_up\n\n"

    "FOLLOW-UP LEADS:\n"
    "'வணக்கம்! முன்னாடி நம்ம பேசினோம் — இப்போ என்ன முடிவு சார்?'\n\n"

    "OBJECTIONS (acknowledge first, all in Tamil script):\n"
    "Price: 'ஃப்ரீ சைட் விசிட் பண்ணலாம் சார் — எந்த கமிட்மென்ட்-உம் இல்ல.'\n"
    "Busy: 'சரி சார், எப்போ கால் பண்ணலாம்?'\n"
    "Not interested: 'ஓகே சார், பரவாயில்ல. அப்புறம் தேவைப்பட்டா கால் பண்ணுங்க.'\n\n"

    "RULES: EVERY word in Tamil script — no Latin letters, ever. Never say tool/function names aloud."
    " One question at a time. Use the customer's name. Warm, patient, never robotic."
)

# ── CRM HTTP helper ────────────────────────────────────────────────────────────


async def crm_post(
    action: str,
    call_id: str,
    tenant_id: str,
    lead_id: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """POST to the CRM agent-function endpoint and return the parsed response."""
    url = f"{CRM_API_URL}/voice-agent/agent-function"
    body: dict[str, Any] = {
        "callId": call_id,
        "tenantId": tenant_id,
        "leadId": lead_id,
        "action": action,
        "payload": payload or {},
    }
    headers = {
        "x-agent-secret": AGENT_WEBHOOK_SECRET,
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()  # type: ignore[return-value]


# ── Single unified agent ───────────────────────────────────────────────────────


class ExcessAgent(Agent):
    """Unified Excess Renew voice agent — handles verification, sales, and follow-up."""

    def __init__(
        self, *, call_id: str, tenant_id: str, lead_id: str, instructions: str,
        greeting_name: str = "sir",
    ) -> None:
        super().__init__(instructions=instructions)
        self._call_id = call_id
        self._tenant_id = tenant_id
        self._lead_id = lead_id
        self._greeting_name = greeting_name

    async def on_enter(self) -> None:
        # One-time opening greeting. The instruction is scoped to THIS reply only — it is
        # NOT part of the persistent system prompt, so the agent greets once and then
        # continues the conversation instead of re-greeting on every turn.
        await self.session.generate_reply(
            instructions=(
                f"Open the call now: greet {self._greeting_name} warmly in Tamil script, "
                "introduce yourself as Reshma from Excess Renew Solar, and ask if they "
                "have two minutes. This is the opening line — say it once, then stop."
            )
        )

    async def tts_node(self, text, model_settings):
        # Hard safety net: strip any tool-call syntax the model leaks as text (e.g.
        # "<function=schedule_appointment>{...}") BEFORE it is synthesized, so the customer
        # never hears function-call gibberish. Buffers a small tail so a tag split across
        # stream chunks is still caught. Pure string ops — never raises into the TTS pipeline.
        async def cleaned():
            buffer = ""
            async for chunk in text:
                buffer = _strip_leaks(buffer + chunk)
                lt = buffer.rfind("<")
                if lt == -1:
                    if buffer:
                        yield buffer
                    buffer = ""
                else:
                    # Possible start of a leaked tag — emit text before it, hold the rest.
                    if lt > 0:
                        yield buffer[:lt]
                    buffer = buffer[lt:]
            buffer = _strip_leaks(buffer)
            if buffer:
                yield buffer

        async for frame in super().tts_node(cleaned(), model_settings):
            yield frame

    # ── Lead info ──────────────────────────────────────────────────────────────

    @function_tool
    async def get_lead_info(self, run_ctx: RunContext) -> dict[str, Any]:
        """Fetch the lead's name, phone, city, current stage, and language from the CRM."""
        result = await crm_post(
            "getLeadInfo", self._call_id, self._tenant_id, self._lead_id
        )
        logger.info("get_lead_info lead=%s", self._lead_id)
        return result.get("data") or {}

    @function_tool
    async def get_product_info(self, run_ctx: RunContext, category: str) -> dict[str, Any]:
        """Retrieve solar product details for a category.

        Args:
            category: One of residential, commercial, industrial, offgrid.
        """
        result = await crm_post(
            "getProductInfo",
            self._call_id,
            self._tenant_id,
            self._lead_id,
            {"category": category},
        )
        logger.info("get_product_info category=%s lead=%s", category, self._lead_id)
        return result.get("data") or {}

    @function_tool
    async def search_knowledge(self, run_ctx: RunContext, query: str) -> dict[str, Any]:
        """Look up a real fact from the company knowledge base — subsidy rules, pricing,
        product specs, warranty, FAQs. Use this whenever the customer asks something you
        don't already know; answer ONLY from what it returns, never invent details.

        Args:
            query: What to look up, e.g. "PM Surya Ghar subsidy amount" or "panel warranty".
        """
        result = await crm_post(
            "searchKnowledge",
            self._call_id,
            self._tenant_id,
            self._lead_id,
            {"query": query},
        )
        logger.info("search_knowledge query=%s lead=%s", query, self._lead_id)
        return result.get("data") or {"results": []}

    @function_tool
    async def get_follow_up_context(self, run_ctx: RunContext) -> dict[str, Any]:
        """Retrieve the lead's previous call history and recent activity for context."""
        result = await crm_post(
            "getFollowUpContext", self._call_id, self._tenant_id, self._lead_id
        )
        logger.info("get_follow_up_context lead=%s", self._lead_id)
        return result.get("data") or {}

    # ── Stage transitions ──────────────────────────────────────────────────────

    @function_tool
    async def update_lead_stage(
        self,
        run_ctx: RunContext,
        stage: str,
        scheduled_at: str | None = None,
    ) -> str:
        """Update the lead's pipeline stage in the CRM.

        Args:
            stage: New stage — one of QUALIFIED, NOT_ANSWERED, INVALID, WRONG_ENQUIRY, FOLLOW_UP.
            scheduled_at: ISO-8601 datetime for follow-up scheduling (required when stage is FOLLOW_UP).
        """
        payload: dict[str, Any] = {"stage": stage}
        if scheduled_at:
            payload["scheduledAt"] = scheduled_at
        result = await crm_post(
            "updateLeadStage", self._call_id, self._tenant_id, self._lead_id, payload
        )
        logger.info("update_lead_stage stage=%s lead=%s", stage, self._lead_id)
        return result.get("message", "ok")

    @function_tool
    async def update_conversion_status(self, run_ctx: RunContext, status: str) -> str:
        """Record the final outcome of a follow-up call.

        Args:
            status: One of CONVERTED, INVALID, RESCHEDULED.
        """
        result = await crm_post(
            "updateConversionStatus",
            self._call_id,
            self._tenant_id,
            self._lead_id,
            {"status": status},
        )
        logger.info("update_conversion_status status=%s lead=%s", status, self._lead_id)
        return result.get("message", "ok")

    # ── Scheduling ─────────────────────────────────────────────────────────────

    @function_tool
    async def schedule_follow_up(self, run_ctx: RunContext, scheduled_at: str) -> str:
        """Schedule a follow-up call for a time the customer has agreed to.

        Args:
            scheduled_at: ISO-8601 datetime when the follow-up should occur,
                e.g. 2026-05-30T15:00:00+05:30.
        """
        result = await crm_post(
            "scheduleFollowUp",
            self._call_id,
            self._tenant_id,
            self._lead_id,
            {"scheduledAt": scheduled_at},
        )
        logger.info("schedule_follow_up scheduledAt=%s lead=%s", scheduled_at, self._lead_id)
        return result.get("message", "ok")

    @function_tool
    async def reschedule_follow_up(self, run_ctx: RunContext, scheduled_at: str) -> str:
        """Reschedule a follow-up to a new time agreed with the customer.

        Args:
            scheduled_at: ISO-8601 datetime for the rescheduled follow-up.
        """
        result = await crm_post(
            "rescheduleFollowUp",
            self._call_id,
            self._tenant_id,
            self._lead_id,
            {"scheduledAt": scheduled_at},
        )
        logger.info("reschedule_follow_up scheduledAt=%s lead=%s", scheduled_at, self._lead_id)
        return result.get("message", "ok")

    @function_tool
    async def schedule_appointment(
        self,
        run_ctx: RunContext,
        scheduled_at: str,
        site_address: str,
        survey_type: str,
    ) -> dict[str, Any]:
        """Book a site survey appointment for the lead.

        Args:
            scheduled_at: ISO-8601 datetime for the site visit.
            site_address: Full address where the survey will take place.
            survey_type: One of ROOFTOP_RESIDENTIAL, COMMERCIAL, INDUSTRIAL, OFFGRID.
        """
        result = await crm_post(
            "scheduleAppointment",
            self._call_id,
            self._tenant_id,
            self._lead_id,
            {
                "scheduledAt": scheduled_at,
                "siteAddress": site_address,
                "surveyType": survey_type,
            },
        )
        logger.info("schedule_appointment scheduledAt=%s lead=%s", scheduled_at, self._lead_id)
        return result.get("data") or {}

    @function_tool
    async def mark_do_not_contact(self, run_ctx: RunContext) -> str:
        """Call this when the customer asks to never be called again, to remove their
        number, or to stop all calls. Adds them to the do-not-call list and ends contact.
        Always acknowledge warmly first, then call this, then close the call politely."""
        result = await crm_post(
            "optOut",
            self._call_id,
            self._tenant_id,
            self._lead_id,
        )
        logger.info("mark_do_not_contact lead=%s", self._lead_id)
        return result.get("message", "ok")


# ── Server setup & prewarm ─────────────────────────────────────────────────────


def _prewarm(proc: JobProcess) -> None:
    """Pre-load the Silero VAD model into process userdata before the first job."""
    proc.userdata["vad"] = silero.VAD.load()
    logger.info("prewarm: silero VAD loaded")


server = AgentServer()
server.setup_fnc = _prewarm


# ── Entrypoint ─────────────────────────────────────────────────────────────────


@server.rtc_session()
async def entrypoint(ctx: JobContext) -> None:
    """Called once per inbound LiveKit job.  Parses room metadata, fetches the
    active CRM config, and starts the voice pipeline."""
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Parse room metadata: {personaId}:{callId}:{leadId}:{tenantId}
    metadata: str = ctx.room.metadata or ""
    parts = metadata.split(":", 3)
    if len(parts) != 4:
        logger.error(
            "room.metadata malformed, expected 4 colon-separated parts, got: %r", metadata
        )
        return

    persona_id, call_id, lead_id, tenant_id = parts
    call_start_ts = time.monotonic()

    logger.info(
        "session_start persona=%s call_id=%s lead_id=%s tenant_id=%s",
        persona_id,
        call_id,
        lead_id,
        tenant_id,
    )

    system_prompt = DEFAULT_PROMPT
    speaker = DEFAULT_SPEAKER

    # Sarvam bulbul:v2 valid speakers — used to validate the configured voice
    valid_speakers = {"anushka", "manisha", "vidya", "arya", "abhilash", "karun", "hitesh"}

    try:
        config_resp = await crm_post("getActiveConfig", call_id, tenant_id, lead_id)
        config_data: dict[str, Any] | None = config_resp.get("data")
        if config_data:
            system_prompt = config_data.get("systemPrompt") or system_prompt
            vc: dict[str, Any] = config_data.get("voiceConfig") or {}
            # voiceId field carries the Sarvam speaker name; fall back if not a valid v2 speaker
            cfg_voice = vc.get("voiceId")
            if cfg_voice in valid_speakers:
                speaker = cfg_voice
            logger.info(
                "active_config_loaded persona=%s version=%s",
                persona_id,
                config_data.get("version"),
            )
    except Exception as exc:
        logger.warning(
            "getActiveConfig failed, using defaults — persona=%s error=%s",
            persona_id,
            exc,
        )

    # Pre-fetch lead info so the first greeting is personalised
    lead_context = ""
    greeting_name = "sir"
    try:
        lead_resp = await crm_post("getLeadInfo", call_id, tenant_id, lead_id)
        lead_data: dict[str, Any] = lead_resp.get("data") or {}
        if lead_data:
            name = lead_data.get("name") or "sir"
            greeting_name = name
            stage = lead_data.get("stage") or "NEW"
            city = lead_data.get("city") or ""
            city_str = f" ({city})" if city else ""
            stage_map = {
                "NEW": "new enquiry — verify and qualify",
                "QUALIFIED": "already qualified — focus on sales conversion",
                "FOLLOW_UP": "follow-up — re-engage, check interest",
                "NOT_ANSWERED": "not answered before — try again warmly",
            }
            stage_hint = stage_map.get(stage, "new enquiry")
            # Context only — the greeting itself is issued once in on_enter, NOT here, so it
            # never leaks into the persistent prompt and gets repeated every turn.
            now_ist = datetime.now(timezone(timedelta(hours=5, minutes=30)))
            now_str = now_ist.strftime("%A, %d %B %Y, %I:%M %p IST")
            lead_context = (
                f"\n\n[CALL BRIEF — do NOT read this aloud]\n"
                f"Current date & time: {now_str}. Work out 'நாளைக்கு' (tomorrow) / "
                f"'இந்த சனிக்கிழமை' (this Saturday) from THIS — never invent a date. Only book a "
                f"site survey AFTER the customer names a specific day, and confirm their address "
                f"out loud before booking.\n"
                f"Customer: {name}{city_str} | Stage: {stage} ({stage_hint})\n"
                "Greet the customer only ONCE at the very start. After that, never repeat the "
                "greeting or re-introduce yourself — respond to what they say and move the "
                "conversation forward."
            )
            logger.info("lead_context_prefetched lead=%s stage=%s", lead_id, stage)
    except Exception as exc:
        logger.warning("lead prefetch failed lead=%s error=%s", lead_id, exc)

    system_prompt = system_prompt + lead_context

    vad: silero.VAD = ctx.proc.userdata["vad"]
    session = AgentSession(
        stt=sarvam.STT(
            language="ta-IN",
            model="saaras:v3",
            mode="transcribe",
            sample_rate=16000,
            high_vad_sensitivity=False,  # less aggressive — catches full sentences
            flush_signal=True,           # faster STT finalization
        ),
        # Model is env-configurable so you can A/B without a code change — set AGENT_LLM_MODEL
        # in the agent env and restart. llama-3.3-70b rambles, leaks its English reasoning, and
        # writes formal/literary Tamil; try a stronger Groq model (e.g. moonshotai/kimi-k2-instruct,
        # qwen/qwen3-32b) for cleaner colloquial Tamil + tool-calling.
        llm=groq.LLM(model=os.environ.get("AGENT_LLM_MODEL", "llama-3.3-70b-versatile")),
        tts=sarvam.TTS(
            target_language_code="ta-IN",   # native Tamil — correct pronunciation
            model="bulbul:v2",              # v2 is the working stable model
            speaker=speaker,                # Tamil voice character (anushka/vidya/etc)
            speech_sample_rate=22050,
            pace=0.92,                      # slightly slower — reads cleaner on mixed Tamil+English
            enable_preprocessing=True,      # normalises mixed Tamil+English text
        ),
        vad=vad,
        min_endpointing_delay=0.3,       # react faster when customer stops speaking
        max_endpointing_delay=1.5,       # don't wait too long for silence
        allow_interruptions=True,        # let the customer barge in — humans interrupt each other
        min_interruption_duration=0.4,   # ignore tiny throat-clears; react to real speech
        preemptive_generation=True,      # start composing the reply before they fully stop → natural, low-latency turn-taking
    )

    agent = ExcessAgent(
        call_id=call_id,
        tenant_id=tenant_id,
        lead_id=lead_id,
        instructions=system_prompt,
        greeting_name=greeting_name,
    )

    @ctx.room.on("participant_disconnected")
    def _on_disconnect(participant: rtc.RemoteParticipant) -> None:
        transcript = _extract_transcript(session)
        asyncio.ensure_future(
            _notify_call_ended(call_id, tenant_id, lead_id, call_start_ts, transcript)
        )

    await session.start(agent=agent, room=ctx.room)


def _extract_transcript(session: AgentSession) -> str:
    """Serialise the conversation history to 'Agent: …/Customer: …' lines. Defensive —
    returns '' on any API shape mismatch so callEnded still fires."""
    try:
        lines: list[str] = []
        for item in session.history.items:
            role = getattr(item, "role", None)
            if role not in ("user", "assistant"):
                continue
            text = getattr(item, "text_content", None)
            if callable(text):
                text = text()
            if not text:
                content = getattr(item, "content", None)
                if isinstance(content, list):
                    text = " ".join(str(c) for c in content if isinstance(c, str))
                else:
                    text = str(content) if content else ""
            text = (text or "").strip()
            if text:
                lines.append(f"{'Agent' if role == 'assistant' else 'Customer'}: {text}")
        return "\n".join(lines)
    except Exception as exc:  # noqa: BLE001
        logger.warning("transcript extraction failed: %s", exc)
        return ""


async def _notify_call_ended(
    call_id: str,
    tenant_id: str,
    lead_id: str,
    call_start_ts: float,
    transcript: str = "",
) -> None:
    """POST callEnded to the CRM after the participant hangs up."""
    duration_sec = round(time.monotonic() - call_start_ts)
    try:
        await crm_post(
            "callEnded",
            call_id,
            tenant_id,
            lead_id,
            {
                "endedAt": datetime.now(timezone.utc).isoformat(),
                "durationSec": duration_sec,
                "endReason": "participant_disconnected",
                "transcript": transcript,
            },
        )
        logger.info(
            "callEnded call_id=%s duration_sec=%d transcript_chars=%d",
            call_id,
            duration_sec,
            len(transcript),
        )
    except Exception as exc:
        logger.error("callEnded POST failed call_id=%s error=%s", call_id, exc)


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    cli.run_app(server)
