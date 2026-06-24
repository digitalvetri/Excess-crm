# Excess CRM — Client Handoff & Operations Guide

Delivered by DigitalVetri. This is everything needed to **run, configure, and operate** the Excess CRM in production.

---

## 1. What it is

A multi-tenant CRM with an AI Voice Agent for Excess Renew Tech (solar). It captures leads from multiple sources, qualifies and converts them, manages installs/service, and supports a franchise network — all role-aware.

**Stack:** Next.js 15 (web) · Fastify (API) · BullMQ workers · PostgreSQL 16 (+ row-level security) · Redis 7 · deployed on Coolify.

```
Browser ──HTTPS──> Web (Next.js)  ──/api/v1 proxy──>  API (Fastify) ──> Postgres (RLS) + Redis
                                                          │
                                          Workers (BullMQ) ── queues ──> external services
```

---

## 2. Roles

| Role | Sees | Can do |
|---|---|---|
| **ADMIN** (HQ) | Everything | Full control: leads, delivery, marketing, analytics, voice agent, franchise/commissions/payouts, teams, users, settings |
| **EMPLOYEE** | Sales, Delivery, Marketing, Analytics | Day-to-day operations (no admin settings) |
| **FRANCHISE_OWNER** | Their leads, My Earnings (commissions/wallet), engagement | Run their franchise; see their commissions |
| **FRANCHISE_USER** | Their franchise's leads, referrals, leaderboard | Franchise staff (no commissions view) |
| **ENGINEER** | Field work (appointments, projects, tickets) — **read-only** | View assigned work (field updates via mobile app / survey links) |

**Create users:** log in as ADMIN → **People → User Management → Add User**. (Admins are seeded/created via the DB, not this screen.)

---

## 3. First-time production setup (checklist)

1. ☐ Set the **core env vars** (section 4) in Coolify
2. ☐ Apply schema: in the API container terminal → `tsx node_modules/.bin/prisma db push` *(or it's applied on deploy)*
3. ☐ Seed an HQ tenant + admin (use `scripts/create-tenant.ts` / the seed) **or** point at your existing data
4. ☐ Connect the **integrations** you'll use (section 5)
5. ☐ Apply starter pipeline rules: API container terminal → `tsx packages/db/src/setup-pipeline-rules.ts`
6. ☐ Create real user accounts; add members to teams
7. ☐ Smoke test: login → create a lead → convert → message

---

## 4. Environment variables

All integration keys are **optional** — the app boots and runs without them; features that need a key simply return a clean "not configured" until you add it. Set these in **Coolify → your app → Environment Variables**.

### Core (set these)
| Var | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `APP_URL` / `API_URL` | your public URLs (e.g. `https://excessindia.online`) |
| `DATABASE_URL` | Postgres connection (Coolify sets this to the `app-postgres` container) |
| `REDIS_URL` | Redis connection |
| `SESSION_SECRET` | **64-byte random string** — change from default! |
| `COOKIE_DOMAIN` | e.g. `.excessindia.online` |

### Feature toggles
`ENABLE_AI_DIAL`, `ENABLE_LIVEKIT`, `DAILY_AI_CALL_CAP`, `BUSINESS_HOURS_START/END`, `DEFAULT_TIMEZONE` (Asia/Kolkata).

### Integrations (add as you enable each — section 5)
WhatsApp/Meta · Email (Resend) · Lead sources (Meta/IndiaMART/JustDial) · Storage (AWS S3) · Voice (LiveKit/ElevenLabs/Groq/Vapi/Sarvam) · DND (Exotel) · Maps (Google) · Monitoring (Sentry/Datadog).

---

## 5. Connecting integrations

| Feature | What to set | Where / how |
|---|---|---|
| **WhatsApp** (messages, broadcasts, drip sequences) | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID` | In the app: **WhatsApp → Connect** (admin only), enter Meta Business Phone Number ID + permanent Access Token. Outreach needs **Meta-approved templates**. |
| **Email** | `RESEND_API_KEY`, `FROM_EMAIL` | Coolify env. Used for converted-lead emails, sequences. |
| **Lead sources** | Meta: `META_APP_ID/SECRET`, `META_WEBHOOK_VERIFY_TOKEN/APP_SECRET`; IndiaMART/JustDial keys | Set keys, then register the webhook URL `https://<api>/api/v1/webhooks/{meta|indiamart|justdial}` in each provider's console. |
| **File storage** (recordings, quotation PDFs) | `AWS_ACCESS_KEY_ID/SECRET`, `S3_BUCKET_*`, `AWS_REGION` | Create the S3 buckets, add keys. |
| **AI Voice Agent** | `LIVEKIT_*`, `ELEVENLABS_*`, `GROQ_API_KEY`, `VAPI_*`, `SARVAM_API_KEY` | Add keys; configure personas in **Voice Agent → Personas**; `ENABLE_LIVEKIT=true`. *(Voice call needs the browser mic allowed.)* |
| **DND / TRAI compliance** | `EXOTEL_*` | Required for legal outbound-call scrubbing if you use AI dialing. |

---

## 6. Operations runbook

### Pipeline automation (Settings)
- **SLA Rules** — flag leads idle too long (Notify/Reassign). *Starter: NEW 2h, QUALIFIED 24h, FOLLOW_UP 48h.*
- **Assignment Rules** — auto-route incoming leads to a team by pincode/city/source (round-robin among team members — **add members or routing won't assign**).
- **Stage Gates** — require fields/activities before a stage change (e.g. CONVERTED needs a sent quotation). Optional; blocks bad transitions.
- **Drip Sequences** — auto WhatsApp/Email when a lead hits a stage (e.g. Qualified → WhatsApp). Create two: trigger Qualified, trigger Follow Up.
- **Webhooks** — push CRM events (`lead.created`, `lead.stage_changed`, …) to external systems (Zapier, your tools).

Quick-apply a sensible starter set: `tsx packages/db/src/setup-pipeline-rules.ts` (add `--with-convert-gate` for the quote gate).

### Teams & users
**Franchise → Teams** (create teams, add members) · **People → User Management** (create/edit/deactivate users, reset passwords).

---

## 7. Deploy & maintenance

- **Deploy:** push to `main` → GitHub Action fires the **Coolify webhook** → Coolify rebuilds & redeploys. *(Schema = `prisma db push`; there are no migration files. The prod DB user can't run DDL via the app — apply schema changes from a privileged container terminal.)*
- **Apply schema / scripts:** open the **API service terminal in Coolify** (`DATABASE_URL` is already set there) and run `tsx <script>`.
- **Backups:** snapshot the `app-postgres` volume / enable managed Postgres backups in Coolify.
- **Logs:** per-service logs in Coolify; wire `SENTRY_DSN` for error tracking.
- **CI:** every PR runs typecheck, lint, unit+integration (incl. RLS isolation), and **live E2E for all four roles** — keep it green before deploying.

---

## 8. Security notes

- Tenant data is isolated at the DB layer (Postgres **RLS**, force-enabled, 64 leak tests).
- Sessions are httpOnly + secure cookies; auth endpoints are rate-limited.
- Webhooks verify HMAC signatures; customer-portal links are signed tokens.
- **Rotate any shared credentials** (GitHub tokens, DB password, `SESSION_SECRET`) before/after handoff.

---

## 9. Support

- Codebase docs: `CLAUDE.md`, `EXCESS-CRM-BUILD-SPEC.md`, `skills/`.
- Open questions / decisions log: `OPEN_QUESTIONS.md`.
- Contact: DigitalVetri (info@digitalvetri.com).
