# INITIAL.md - Excess CRM Product Definition

> Production multi-tenant CRM with AI Voice Agent for Excess Renew Tech Pvt Ltd — a solar company operating across Tamil Nadu via direct sales and a franchise network.

---

## PRODUCT

### Name
Excess CRM

### Description
A single multi-tenant web application with three role-based experiences (HQ Admin, HQ Employee, Franchise) that manages solar leads from capture to conversion. The core differentiator is an AI Voice Agent with three personas (Reshma-Verification, Karthik-Sales, Reshma-FollowUp) that dials every new lead within 5 seconds, qualifies them, books appointments, and hands warm leads to humans.

### Target User
- **HQ Admin** — Excess leadership, unrestricted across all tenants
- **HQ Employee** — Scoped HQ sales/ops staff, team-based access
- **Franchise Owner / User** — Fully isolated tenant per channel partner
- **Engineer** — Field engineer (mobile app + limited web access)

### Type
- [x] SaaS (multi-tenant, role-gated)

---

## TECH STACK

| Layer | Choice |
|-------|--------|
| Backend runtime | Node.js 20 LTS + TypeScript strict |
| Backend framework | Fastify 4 |
| Background jobs | BullMQ on Redis 7 |
| ORM | Prisma 5 (raw SQL escape hatch for RLS) |
| Frontend | Next.js 15 (App Router) + React 19 + TypeScript |
| Database | PostgreSQL 16 (AWS RDS Aurora) + RLS |
| Cache / queue | Redis 7 (AWS ElastiCache) |
| Auth | Lucia Auth v3 + session table (httpOnly cookie) |
| UI | shadcn/ui + Tailwind CSS v4 |
| Forms | React Hook Form + Zod |
| Tables | TanStack Table v8 |
| Charts | Recharts |
| Monorepo | pnpm workspaces + Turborepo |
| File storage | AWS S3 (ap-south-1) — KMS-encrypted |
| Voice orchestration | Vapi (primary), Retell AI (fallback) |
| Telephony | Exotel (India PSTN) |
| STT | Deepgram Nova-3 (via Vapi) |
| TTS | ElevenLabs v3 Turbo (via Vapi) |
| LLM | Claude Sonnet 4.5 (via Vapi / Anthropic API) |
| WhatsApp | Meta WhatsApp Business Cloud API (direct) |
| Email | Resend |
| SMS | Exotel SMS API |
| Maps | Google Maps Platform |
| Observability | Datadog (APM + logs) + Sentry (frontend) |
| Secrets | AWS Secrets Manager |
| CI/CD | GitHub Actions → AWS ECS Fargate |
| Infra-as-code | AWS CDK (TypeScript) |
| Linting | ESLint (typescript-eslint) + Prettier + Husky |
| Testing | Vitest + Playwright + Supertest |
| Payments | None (commission tracking is internal, no payment gateway) |

---

## REPOSITORY STRUCTURE

Monorepo — pnpm workspaces + Turborepo.

```
excess-crm/
├── apps/
│   ├── web/          # Next.js 15 — HQ + Franchise UI (role-aware)
│   ├── api/          # Fastify API server
│   ├── worker/       # BullMQ background workers
│   └── mobile/       # (Phase 9+) React Native engineer app
├── packages/
│   ├── db/           # Prisma schema, migrations, RLS SQL
│   ├── shared/       # Zod schemas, types, constants, permissions
│   ├── voice-agent/  # Vapi prompts, persona configs, tool definitions
│   ├── integrations/ # Meta, IndiaMART, JustDial, WhatsApp adapters
│   ├── ui/           # shadcn components, design tokens
│   └── config/       # Shared ESLint, TS, Tailwind configs
├── infra/            # AWS CDK stacks
├── scripts/          # seed, backfill scripts
├── .github/workflows/
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

---

## MODULES

### Module 1: Authentication & Multi-Tenancy (Required)

**Description:** Session-based auth with argon2id passwords, TOTP 2FA, 5 roles, and PostgreSQL RLS enforcing tenant isolation at the DB layer. Every business table has `tenant_id`. `withTenantContext()` is mandatory on every DB query.

**Models:**
- Tenant: id (UUID), name, type (HQ|FRANCHISE), status (ONBOARDING|ACTIVE|PROBATION|SUSPENDED|TERMINATED), tier (BRONZE|SILVER|GOLD), territory (Json), commissionSlabs (Json), contactName, contactEmail, contactPhone, gstNumber, bankAccount (encrypted Json), createdAt, updatedAt, deletedAt
- User: id, tenantId, email, phone, passwordHash (argon2id), twoFactorSecret, name, role (ADMIN|EMPLOYEE|FRANCHISE_OWNER|FRANCHISE_USER|ENGINEER), teamId, isActive, lastLoginAt
- Session: id, userId, tenantId, role, teamId, token (32-byte random), expiresAt (30-day sliding)
- AuditLog: id (BigInt autoincrement), tenantId, actorUserId, action ('lead.stage_changed' etc), entityType, entityId, diff (Json before/after), ipAddress, userAgent, createdAt

**API Endpoints:**
- POST /auth/login — argon2id verify → optional TOTP → issue httpOnly session cookie
- POST /auth/2fa/setup — generate TOTP secret + QR code
- POST /auth/2fa/verify — verify TOTP token during login
- POST /auth/logout — revoke session
- GET /auth/me — current user + tenant + permissions
- POST /auth/forgot-password — send email magic link (Resend)
- POST /auth/reset-password — consume token, set new password

**Frontend Pages:**
- /login — Email + password, 2FA step inline
- /2fa — Standalone TOTP entry (if 2FA not set up yet → setup wizard)
- /forgot-password — Email entry
- /reset-password — New password form with token

**Security rules:**
- RLS policies on every business table: ADMIN bypass, all others tenant-scoped
- Brute-force: 5 failed logins in 15 min → 15-min lockout + alert to admin
- Session cookie: httpOnly, Secure, SameSite=Lax, domain=.excessindia.com

---

### Module 2: HQ Dashboard (M1)

**Description:** Server-rendered Next.js dashboard auto-refreshing every 30s. HQ Admin sees network-wide metrics; KPI strip, 7-stage funnel, per-source grid, AI agent health, team leaderboard, active alerts.

**API Endpoints:**
- GET /metrics/today — 5 KPI cards (leads-24h, contacted-in-5s %, calls-now, qualified-pending, conversions-today)
- GET /metrics/funnel — 7-stage funnel counts + conversion %
- GET /metrics/sources — per-source performance grid (source, leads, contacted%, qualified%, cost)
- GET /metrics/voice-agent — AI health: speed-to-lead p95, MOS score, bot-detection rate, cost/call
- GET /metrics/team-leaderboard — top 5 by conversion this week
- GET /alerts/active — active P1/P2 issues with click-through

**Frontend Pages:**
- /dashboard — Role-aware: HQ variant shows network-wide metrics; franchise variant shows own metrics + earnings + tier progress

---

### Module 3: Unified Lead Management (M2)

**Description:** The most-used screen. Master-detail layout (filterable list left, detail right). Lead pipeline: `New → Qualified → Follow-Up → Converted` + side-states `Not Answered`, `Invalid`, `Wrong Enquiry`. Virtualised table for 100k+ rows. Keyboard shortcuts: j/k navigate, e edit stage, c add note, / focus search.

**Models:**
- Lead: id, tenantId, externalId, sourceId (FK LeadSource), sourceType (META|INDIAMART|JUSTDIAL|WEBSITE|WHATSAPP|MANUAL), campaignName, adName, name, phone (E.164: +91XXXXXXXXXX), phoneRaw, email, pincode, city, state, rawPayload (Json), language (ta|en|ta-en), aiScore (0-100), stage (LeadStage enum), stageChangedAt, ownerUserId, teamId, factSheet (Json: roofType, monthlyBill, budgetRange, urgency, decisionMaker, painPoint), isDuplicate, duplicateOfId, receivedAt, firstContactedAt, createdAt, updatedAt
- LeadActivity: id, tenantId, leadId, type (CALL|SMS|WHATSAPP|NOTE|STAGE_CHANGE|ASSIGNMENT|QUOTATION_SENT|APPOINTMENT_BOOKED|EMAIL|DUPLICATE_SUBMISSION), actorUserId, actorIsAi (bool), payload (Json), createdAt
- LeadSource: id, tenantId, type, label, config (encrypted Json: accessToken, accountId, formIds...), isActive, lastSyncAt

**API Endpoints:**
- GET /leads — cursor pagination, 15+ filter params (stage, source, assignedTo, team, franchiseId, aiScore[gte/lte], receivedAt[gte/lte], city, pincode, state, language, search, hasAppointment, tag)
- GET /leads/:id — single lead with full timeline, calls, quotations
- PATCH /leads/:id — update fields (stage, owner, notes, factSheet)
- POST /leads/:id/notes
- POST /leads/:id/assign — { userId? teamId? }
- POST /leads/:id/dial-now — force AI dial (choose persona)
- POST /leads:bulk — { action: 'reassign'|'stage'|'export', ids, payload }
- GET /leads/:id/calls
- GET /leads/:id/activities
- POST /leads/:id/whatsapp — send WhatsApp template
- GET /leads/saved-views
- POST /leads/saved-views

**Frontend Pages:**
- /leads — Master-detail with virtualised list, filter sidebar, saved views dropdown
- /leads/[id] — Detail: tabs → Overview / Conversation (waveform player + synced transcript) / Activity Timeline / Quotations / Files
- /leads/sources — Connected lead sources per tenant

---

### Module 4: AI Voice Agent Control Panel (M3 — Admin only)

**Description:** Full control panel for Vapi voice agent. Three personas: Reshma-Verification (verify + qualify), Karthik-Sales (pitch + book appointment), Reshma-FollowUp (re-engage). Prompt versioning, A/B testing, QA dashboard with LLM-as-Judge scoring, call log.

**Models:**
- VoiceAgentConfig: id, tenantId, personaId, systemPrompt (text), version (int), isActive, abTestPercent, activatedAt, createdByUserId
- Call: id, tenantId, leadId, persona (RESHMA_VERIFY|KARTHIK_SALES|RESHMA_FOLLOWUP|HUMAN), direction (OUTBOUND|INBOUND), vapiCallId (unique), exotelCallSid, fromNumber, toNumber, initiatedAt, connectedAt, endedAt, durationSec, status (QUEUED|RINGING|IN_PROGRESS|COMPLETED|NO_ANSWER|BUSY|FAILED|DND_BLOCKED), endReason, recordingUrl (S3 key), transcript (Json array: speaker/text/ts_start/ts_end/sentiment), llmAnalysis (Json: outcome/qualificationScore/factsExtracted/nextStage/rubricScores), costInr
- VoiceAgentSettings: id, tenantId, businessHoursStart (09:00), businessHoursEnd (21:00), timezone (Asia/Kolkata), dailyCallCap (2000), dndPolicy, retryConfig (Json per persona)

**API Endpoints:**
- GET /voice-agent/health — live metrics
- GET/PATCH /voice-agent/personas/:id — update voice ID, fallback voice
- GET /voice-agent/prompts/:personaId — version list
- POST /voice-agent/prompts/:personaId — create new version
- POST /voice-agent/prompts/:personaId/activate — promote to prod (confirm modal)
- POST /voice-agent/prompts/:personaId/ab-test — start A/B test with split %
- GET /calls — filterable call log (all tenants for Admin)
- GET /calls/:id — audio, transcript, LLM analysis, rubric scores, QA notes
- POST /calls/:id/qa-review — manual rubric score
- GET/PATCH /voice-agent/settings

**Frontend Pages:**
- /voice-agent/dashboard
- /voice-agent/personas
- /voice-agent/prompts — editor with version history + diff view
- /voice-agent/calls — searchable call log
- /voice-agent/calls/[id] — waveform player + transcript + LLM analysis
- /voice-agent/qa — QA dashboard, sampling controls, reviewer assignment
- /voice-agent/settings

---

### Module 5: Appointment Calendar (M4)

**Description:** FullCalendar.io React integration. Appointments can be booked by Vapi tool-call during live calls — must respond in < 300ms (Redis-cached availability fast path). Drag-to-reschedule triggers auto-WhatsApp to customer.

**Models:**
- Appointment: id, tenantId, leadId, scheduledAt, durationMin (60), surveyType (ROOFTOP_RESIDENTIAL|COMMERCIAL|INDUSTRIAL|OFFGRID), siteAddress, siteLat, siteLng, assignedEngineerId, status (SCHEDULED|CONFIRMED|COMPLETED|NO_SHOW|RESCHEDULED|CANCELLED), preChecklist (Json), postNotes, createdByCallId, createdAt, updatedAt

**API Endpoints:**
- GET /appointments?from=...&to=...&engineerId=...
- POST /appointments — manual OR AI tool-call (< 300ms p95 via Redis-cached availability)
- PATCH /appointments/:id — reschedule, update notes
- POST /appointments/:id/confirm
- POST /appointments/:id/no-show — triggers Reshma re-engagement call
- POST /appointments/:id/complete — with post-survey notes
- DELETE /appointments/:id — soft cancel with reason
- GET /engineers/availability?from=...&to=... — capacity heatmap

**Frontend Pages:**
- /appointments — Calendar (Day/Week/Month), drag-to-reschedule, engineer capacity panel, heatmap overlay

---

### Module 6: Teams & Lead Routing (M5)

**Description:** HQ team management with ordered routing rules that auto-assign leads based on pincode, source, AI score, language, time-of-day. First matching rule wins.

**Models:**
- Team: id, tenantId, name, scope (Json: regions[], productCategories[]), leaderUserId
- RoutingRule: id, tenantId, priority (int), condition (Json: pincode_in[], source_equals, aiScore_gte/lte, language, time_window), targetTeamId, isActive

**API Endpoints:**
- GET/POST /teams
- PATCH/DELETE /teams/:id
- GET/POST /teams/:id/members
- DELETE /teams/:id/members/:userId
- GET/POST /routing-rules
- PATCH /routing-rules/:id

**Frontend Pages:**
- /teams — Team list with member management and rule editor (drag-to-reorder priority)

---

### Module 7: Franchise Governance (M6 — Admin only)

**Description:** 8-step onboarding wizard (basics → KYC → contract e-sign via Digio → bank → commission slabs → lead sources → training → credentials). Full lifecycle: suspend, terminate, scorecard vs benchmarks, audit trail, broadcast.

**API Endpoints:**
- GET/POST /franchises
- GET/PATCH /franchises/:id
- POST /franchises/:id/credentials — provision Tenant + FRANCHISE_OWNER User
- POST /franchises/:id/suspend — { reason, until? }
- POST /franchises/:id/terminate — { reason, dataExportRequested }
- GET /franchises/:id/scorecard — KPIs vs network benchmarks
- GET /franchises/:id/audit-trail
- POST /franchises/broadcast — send announcement to all/selected franchises
- POST /franchises/:id/commission-slabs — custom override

**Frontend Pages:**
- /franchises — List with status badges, onboarding wizard
- /franchises/[id] — Detail tabs: Overview / KYC / Contract / Commission / Scorecard / Audit Trail

---

### Module 8: Franchise Earnings & Payments (F3)

**Description:** Commission ledger, payout history, 60-day forecast, tax certificates. Coach tips engine (8 deterministic rules, not LLM) recalculated nightly via BullMQ.

**Models:**
- Commission: id, tenantId, leadId, dealValueInr, ratePercent, commissionInr, gstInr, deductionsInr, netPayableInr, status (PENDING_APPROVAL|APPROVED|PAID|ON_HOLD|DISPUTED), approvedByUserId, paidAt, payoutId
- Payout: id, tenantId, amountInr, bankUtr, paidAt, commissionIds (String[])

**API Endpoints:**
- GET /commissions, /commissions/:id
- GET /payouts, /payouts/:id
- GET /earnings/forecast — 60-day projection
- GET /earnings/coach-tips — 8 deterministic tips with severity + CTA
- GET /earnings/tax-certificates — auto-generated PDFs
- POST /payouts/instant-request — if wallet feature enabled

**Frontend Pages:**
- /earnings — Ledger table, payout history, forecast chart (Recharts), coach tips cards

---

### Module 9: Quotation Builder (F5)

**Description:** Lead-fact-prefilled quotation builder. PDF rendered via Puppeteer + Handlebars (Tamil-safe, memory-bounded Lambda). Send via WhatsApp or email. Auto-generate number EXC-2025-XXXXX.

**Models:**
- Quotation: id, tenantId, leadId, number (EXC-YYYY-NNNNN), systemKw, brandTier (ECONOMY|MID|PREMIUM), totalInr, subsidyInr, netPayable, emiMonthly, paybackYears, lineItems (Json), pdfS3Key, sentAt, sentVia, status (DRAFT|SENT|ACCEPTED|REJECTED), createdByUserId

**API Endpoints:**
- GET/POST /quotations
- GET/PATCH /quotations/:id
- POST /quotations/:id/render-pdf — background job → returns S3 key
- POST /quotations/:id/send — { via: 'WHATSAPP'|'EMAIL', recipient }
- GET /product-catalogue — system sizes, brands, current prices

**Frontend Pages:**
- /quotations — List + builder form with auto-calculations (subsidy, EMI, payback years)

---

### Module 10: Support Tickets & Knowledge Base (F4)

**Description:** Franchise support tickets with SLA enforcement (BullMQ-timed escalation at T-15min warning, T=0 escalate to ops lead). Categories: Technical, Operational, Commercial, Product, Training.

**Models:**
- Ticket: id, tenantId, raisedByUserId, category (TECHNICAL|OPERATIONAL|COMMERCIAL|PRODUCT|TRAINING), priority (P1|P2|P3|P4), subject, description, attachments (Json: S3 keys), status (OPEN|IN_PROGRESS|RESOLVED|CLOSED), assignedToUserId, slaDueAt, resolvedAt, satisfactionRating (1-5)
- KbArticle: id, slug, title, body (Markdown), category, language (ta|en), publishedAt

**API Endpoints:**
- GET/POST /tickets
- GET/PATCH /tickets/:id
- POST /tickets/:id/messages — threaded replies
- POST /tickets/:id/satisfaction — { rating, comment }
- GET /kb, /kb/:slug

**Frontend Pages:**
- /support — Ticket list, create form, thread view with attachments
- /kb — Article index and reader (Tamil + English toggle)

---

### Module 11: Lead Source Webhooks (Backend only)

**Description:** Accept-and-enqueue pattern for all 6 lead sources. Non-negotiable: respond 200 OK immediately, process async via BullMQ `lead-ingest` queue. Deduplication: same phone within 90 days → append activity to existing lead.

**Webhook Endpoints:**
- POST /api/webhooks/meta — HMAC-SHA256 (X-Hub-Signature-256), Meta leadgen webhook
- POST /api/webhooks/indiamart — shared secret (X-Excess-Signature)
- POST /api/webhooks/justdial — Bearer token per tenant
- POST /api/webhooks/website — HMAC-signed embed form submission
- POST /api/webhooks/whatsapp — Meta WhatsApp Cloud API inbound
- POST /api/leads/manual — authenticated UI manual entry

**Vapi Webhook Endpoints:**
- POST /api/webhooks/vapi/function-call — live tool-calls during a call (< 300ms response)
- POST /api/webhooks/vapi/end-of-call — final report, triggers recording fetch + S3 upload
- POST /api/webhooks/vapi/status — call status transitions

**Lead Source OAuth/Config Endpoints (Franchise):**
- GET /lead-sources — connected sources list
- POST /lead-sources/meta/oauth-start — returns Meta OAuth URL
- POST /lead-sources/meta/oauth-callback — exchanges code, stores token
- POST /lead-sources/indiamart — { apiKey }
- POST /lead-sources/justdial — { webhookSecret }
- POST /lead-sources/website — returns embeddable JS snippet
- DELETE /lead-sources/:id
- POST /lead-sources/:id/test — trigger test webhook

---

### Module 12: WhatsApp Business API (§12)

**Description:** Direct Meta WhatsApp Cloud API. Inbound creates/appends leads. Outbound uses 6 pre-approved templates. Session window tracking (24h free-form, else template-only).

**Pre-approved templates:**
- `welcome_catalogue_v1` — after Reshma verification
- `appointment_confirmation_v1` — after AI booking
- `appointment_reminder_24h_v1` — T-24h
- `quotation_sent_v1` — quotation send
- `payment_link_v1` — post-deal close
- `review_request_v1` — post-installation

**API Endpoints:**
- POST /api/whatsapp/send — { leadId, templateName?, templateParams?, freeFormText?, mediaUrl? }

---

### Module 13: Background Workers (§14)

**Description:** All async work in `apps/worker`. BullMQ queues on Redis.

**Queues:**
- `lead-ingest` (HIGH, concurrency 50) — normalize, dedup, insert, enqueue voice-dial
- `voice-dial` (HIGH, concurrency 20) — initiate Vapi outbound calls after DND/hours/cap/dedup gates
- `voice-followup` (NORMAL, concurrency 20) — scheduled retry calls
- `whatsapp-send` (NORMAL, concurrency 30)
- `sms-send` (NORMAL, concurrency 30)
- `pdf-render` (LOW, concurrency 5) — Puppeteer quotation PDFs
- `s3-upload` (NORMAL, concurrency 10) — recording uploads
- `metrics-rollup` (LOW, concurrency 2) — hourly + nightly aggregation
- `coach-tips-refresh` (LOW, concurrency 5) — nightly franchise tips
- `qa-llm-judge` (LOW, concurrency 10) — nightly call QA scoring via Claude API
- `indiamart-pull` (LOW, concurrency 1) — 5-min fallback pull
- `sla-watcher` (NORMAL, concurrency 1) — ticket SLA escalation

**Cron schedule:**
- Every 5 min: `indiamart-pull` for all active tenants
- Every hour: `metrics-rollup`
- Daily 02:00 IST: `coach-tips-refresh`, `qa-llm-judge`
- Weekly Sunday 04:00 IST: full data export to cold S3

---

### Module 14: Additional Franchise Modules

**Description:** Phase 7 modules — Marketing Library, Training Hub, Co-Marketing, Referrals, Leaderboard, Reviews, Inventory, Wallet. Each gets own routes.

**Frontend Pages:**
- /marketing-library — Asset browser, Meta ad launcher, WhatsApp co-branded share
- /training — Module list, video player (S3 + CloudFront), quiz (JSON + React), certifications
- /co-marketing, /referrals, /leaderboard, /reviews, /inventory, /wallet

---

## MVP SCOPE

### Must Have (MVP — Phase 0–3, Weeks 1–6)

- [x] Multi-tenant auth with RLS: admin + franchise login, cross-tenant isolation verified
- [x] Lead ingestion from Meta, IndiaMART, JustDial, website forms, manual entry
- [x] Unified leads view with filters, activity timeline, stage management, bulk actions
- [x] AI Voice Agent — Reshma verification (< 5s dial SLA, transcript display, recording in S3)
- [x] AI Voice Agent — Karthik sales + Reshma follow-up with retry cadences
- [x] Appointment booking via AI tool-call (< 300ms), calendar UI
- [x] WhatsApp outbound templates (welcome catalogue, appointment confirmation)
- [x] BullMQ workers: lead-ingest, voice-dial, whatsapp-send, s3-upload
- [x] Audit log for all state mutations
- [x] HQ dashboard with KPI strip, funnel chart, voice agent health

### Nice to Have (Post-MVP — Phase 4–9)

- [ ] Full franchise onboarding wizard (8 steps including Digio e-sign)
- [ ] Quotation PDF builder with Tamil character rendering
- [ ] Coach tips engine (8 deterministic rules, nightly BullMQ job)
- [ ] Marketing library with Meta ad launcher
- [ ] Training hub (video + quiz + certification)
- [ ] Co-marketing, referrals, leaderboard, reviews, inventory, wallet modules
- [ ] Mobile app (React Native, Phase 9+)
- [ ] LLM-as-Judge nightly QA pipeline
- [ ] Full load testing + external pen test

---

## ACCEPTANCE CRITERIA

### Authentication & Multi-Tenancy
- [ ] Admin login → 2FA setup → logout end-to-end
- [ ] Franchise A user cannot read Franchise B leads — verified with raw SQL, no WHERE clause
- [ ] Brute-force: 5 failed logins → 15-min lockout + admin alert
- [ ] Session sliding renewal works; expired session forces re-login
- [ ] All auth events written to audit_log

### Lead Management
- [ ] Real Meta lead form → appears in CRM within 3 seconds
- [ ] Replay-attack test: same payload sent twice → only 1 lead created
- [ ] Bad HMAC signature → 401, no DB write
- [ ] Leads list handles 100k rows without UX degradation (virtualised)

### AI Voice Agent
- [ ] New lead → AI dials within 5 seconds (p95) on staging
- [ ] Reshma extracts fact-sheet for ≥ 80% of test calls
- [ ] schedule_appointment tool responds < 300ms p95
- [ ] Recording in S3 within 60s of call end
- [ ] DND scrub blocks 100% of DND-listed test numbers
- [ ] Business-hours gate defers off-hours leads correctly

### Appointments
- [ ] Appointment booking API responds within 300ms p95 (load test verified)
- [ ] Drag-to-reschedule sends auto-WhatsApp to customer

### Franchise Isolation
- [ ] Franchise A cannot URL-hack to Franchise B data
- [ ] Franchise connect Meta OAuth → mock webhook → leads route to correct tenant

### Quality
- [ ] TypeScript strict mode, no `any` (use `unknown` + narrowing)
- [ ] Test coverage: ≥ 80% in `packages/shared`, ≥ 70% overall
- [ ] All 10 critical E2E flows pass on staging (see §15.2 of build spec)
- [ ] Lighthouse ≥ 90 on all primary pages
- [ ] Load test: sustains 50 leads/sec for 10 min, no errors

---

## SPECIAL REQUIREMENTS

### Security (Non-negotiable)
- [x] PostgreSQL RLS on every business table with `FORCE ROW LEVEL SECURITY`
- [x] `withTenantContext()` wrapper mandatory on every DB query — no exceptions
- [x] `can()` permission check on every protected API handler
- [x] Rate limiting: 60 req/min (anonymous), 600/min (authenticated), 100/min per tenant (webhook endpoints)
- [x] HMAC signature verification on all inbound webhooks — reject 401 on failure
- [x] Idempotency-Key header supported on state-changing POST endpoints (24h dedup)
- [x] PII (phone, email, name) never logged in clear text
- [x] Secrets via AWS Secrets Manager — never hardcoded or in .env committed to git
- [x] Input sanitised for any UI-rendered user content (XSS prevention)

### Compliance
- [x] TRAI TCCCPR: outbound AI calls only between 09:00–21:00 IST; DND registry scrub before every call
- [x] DPDP 2023: data retention policy honoured; consent tracking; right-to-erasure hooks
- [x] Structured JSON logs with tenantId, userId, requestId, traceId on every log line (pino)
- [x] Audit log entry for every state mutation (append-only)

### Integrations
- [x] Vapi — 3 assistants configured, tool-call webhooks (update_fact_sheet, classify_lead, schedule_followup, send_whatsapp_catalogue, mark_dnd, escalate_to_human, end_call)
- [x] Exotel — PSTN telephony + SMS, TRAI-compliant, virtual number configured
- [x] ElevenLabs — voice cloning for Reshma + Karthik after voice sample sessions
- [x] Meta WhatsApp Business Cloud API — 6 pre-approved templates
- [x] Meta Lead Ads — per-franchise OAuth connection, page-level webhook subscription
- [x] IndiaMART — push webhook + pull fallback every 5 min per tenant CRM key
- [x] JustDial — webhook + voice call routing via Exotel
- [x] Google Maps Platform — geocoding for survey address + engineer routing
- [x] Resend — transactional email (password reset, notifications)
- [x] AWS S3 + KMS — recordings, quotations, assets; presigned URLs with 15-min expiry
- [x] Datadog APM + Sentry — error tracking + custom metrics for revenue-critical flows

---

## AGENTS

> These 6 agents will build Excess CRM in parallel:

| Agent | Role | Works On |
|-------|------|----------|
| DATABASE-AGENT | Prisma schema, migrations, RLS SQL policies, indexes | All DB models + tenant isolation proof |
| BACKEND-AGENT | Fastify API, BullMQ workers, webhook handlers, Vapi integration | All modules' backends |
| FRONTEND-AGENT | Next.js pages, shadcn/ui components, role-aware routing | All modules' frontends |
| DEVOPS-AGENT | AWS CDK stacks, docker-compose, GitHub Actions CI/CD | Infrastructure + deployment |
| TEST-AGENT | Vitest unit+integration, Supertest API tests, Playwright E2E, k6 load | All code |
| REVIEW-AGENT | RLS leak checks, permission checks, secrets scan, DPDP/TRAI audit | All code |

---

# READY?

```bash
/generate-prp INITIAL.md
```

Then:

```bash
/execute-prp PRPs/excess-crm-prp.md
```

> Build order: follow §17 of the build spec (Phase 0 → Phase 9). Do not skip ahead. Each phase has a demo deliverable.
