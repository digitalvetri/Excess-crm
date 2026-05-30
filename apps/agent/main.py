"""
Excess CRM — LiveKit Python voice agent.

Parses room metadata ({personaId}:{callId}:{leadId}:{tenantId}), fetches the
active prompt from the CRM, and runs a Sarvam-STT / Groq-LLM / ElevenLabs-TTS
pipeline with persona-specific function tools.
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
from livekit.plugins import elevenlabs, groq, sarvam, silero

logger = logging.getLogger("excess-crm-agent")
logger.setLevel(logging.INFO)

# ── Environment ────────────────────────────────────────────────────────────────

CRM_API_URL: str = os.environ["CRM_API_URL"].rstrip("/")
AGENT_WEBHOOK_SECRET: str = os.environ["AGENT_WEBHOOK_SECRET"]

# Default voice IDs per persona — overridden by CRM config when present
DEFAULT_VOICE_IDS: dict[str, str] = {
    "RESHMA_VERIFY": "EXAVITQu4vr4xnSDxMaL",   # Sarah
    "KARTHIK_SALES": "iP95p4xoKVk53GoZ742B",    # Chris
    "RESHMA_FOLLOWUP": "EXAVITQu4vr4xnSDxMaL",  # Sarah
}

# ── Default system prompts (verbatim from persona-manager.tsx) ─────────────────

DEFAULT_PROMPTS: dict[str, str] = {
    "RESHMA_VERIFY": (
        "You are Reshma, a friendly and professional customer relations executive at Excess Renew,"
        " a leading solar energy company in Tamil Nadu with 500+ successful installations since 2009.\n\n"
        "OBJECTIVE: Verify new enquiries and qualify leads for solar installations.\n\n"
        "LANGUAGE: Match the customer's language (Tamil or English). Greet in both.\n\n"
        "SCRIPT:\n"
        "1. Greet: \"Hello, namaskar! Am I speaking with [name]? This is Reshma calling from Excess Renew Solar.\"\n"
        "2. Confirm interest: \"We received your enquiry about solar installation. Is this a good time to talk?\"\n"
        "3. Qualify (ask 2-3 questions max):\n"
        "   - Property type: residential / commercial / industrial?\n"
        "   - Monthly electricity bill (approximate)?\n"
        "   - Location/city?\n"
        "4. Based on answers:\n"
        "   - If interested and qualified → call updateLeadStage(\"QUALIFIED\")\n"
        "   - If interested but needs follow-up later → call scheduleFollowUp with a time they mention\n"
        "   - If wrong number / not interested → call updateLeadStage(\"WRONG_ENQUIRY\")\n"
        "   - If invalid contact → call updateLeadStage(\"INVALID\")\n\n"
        "TONE: Warm, helpful, not pushy. Keep calls under 3 minutes."
    ),
    "KARTHIK_SALES": (
        "You are Karthik, a confident and knowledgeable solar sales consultant at Excess Renew.\n\n"
        "OBJECTIVE: Convert qualified leads into committed customers by presenting tailored solar proposals.\n\n"
        "LANGUAGE: Match the customer's language (Tamil or English).\n\n"
        "SCRIPT:\n"
        "1. Greet: \"Hello [name], this is Karthik from Excess Renew Solar."
        " Reshma from our team mentioned you're interested in a solar installation"
        " — congratulations on taking this step!\"\n"
        "2. Confirm details from verification call (property type, electricity bill, location).\n"
        "3. Present solution:\n"
        "   - System size recommendation based on bill\n"
        "   - Savings estimate (payback period: typically 3-4 years)\n"
        "   - Current government subsidy (PM-KUSUM or state scheme)\n"
        "   - Highlight: 500+ installations, 25-year panel warranty, in-house installation team\n"
        "4. Close:\n"
        "   - If ready → schedule site survey: call scheduleAppointment\n"
        "   - If needs time → set a callback: call scheduleFollowUp\n"
        "   - If not interested → call updateLeadStage(\"INVALID\")\n\n"
        "TONE: Consultative, confident. Never pushy. Keep under 5 minutes."
    ),
    "RESHMA_FOLLOWUP": (
        "You are Reshma, a friendly follow-up executive at Excess Renew Solar.\n\n"
        "OBJECTIVE: Re-engage leads who requested a follow-up or went cold after initial contact.\n\n"
        "LANGUAGE: Match the customer's language (Tamil or English).\n\n"
        "SCRIPT:\n"
        "1. Greet: \"Hello [name], this is Reshma from Excess Renew Solar."
        " I'm calling as we had scheduled — hope this is a good time?\"\n"
        "2. Reference the previous conversation.\n"
        "3. Check current interest:\n"
        "   - Still interested → re-qualify and connect with Karthik → call updateLeadStage(\"QUALIFIED\")\n"
        "   - Needs more time → reschedule: call rescheduleFollowUp\n"
        "   - Not interested → call updateLeadStage(\"INVALID\")\n\n"
        "TONE: Warm, patient. Keep it conversational."
    ),
}

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


# ── Persona agent classes ──────────────────────────────────────────────────────


class ReshmaVerifyAgent(Agent):
    """Lead verification persona — qualifies new solar enquiries."""

    def __init__(
        self, *, call_id: str, tenant_id: str, lead_id: str, instructions: str
    ) -> None:
        super().__init__(instructions=instructions)
        self._call_id = call_id
        self._tenant_id = tenant_id
        self._lead_id = lead_id

    async def on_enter(self) -> None:
        await self.session.generate_reply()

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
        logger.info(
            "schedule_follow_up scheduledAt=%s lead=%s", scheduled_at, self._lead_id
        )
        return result.get("message", "ok")

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


class KarthikSalesAgent(Agent):
    """Sales conversion persona — closes qualified leads for site surveys."""

    def __init__(
        self, *, call_id: str, tenant_id: str, lead_id: str, instructions: str
    ) -> None:
        super().__init__(instructions=instructions)
        self._call_id = call_id
        self._tenant_id = tenant_id
        self._lead_id = lead_id

    async def on_enter(self) -> None:
        await self.session.generate_reply()

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
            scheduled_at: ISO-8601 datetime (required when stage is FOLLOW_UP).
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
    async def schedule_follow_up(self, run_ctx: RunContext, scheduled_at: str) -> str:
        """Schedule a follow-up call for a time the customer has agreed to.

        Args:
            scheduled_at: ISO-8601 datetime when the follow-up should occur.
        """
        result = await crm_post(
            "scheduleFollowUp",
            self._call_id,
            self._tenant_id,
            self._lead_id,
            {"scheduledAt": scheduled_at},
        )
        logger.info(
            "schedule_follow_up scheduledAt=%s lead=%s", scheduled_at, self._lead_id
        )
        return result.get("message", "ok")

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
        logger.info(
            "schedule_appointment scheduledAt=%s lead=%s", scheduled_at, self._lead_id
        )
        return result.get("data") or {}


class ReshmaFollowupAgent(Agent):
    """Follow-up re-engagement persona — contacts leads that went cold."""

    def __init__(
        self, *, call_id: str, tenant_id: str, lead_id: str, instructions: str
    ) -> None:
        super().__init__(instructions=instructions)
        self._call_id = call_id
        self._tenant_id = tenant_id
        self._lead_id = lead_id

    async def on_enter(self) -> None:
        await self.session.generate_reply()

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
            scheduled_at: ISO-8601 datetime (required when stage is FOLLOW_UP).
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
    async def get_lead_info(self, run_ctx: RunContext) -> dict[str, Any]:
        """Fetch the lead's name, phone, city, current stage, and language from the CRM."""
        result = await crm_post(
            "getLeadInfo", self._call_id, self._tenant_id, self._lead_id
        )
        logger.info("get_lead_info lead=%s", self._lead_id)
        return result.get("data") or {}

    @function_tool
    async def get_follow_up_context(self, run_ctx: RunContext) -> dict[str, Any]:
        """Retrieve the lead's previous call history and recent activity for context."""
        result = await crm_post(
            "getFollowUpContext", self._call_id, self._tenant_id, self._lead_id
        )
        logger.info("get_follow_up_context lead=%s", self._lead_id)
        return result.get("data") or {}

    @function_tool
    async def update_conversion_status(self, run_ctx: RunContext, status: str) -> str:
        """Record the outcome of this follow-up call.

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
        logger.info(
            "update_conversion_status status=%s lead=%s", status, self._lead_id
        )
        return result.get("message", "ok")

    @function_tool
    async def reschedule_follow_up(self, run_ctx: RunContext, scheduled_at: str) -> str:
        """Reschedule this follow-up to a new time agreed with the customer.

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
        logger.info(
            "reschedule_follow_up scheduledAt=%s lead=%s", scheduled_at, self._lead_id
        )
        return result.get("message", "ok")


# ── Agent factory ──────────────────────────────────────────────────────────────

_AGENT_CLASSES: dict[str, type[Agent]] = {
    "RESHMA_VERIFY": ReshmaVerifyAgent,
    "KARTHIK_SALES": KarthikSalesAgent,
    "RESHMA_FOLLOWUP": ReshmaFollowupAgent,
}


def _build_agent(
    persona_id: str,
    call_id: str,
    tenant_id: str,
    lead_id: str,
    instructions: str,
) -> Agent:
    cls = _AGENT_CLASSES.get(persona_id, ReshmaVerifyAgent)
    return cls(
        call_id=call_id,
        tenant_id=tenant_id,
        lead_id=lead_id,
        instructions=instructions,
    )


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

    # Fetch active config from CRM; fall back to built-in defaults on any error
    system_prompt = DEFAULT_PROMPTS.get(persona_id, DEFAULT_PROMPTS["RESHMA_VERIFY"])
    voice_id = DEFAULT_VOICE_IDS.get(persona_id, "mk-tamil-v1")

    try:
        config_resp = await crm_post("getActiveConfig", call_id, tenant_id, lead_id)
        config_data: dict[str, Any] | None = config_resp.get("data")
        if config_data:
            system_prompt = config_data.get("systemPrompt") or system_prompt
            vc: dict[str, Any] = config_data.get("voiceConfig") or {}
            voice_id = vc.get("voiceId") or voice_id
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

    # Build media pipeline
    vad: silero.VAD = ctx.proc.userdata["vad"]
    session = AgentSession(
        stt=sarvam.STT(
            language="en-IN",
            model="saaras:v3",
            mode="transcribe",
            sample_rate=16000,
            high_vad_sensitivity=True,
            flush_signal=False,
        ),
        llm=groq.LLM(model="llama-3.3-70b-versatile"),
        tts=elevenlabs.TTS(
            voice_id=voice_id,
            model="eleven_multilingual_v2",
        ),
        vad=vad,
    )

    agent = _build_agent(persona_id, call_id, tenant_id, lead_id, system_prompt)

    # Register disconnect handler before starting the session so we never miss
    # the event. Any participant leaving the room means the call has ended.
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
