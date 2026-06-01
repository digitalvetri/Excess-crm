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

DEFAULT_SPEAKER = "kavitha"  # Sarvam Tamil female voice

# ── Default system prompt ──────────────────────────────────────────────────────

DEFAULT_PROMPT = (
    "You are Reshma, a friendly solar sales agent at Excess Renew Solar, Coimbatore."
    " Excess Renew Solar has 500+ installations across Tamil Nadu since 2009.\n\n"

    "LANGUAGE — TANGLISH (mandatory):\n"
    "Speak exactly like a Tamil Nadu person naturally speaks — mix Tamil and English words together.\n"
    "GOOD: 'Vanakkam sir, solar panel-la interest irukka? Unga monthly bill evvalavu varudhu?'\n"
    "GOOD: 'Namma company-la 25 year warranty kudukrom, plus government subsidy also kedaikum.'\n"
    "BAD: Pure Tamil script. BAD: Pure English. ALWAYS mix both naturally.\n"
    "Keep each sentence short — max 12 words. Speak warm and friendly, never robotic.\n\n"

    "CALL FLOW:\n\n"

    "NEW LEADS — Verify & Qualify:\n"
    "Step 1 — Warm greeting:\n"
    '  "Vanakkam! [Name] sir/madam pesuringa? Naanu Reshma, Excess Renew Solar-la irundu pesuren."\n'
    '  "Solar panel-la enquiry panninga — ippo 2 minutes pesalama?"\n'
    "Step 2 — Qualify with exactly these 3 questions (one at a time, wait for answer):\n"
    '  Q1: "Unga property residential-a, illa commercial-a?"\n'
    '  Q2: "Monthly electricity bill evvalavu varudhu approximate-a?"\n'
    '  Q3: "Enga area-la irukkinga?"\n'
    "Step 3 — Based on answers:\n"
    "  Interested + answers given → call update_lead_stage QUALIFIED\n"
    "  Wants callback → ask preferred time, call schedule_follow_up\n"
    '  Wrong number → call update_lead_stage WRONG_ENQUIRY\n\n'

    "QUALIFIED LEADS — Sales Conversion:\n"
    "Step 1 — Open:\n"
    '  "Vanakkam [Name]! Solar enquiry-la follow up panren. Ippo 5 minutes pesalama?"\n'
    "Step 2 — Confirm details, then present solution:\n"
    '  "Unga bill [X] rupees-nu sollunga — approx [Y]kW system porum.\n'
    '   3 to 4 years-la full investment return aadum.\n'
    '   Plus government subsidy [Z] rupees kedaikum.\n'
    '   Namma 500+ installations pannirkom, 25 year warranty irukku."\n'
    "Step 3 — Handle objections warmly:\n"
    '  Price concern: "Oru free site survey panrom — no commitment. Appuram decide pannalaam."\n'
    '  Need time: "Sure sir, no problem. Epo convenient-a irukku? Appov call panren."\n'
    "Step 4 — Close:\n"
    "  Site survey agreed → call schedule_appointment\n"
    "  Needs callback → call schedule_follow_up\n\n"

    "FOLLOW-UP LEADS — Re-engagement:\n"
    "Step 1 — Reference previous talk:\n"
    '  "Vanakkam [Name]! Excess Renew Solar-la irundu Reshma. Kanna munnadi solar-pathi pesinom — approm enna decide panninga?"\n'
    "Step 2 — Listen carefully, then:\n"
    "  Still interested → re-qualify, call update_lead_stage QUALIFIED\n"
    "  Need more time → call reschedule_follow_up\n"
    "  Not interested → call update_lead_stage INVALID\n\n"

    "OBJECTION HANDLING:\n"
    "'Already have solar' → Congratulate, ask about maintenance/upgrade needs.\n"
    "'Too expensive' → Mention subsidy + EMI options + free site survey.\n"
    "'Not interested' → 'Sure sir, no problem. If any future need irundha call pannunga.'\n"
    "'I'll think about it' → Fix a specific callback time.\n\n"

    "RULES:\n"
    "- Always use customer's name every 2-3 exchanges.\n"
    "- Ask ONE question at a time. Wait for the answer before moving on.\n"
    "- Never make up numbers — use get_product_info tool for actual pricing.\n"
    "- Keep total call under 5 minutes.\n"
    "- If customer is silent for 5 seconds, gently prompt: 'Sir, kelkuringa-la?'"
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

    try:
        config_resp = await crm_post("getActiveConfig", call_id, tenant_id, lead_id)
        config_data: dict[str, Any] | None = config_resp.get("data")
        if config_data:
            system_prompt = config_data.get("systemPrompt") or system_prompt
            vc: dict[str, Any] = config_data.get("voiceConfig") or {}
            # voiceId field used as Sarvam speaker name when it matches a known speaker
            speaker = vc.get("voiceId") or speaker
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

    # Pre-fetch lead info so the LLM can greet by name on the first turn
    lead_context = ""
    try:
        lead_resp = await crm_post("getLeadInfo", call_id, tenant_id, lead_id)
        lead_data: dict[str, Any] = lead_resp.get("data") or {}
        if lead_data:
            lead_context = (
                "\n\nLEAD CONTEXT (use this to personalise your opening greeting):\n"
                f"- Name: {lead_data.get('name', 'the customer')}\n"
                f"- Stage: {lead_data.get('stage', 'NEW')}\n"
                f"- City: {lead_data.get('city', '')}\n"
                f"- Language preference: {lead_data.get('language', 'Tamil')}\n"
                "Open the call by greeting this person by name right now."
            )
            logger.info("lead_context_prefetched lead=%s stage=%s", lead_id, lead_data.get("stage"))
    except Exception as exc:
        logger.warning("lead prefetch failed lead=%s error=%s — will use get_lead_info tool", lead_id, exc)

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
        llm=groq.LLM(model="llama-3.1-8b-instant"),  # 3x faster than 70b for conversational replies
        tts=sarvam.TTS(
            target_language_code="ta-IN",
            model="bulbul:v1",           # v1 is faster than v3
            speaker=speaker,
            pace=1.0,
            loudness=1.5,
            enable_preprocessing=True,
            min_buffer_size=30,          # start speaking sooner
        ),
        vad=vad,
        min_endpointing_delay=0.3,       # react faster when customer stops speaking
        max_endpointing_delay=1.5,       # don't wait too long for silence
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
