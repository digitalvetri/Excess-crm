# Open Questions — Excess CRM

> Items requiring stakeholder decision before production launch. Logged per CLAUDE.md convention.

## Status Key
- 🔴 BLOCKING — cannot launch without this
- 🟡 IMPORTANT — needed within 2 weeks of launch
- 🟢 NICE-TO-HAVE — can resolve post-launch

---

## Voice Agent

| # | Question | Status | Owner | Notes |
|---|----------|--------|-------|-------|
| VA-01 | Voice samples for Reshma and Karthik personas — which ElevenLabs voice IDs to use? | 🔴 BLOCKING | Excess team | Required in env: ELEVENLABS_VOICE_ID_RESHMA, ELEVENLABS_VOICE_ID_KARTHIK |
| VA-02 | Vapi assistant IDs for all 3 personas — have they been created in Vapi dashboard? | 🔴 BLOCKING | Excess team | Required in env: VAPI_ASSISTANT_ID_* |
| VA-03 | Phone number IDs for each persona — created in Vapi? | 🔴 BLOCKING | Excess team | Required in env: VAPI_PHONE_NUMBER_ID_* |
| VA-04 | Tamil language support — should Reshma speak Tamil or English-Tamil mix? | 🟡 IMPORTANT | Excess team | Current prompt is English; Tamil prompt needs ElevenLabs Tamil voice |
| VA-05 | Daily call cap — is 2000/day correct for launch? | 🟡 IMPORTANT | Excess team | Configurable per tenant in VoiceAgentSettings |

## Commission & Territory

| # | Question | Status | Owner | Notes |
|---|----------|--------|-------|-------|
| CM-01 | Commission slabs — exact % per deal value bracket for each franchise tier? | 🔴 BLOCKING | Excess Finance | Currently using 5% flat placeholder in seed |
| CM-02 | GST treatment — is commission subject to 18% GST deduction or addition? | 🔴 BLOCKING | Excess Finance | Worker currently adds 18% GST |
| CM-03 | Territory boundaries — city lists for each franchise territory? | 🟡 IMPORTANT | Excess Sales | Used for routing rules condition matching |
| CM-04 | Referral reward amount — fixed ₹ or % of deal? | 🟡 IMPORTANT | Excess team | Currently schema supports Decimal; no business rule set |

## Infrastructure

| # | Question | Status | Owner | Notes |
|---|----------|--------|-------|-------|
| IN-01 | AWS account and RDS cluster details — who provisions? | 🔴 BLOCKING | Excess IT / DigitalVetri | CDK stacks ready in /infra |
| IN-02 | Domain configuration — app.excessindia.com and api.excessindia.com DNS? | 🔴 BLOCKING | Excess IT | |
| IN-03 | WhatsApp Business Account approval — has Meta approved the account? | 🔴 BLOCKING | Excess team | BSP or direct? Affects WHATSAPP_PHONE_NUMBER_ID |
| IN-04 | Meta Facebook App — created and webhook configured? | 🔴 BLOCKING | Excess team | Needs META_APP_ID, META_APP_SECRET |
| IN-05 | Resend sending domain — excessindia.com DNS records added for email? | 🟡 IMPORTANT | Excess IT | SPF, DKIM, DMARC needed |

## Compliance

| # | Question | Status | Owner | Notes |
|---|----------|--------|-------|-------|
| CO-01 | TRAI DND list — how/when will it be loaded into dnd_list table? | 🔴 BLOCKING | Excess Ops | Script ready: bulk insert phone numbers |
| CO-02 | DPDP privacy policy — does Excess have one? URL for the app footer? | 🟡 IMPORTANT | Excess Legal | |
| CO-03 | Data residency — confirmed AWS ap-south-1 (Mumbai) for all data? | 🟡 IMPORTANT | Excess Legal | Currently configured |

## Integrations

| # | Question | Status | Owner | Notes |
|---|----------|--------|-------|-------|
| IG-01 | IndiaMART API key — which account/GLI? | 🔴 BLOCKING | Excess Sales | Needed for webhook auth |
| IG-02 | JustDial API credentials | 🔴 BLOCKING | Excess Sales | |
| IG-03 | Exotel account — for fallback telephony | 🟡 IMPORTANT | Excess team | Required if Vapi outages occur |

## UX / Content

| # | Question | Status | Owner | Notes |
|---|----------|--------|-------|-------|
| UX-01 | Tamil translations for all UI labels? | 🟢 NICE-TO-HAVE | Excess team | i18n infrastructure not yet built |
| UX-02 | Company logo for the sidebar (currently text "Excess CRM")? | 🟡 IMPORTANT | Excess Marketing | SVG preferred |
| UX-03 | WhatsApp message templates — approved by Meta? Template names must match DB | 🔴 BLOCKING | Excess team | Templates: CONVERSION_CONFIRMATION, QUOTATION_SENT |

---

*Last updated: 2026-05-18 by DigitalVetri*
*Next review: Before UAT sign-off*
