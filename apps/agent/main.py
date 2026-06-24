"""
Excess CRM — LiveKit Python voice agent.

Parses room metadata ({personaId}:{callId}:{leadId}:{tenantId}), fetches the
active prompt from the CRM, and runs a Sarvam-STT / Groq-LLM / Sarvam-TTS
pipeline with all lead-management function tools.
"""

import asyncio
import logging
import os
import time
from datetime import datetime, timezone
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

# ── Environment ────────────────────────────────────────────────────────────────

CRM_API_URL: str = os.environ["CRM_API_URL"].rstrip("/")
AGENT_WEBHOOK_SECRET: str = os.environ["AGENT_WEBHOOK_SECRET"]

DEFAULT_SPEAKER = "anushka"  # Sarvam bulbul:v2 Tamil female voice (warm, natural)

# ── Default system prompt ──────────────────────────────────────────────────────

DEFAULT_PROMPT = (
    "You are Reshma, a solar sales agent at Excess Renew Solar, Coimbatore."
    " The company has 500+ installations across Tamil Nadu since 2009.\n\n"

    "LANGUAGE — CRITICAL FORMATTING RULE:\n"
    "You MUST write all Tamil words in TAMIL SCRIPT (தமிழ் எழுத்து), never in English letters.\n"
    "Keep common English/technical words in English (solar, panel, bill, warranty, subsidy, EB, kW).\n"
    "This is how Tamil people actually text — Tamil in Tamil script, English words inline.\n"
    "CORRECT: 'வணக்கம் sir! Solar panel-ல interest இருக்கா? Monthly bill எவ்வளவு வரும்?'\n"
    "CORRECT: 'நம்ம company 500 installations பண்ணி இருக்கோம். 25 year warranty இருக்கு.'\n"
    "WRONG (never do this): 'Vanakkam sir, naanu Reshma pesuren' — romanized Tamil is forbidden.\n"
    "Keep each sentence short — under 10 words. Warm, friendly, conversational.\n\n"

    "GREETING — use the customer name from the call brief:\n"
    "'வணக்கம்! நான் Reshma, Excess Renew Solar-ல இருந்து பேசுறேன். இப்போ 2 minutes பேசலாமா?'\n\n"

    "NEW LEADS — ask ONE question at a time, wait for the answer:\n"
    "Q1: 'உங்க property residential-ஆ, commercial-ஆ?'\n"
    "Q2: 'Monthly EB bill எவ்வளவு வரும்?'\n"
    "Q3: 'எந்த area-ல இருக்கீங்க?'\n"
    "→ Interested: call update_lead_stage QUALIFIED\n"
    "→ Callback: call schedule_follow_up\n"
    "→ Wrong number: call update_lead_stage WRONG_ENQUIRY\n\n"

    "QUALIFIED LEADS — present benefits simply:\n"
    "'3-4 years-ல full investment return ஆகிடும்.'\n"
    "'Government subsidy-உம் கிடைக்கும்.'\n"
    "'25 year panel warranty இருக்கு.'\n"
    "→ Site visit: call schedule_appointment\n"
    "→ Needs time: call schedule_follow_up\n\n"

    "FOLLOW-UP LEADS:\n"
    "'வணக்கம்! முன்னாடி பேசினோம் — இப்போ என்ன decision?'\n"
    "→ Interested: call update_lead_stage QUALIFIED\n"
    "→ More time: call reschedule_follow_up\n\n"

    "OBJECTIONS:\n"
    "Price: 'Free site visit பண்ணலாம் — no commitment.'\n"
    "Busy: 'Sure sir, எப்போ call பண்ணலாம்?'\n"
    "Not interested: 'Ok sir, no problem. Future-ல need ஆனா call பண்ணுங்க.'\n\n"

    "SOUND HUMAN — this is critical:\n"
    "Start most replies with a quick, natural acknowledgement before answering, like a real person:"
    " 'ம்', 'சரி சரி', 'ஆமா', 'அட நல்லது'.\n"
    "Vary your wording every time — never repeat the same sentence; never sound scripted or read-out.\n"
    "Short sentences with natural commas for small pauses. If you don't catch something, warmly ask"
    " them to repeat ('sorry sir, ஒரு thirumba சொல்லுங்க?').\n\n"

    "RULES: Always Tamil script for Tamil words. Never say tool/function names aloud."
    " One question at a time. Use the customer's name often."
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
        self, *, call_id: str, tenant_id: str, lead_id: str, instructions: str
    ) -> None:
        super().__init__(instructions=instructions)
        self._call_id = call_id
        self._tenant_id = tenant_id
        self._lead_id = lead_id

    async def on_enter(self) -> None:
        await self.session.generate_reply()

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
    try:
        lead_resp = await crm_post("getLeadInfo", call_id, tenant_id, lead_id)
        lead_data: dict[str, Any] = lead_resp.get("data") or {}
        if lead_data:
            name = lead_data.get("name") or "sir"
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
            lead_context = (
                f"\n\n[CALL BRIEF — do NOT read this aloud]\n"
                f"Customer: {name}{city_str} | Stage: {stage} ({stage_hint})\n"
                f"Start immediately with your warm Tanglish greeting using their name '{name}'."
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
        llm=groq.LLM(model="llama-3.3-70b-versatile"),
        tts=sarvam.TTS(
            target_language_code="ta-IN",   # native Tamil — correct pronunciation
            model="bulbul:v2",              # v2 is the working stable model
            speaker=speaker,                # Tamil voice character (anushka/vidya/etc)
            speech_sample_rate=22050,
            pace=1.0,                       # natural speaking speed
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
    )

    @ctx.room.on("participant_disconnected")
    def _on_disconnect(participant: rtc.RemoteParticipant) -> None:
        asyncio.ensure_future(
            _notify_call_ended(call_id, tenant_id, lead_id, call_start_ts)
        )

    await session.start(agent=agent, room=ctx.room)


async def _notify_call_ended(
    call_id: str,
    tenant_id: str,
    lead_id: str,
    call_start_ts: float,
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
            },
        )
        logger.info("callEnded call_id=%s duration_sec=%d", call_id, duration_sec)
    except Exception as exc:
        logger.error("callEnded POST failed call_id=%s error=%s", call_id, exc)


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    cli.run_app(server)
