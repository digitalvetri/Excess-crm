# PRP: Excess CRM

> Implementation blueprint for parallel agent execution.
> Source of truth: `EXCESS-CRM-BUILD-SPEC.md`. When this PRP disagrees with the spec, the spec wins.

---

## METADATA

| Field | Value |
|-------|-------|
| **Product** | Excess CRM |
| **Client** | Excess Renew Tech Pvt Ltd, Coimbatore |
| **Delivered by** | DigitalVetri |
| **Type** | Multi-tenant SaaS + AI Voice Agent |
| **Version** | 1.0 |
| **Created** | 2026-05-18 |
| **Complexity** | High |
| **Timeline** | 14–16 weeks, 9 phases |
| **Repo** | Monorepo — pnpm workspaces + Turborepo |

---

## PRODUCT OVERVIEW

**Description:** A single multi-tenant web CRM with three role-based experiences (HQ Admin, HQ Employee, Franchise) for a solar installation company. The core differentiator is an AI Voice Agent with three personas that dials every new lead within 5 seconds, qualifies them via Tamil/English bilingual conversation, books appointments in real time, and hands warm leads to humans.

**Value Proposition:**
- Speed-to-lead: AI dials within 5s vs industry average of hours
- 3x lead-to-close conversion lift via consistent AI qualification
- Full franchise network management + commission tracking in one system
- Tamil-English code-switching AI that sounds like real Excess staff

**MVP Scope (Phase 0–3, Weeks 1–6):**
- [ ] Multi-tenant auth (argon2id, TOTP 2FA, 5 roles, PostgreSQL RLS)
- [ ] Lead ingestion from 6 sources (Meta, IndiaMART, JustDial, Website, WhatsApp, Manual)
- [ ] Unified leads view (master-detail, virtualised, 15+ filters, bulk actions)
- [ ] AI Voice Agent — Reshma Verification persona (< 5s dial SLA)
- [ ] AI Voice Agent — Karthik Sales + Reshma Follow-up personas
- [ ] Appointment booking via AI tool-call (< 300ms via Redis-cached availability)
- [ ] WhatsApp outbound templates (6 pre-approved)
- [ ] HQ dashboard (KPI strip, 7-stage funnel, AI health, leaderboard)
- [ ] BullMQ workers: lead-ingest, voice-dial, whatsapp-send, s3-upload

---

## TECH STACK

| Layer | Technology | Skill Reference |
|-------|------------|-----------------|
| Backend runtime | Node.js 20 LTS + TypeScript strict | skills/BACKEND.md |
| Backend framework | Fastify 4 | skills/BACKEND.md |
| Background jobs | BullMQ on Redis 7 | skills/BACKEND.md |
| ORM | Prisma 5 (raw SQL for RLS) | skills/DATABASE.md |
| Frontend | Next.js 15 (App Router) + React 19 + TypeScript | skills/FRONTEND.md |
| Database | PostgreSQL 16 (AWS RDS Aurora) + RLS | skills/DATABASE.md |
| Cache | Redis 7 (AWS ElastiCache) | skills/BACKEND.md |
| Auth | Lucia Auth v3 + sessions table | skills/BACKEND.md |
| UI | shadcn/ui + Tailwind CSS v4 | skills/FRONTEND.md |
| Forms | React Hook Form + Zod | skills/FRONTEND.md |
| Tables | TanStack Table v8 | skills/FRONTEND.md |
| Charts | Recharts | skills/FRONTEND.md |
| Testing | Vitest + Playwright + Supertest + k6 | skills/TESTING.md |
| Deployment | AWS CDK (TypeScript) + ECS Fargate + GitHub Actions | skills/DEPLOYMENT.md |
| File storage | AWS S3 (ap-south-1) + KMS | skills/DEPLOYMENT.md |
| Voice | Vapi + Exotel + ElevenLabs v3 Turbo + Deepgram Nova-3 | — |
| LLM | Claude Sonnet 4.5 (Anthropic API) | — |
| WhatsApp | Meta WhatsApp Business Cloud API | — |
| Email | Resend | — |
| Observability | Datadog APM + Sentry | — |

---

## DATABASE MODELS

### Core Models (packages/db/schema.prisma)

**Tenant**
- id (UUID PK), name, type (HQ|FRANCHISE), status (ONBOARDING|ACTIVE|PROBATION|SUSPENDED|TERMINATED), tier (BRONZE|SILVER|GOLD), territory (Json), commissionSlabs (Json), contactName, contactEmail, contactPhone, gstNumber, bankAccount (encrypted Json), createdAt, updatedAt, deletedAt

**User**
- id (UUID PK), tenantId (FK), email (unique), phone, passwordHash (argon2id), twoFactorSecret, name, role (ADMIN|EMPLOYEE|FRANCHISE_OWNER|FRANCHISE_USER|ENGINEER), teamId (FK), isActive, lastLoginAt, createdAt, updatedAt
- Indexes: tenantId, email

**Session**
- id (UUID PK), userId (FK), tenantId, role, teamId, token (unique, 32-byte), expiresAt (30-day sliding), createdAt

**AuditLog** (append-only)
- id (BigInt autoincrement PK), tenantId, actorUserId, action (string: 'lead.stage_changed' etc), entityType, entityId (UUID), diff (Json: before/after), ipAddress, userAgent, createdAt
- Indexes: [tenantId, createdAt], [entityType, entityId]

**LeadSource**
- id (UUID PK), tenantId, type (META|INDIAMART|JUSTDIAL|WEBSITE|WHATSAPP|MANUAL), label, config (encrypted Json), isActive, lastSyncAt, createdAt

**Lead**
- id (UUID PK), tenantId, externalId, sourceId (FK LeadSource), sourceType, campaignName, adName, name, phone (E.164 +91XXXXXXXXXX), phoneRaw, email, pincode, city, state, rawPayload (Json), language (ta|en|ta-en), aiScore (0-100), stage (NEW|QUALIFIED|FOLLOW_UP|CONVERTED|NOT_ANSWERED|INVALID|WRONG_ENQUIRY), stageChangedAt, ownerUserId (FK User), teamId (FK Team), factSheet (Json: roofType/monthlyBill/budgetRange/urgency/decisionMaker/painPoint), isDuplicate, duplicateOfId, receivedAt, firstContactedAt, createdAt, updatedAt
- Indexes: [tenantId, stage, receivedAt], [tenantId, phone], [phone]

**LeadActivity**
- id (UUID PK), tenantId, leadId (FK), type (CALL|SMS|WHATSAPP|NOTE|STAGE_CHANGE|ASSIGNMENT|QUOTATION_SENT|APPOINTMENT_BOOKED|EMAIL|DUPLICATE_SUBMISSION), actorUserId, actorIsAi (bool), payload (Json), createdAt
- Indexes: [leadId, createdAt], [tenantId, createdAt]

**Call**
- id (UUID PK), tenantId, leadId (FK), persona (RESHMA_VERIFY|KARTHIK_SALES|RESHMA_FOLLOWUP|HUMAN), direction (OUTBOUND|INBOUND), vapiCallId (unique), exotelCallSid, fromNumber, toNumber, initiatedAt, connectedAt, endedAt, durationSec, status (QUEUED|RINGING|IN_PROGRESS|COMPLETED|NO_ANSWER|BUSY|FAILED|DND_BLOCKED), endReason, recordingUrl (S3 key), transcript (Json array: speaker/text/ts_start/ts_end/sentiment), llmAnalysis (Json: outcome/qualificationScore/factsExtracted/nextStage/rubricScores), costInr (Decimal 10,4)
- Indexes: [leadId], [tenantId, initiatedAt]

**VoiceAgentConfig**
- id (UUID PK), tenantId, personaId, systemPrompt (text), version (int), isActive, abTestPercent, activatedAt, createdByUserId, createdAt

**VoiceAgentSettings**
- id (UUID PK), tenantId, businessHoursStart (09:00), businessHoursEnd (21:00), timezone (Asia/Kolkata), dailyCallCap (2000), dndPolicy (Json), retryConfig (Json per persona)

**Team**
- id (UUID PK), tenantId, name, scope (Json: regions[], productCategories[]), leaderUserId, createdAt

**RoutingRule**
- id (UUID PK), tenantId, priority (int), condition (Json), targetTeamId, isActive, createdAt

**Appointment**
- id (UUID PK), tenantId, leadId (FK), scheduledAt, durationMin (60), surveyType (ROOFTOP_RESIDENTIAL|COMMERCIAL|INDUSTRIAL|OFFGRID), siteAddress, siteLat (Decimal 10,7), siteLng, assignedEngineerId, status (SCHEDULED|CONFIRMED|COMPLETED|NO_SHOW|RESCHEDULED|CANCELLED), preChecklist (Json), postNotes, createdByCallId, createdAt, updatedAt
- Indexes: [tenantId, scheduledAt], [assignedEngineerId, scheduledAt]

**Quotation**
- id (UUID PK), tenantId, leadId (FK), number (EXC-YYYY-NNNNN), systemKw (Decimal), brandTier (ECONOMY|MID|PREMIUM), totalInr (Decimal), subsidyInr, netPayable, emiMonthly, paybackYears, lineItems (Json), pdfS3Key, sentAt, sentVia, status (DRAFT|SENT|ACCEPTED|REJECTED), createdByUserId, createdAt

**Commission**
- id (UUID PK), tenantId (franchise), leadId, dealValueInr, ratePercent, commissionInr, gstInr, deductionsInr, netPayableInr, status (PENDING_APPROVAL|APPROVED|PAID|ON_HOLD|DISPUTED), approvedByUserId, paidAt, payoutId, createdAt

**Payout**
- id (UUID PK), tenantId, amountInr, bankUtr, paidAt, commissionIds (String[]), createdAt

**Ticket**
- id (UUID PK), tenantId, raisedByUserId, category (TECHNICAL|OPERATIONAL|COMMERCIAL|PRODUCT|TRAINING), priority (P1|P2|P3|P4), subject, description, attachments (Json: S3 keys), status (OPEN|IN_PROGRESS|RESOLVED|CLOSED), assignedToUserId, slaDueAt, resolvedAt, satisfactionRating (1-5), createdAt

**KbArticle**
- id (UUID PK), slug (unique), title, body (Markdown), category, language (ta|en), publishedAt, createdAt

**WaSession**
- id (UUID PK), leadId, phone, sessionExpiresAt (24h from last customer message), lastMessageAt, createdAt

**Additional tables:** Campaign, AdCreative, TrainingModule, TrainingProgress, MarketingAsset, Referral, ReviewRequest, InventorySnapshot, CoachCache, DndList

### RLS Policy Pattern (raw SQL migration)
```sql
-- Applied to every business table
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_full_access ON {table}
  FOR ALL TO crm_app
  USING (current_setting('app.role', true) = 'ADMIN');
CREATE POLICY tenant_isolation ON {table}
  FOR ALL TO crm_app
  USING (
    current_setting('app.role', true) != 'ADMIN'
    AND tenant_id::text = current_setting('app.tenant_id', true)
  );
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
```

---

## MODULES

### Module 1: Authentication & Multi-Tenancy
**Agents:** DATABASE-AGENT + BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/login | argon2id verify → optional TOTP → session cookie |
| POST | /auth/2fa/setup | Generate TOTP secret + QR code |
| POST | /auth/2fa/verify | Verify TOTP token |
| POST | /auth/logout | Revoke session |
| GET | /auth/me | Current user + tenant + permissions |
| POST | /auth/forgot-password | Send email magic link via Resend |
| POST | /auth/reset-password | Consume token, set new password |

**Key implementations:**
- `apps/api/src/plugins/auth.ts` — Fastify preHandler: verify cookie, load session, attach `req.auth`
- `packages/db/src/with-tenant.ts` — `withTenantContext()` wrapper (SET LOCAL app.tenant_id / app.role / app.user_id)
- `packages/shared/src/permissions.ts` — `PERMS` map + `can(role, action)` helper
- `packages/config/env.ts` — Zod-validated env loader, fails fast at boot

**Frontend Pages:**
| Route | Page | Description |
|-------|------|-------------|
| /login | LoginPage | Email + password + inline 2FA step |
| /2fa | TwoFactorPage | TOTP entry or setup wizard |
| /forgot-password | ForgotPasswordPage | Email entry |
| /reset-password | ResetPasswordPage | New password with token |

---

### Module 2: HQ Dashboard (M1)
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | /metrics/today | 5 KPI cards |
| GET | /metrics/funnel | 7-stage funnel counts + conversion % |
| GET | /metrics/sources | Per-source performance grid |
| GET | /metrics/voice-agent | AI health: speed, MOS, bot-rate, cost |
| GET | /metrics/team-leaderboard | Top 5 by conversion this week |
| GET | /alerts/active | Active P1/P2 issues |
| GET | /metrics/earnings | Franchise: this month, lifetime, forecast |
| GET | /metrics/tier-progress | Franchise: distance to next tier |

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /dashboard | DashboardPage | KpiStrip, FunnelChart (Recharts), SourceGrid (TanStack), VoiceAgentCard, Leaderboard, AlertsPanel |

---

### Module 3: Unified Lead Management (M2)
**Agents:** DATABASE-AGENT + BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | /leads | Cursor-paginated list, 15+ filters |
| GET | /leads/:id | Single lead with full timeline |
| PATCH | /leads/:id | Update stage, owner, notes, factSheet |
| POST | /leads/:id/notes | Add note activity |
| POST | /leads/:id/assign | { userId? teamId? } |
| POST | /leads/:id/dial-now | Force AI dial (choose persona) |
| POST | /leads:bulk | { action: 'reassign'|'stage'|'export', ids, payload } |
| GET | /leads/:id/calls | All call records |
| GET | /leads/:id/activities | Full activity timeline |
| POST | /leads/:id/whatsapp | Send WhatsApp template |
| GET | /leads/saved-views | User's saved filter views |
| POST | /leads/saved-views | Save a filter view |

**Query params:** stage, source, assignedTo, team, franchiseId, aiScore[gte/lte], receivedAt[gte/lte], city, pincode, state, language, search, hasAppointment, tag, cursor, limit

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /leads | LeadsPage | FilterSidebar, VirtualisedLeadList (TanStack), LeadCard, BulkActionToolbar, SavedViewsDropdown |
| /leads/[id] | LeadDetailPage | Tabs: Overview, Conversation (wavesurfer.js + synced transcript), ActivityTimeline, Quotations, Files |
| /leads/sources | LeadSourcesPage | SourceCard, ConnectSourceWizard |

**Keyboard shortcuts:** j/k (navigate), e (edit stage), c (add note), / (focus search)

---

### Module 4: AI Voice Agent Control Panel (M3 — Admin only)
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | /voice-agent/health | Live metrics snapshot |
| GET | /voice-agent/personas | Reshma/Karthik configs |
| PATCH | /voice-agent/personas/:id | Update voice ID, fallback voice |
| GET | /voice-agent/prompts/:personaId | Version list |
| POST | /voice-agent/prompts/:personaId | Create new prompt version |
| POST | /voice-agent/prompts/:personaId/activate | Promote to prod (confirm modal required) |
| POST | /voice-agent/prompts/:personaId/ab-test | Start A/B test with split % |
| GET | /calls | Filterable call log (all tenants for Admin) |
| GET | /calls/:id | Audio + transcript + LLM analysis |
| POST | /calls/:id/qa-review | Manual rubric score |
| GET | /voice-agent/settings | Business hours, cap, DND, retry cadence |
| PATCH | /voice-agent/settings | Update settings |

**Vapi Webhook Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/webhooks/vapi/function-call | Live tool-calls during call (< 300ms) |
| POST | /api/webhooks/vapi/end-of-call | Final report → S3 recording upload |
| POST | /api/webhooks/vapi/status | Call status transitions |

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /voice-agent/dashboard | VADashboard | HealthCards, CallVolume chart, CostBurn |
| /voice-agent/personas | PersonasPage | PersonaCard with voice ID + test button |
| /voice-agent/prompts | PromptsPage | VersionList, PromptEditor, DiffView, ABTestConfig |
| /voice-agent/calls | CallLogPage | SearchableCallTable |
| /voice-agent/calls/[id] | CallDetailPage | AudioPlayer (wavesurfer), TranscriptView, LLMAnalysisPanel, RubricScorer |
| /voice-agent/qa | QADashboard | SamplingControls, ReviewerAssignment, QAQueue |
| /voice-agent/settings | VASettingsPage | BusinessHoursEditor, CapSlider, DNDPolicy, RetryEditor |

**UX rule:** "Promote to prod" shows confirmation modal → default CTA is "Run A/B test instead", not "Promote"

---

### Module 5: Appointment Calendar (M4)
**Agents:** DATABASE-AGENT + BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | /appointments | By date range + engineerId |
| POST | /appointments | Create (manual or AI tool-call, < 300ms via Redis availability) |
| PATCH | /appointments/:id | Reschedule, update notes |
| POST | /appointments/:id/confirm | Mark confirmed |
| POST | /appointments/:id/no-show | Triggers Reshma re-engagement |
| POST | /appointments/:id/complete | With post-survey notes |
| DELETE | /appointments/:id | Soft cancel with reason |
| GET | /engineers/availability | Capacity heatmap data |

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /appointments | CalendarPage | FullCalendar.io React, DayWeekMonth views, EngineerPanel, HeatmapOverlay, DragReschedule |

**Critical:** `POST /appointments` from Vapi tool-call must respond in < 300ms. Use Redis-cached availability, not DB query on hot path.

---

### Module 6: Teams & Lead Routing (M5)
**Agents:** DATABASE-AGENT + BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | /teams | List teams |
| POST | /teams | Create team (Admin only) |
| PATCH | /teams/:id | Update team |
| DELETE | /teams/:id | Remove team |
| GET | /teams/:id/members | List members |
| POST | /teams/:id/members | Add user |
| DELETE | /teams/:id/members/:userId | Remove user |
| GET | /routing-rules | Ordered routing rules list |
| POST | /routing-rules | Create rule |
| PATCH | /routing-rules/:id | Update rule (reorder, edit condition) |

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /teams | TeamsPage | TeamList, MemberPanel, RoutingRuleEditor (drag-to-reorder) |

---

### Module 7: Franchise Governance (M6 — Admin only)
**Agents:** DATABASE-AGENT + BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | /franchises | All franchises list |
| POST | /franchises | Onboarding wizard step 1 |
| GET | /franchises/:id | Detail |
| PATCH | /franchises/:id | Update KYC, contract, territory, tier |
| POST | /franchises/:id/credentials | Provision Tenant + FRANCHISE_OWNER User |
| POST | /franchises/:id/suspend | { reason, until? } |
| POST | /franchises/:id/terminate | { reason, dataExportRequested } |
| GET | /franchises/:id/scorecard | KPIs vs network benchmarks |
| GET | /franchises/:id/audit-trail | Audit log for franchise |
| POST | /franchises/broadcast | Send announcement |
| POST | /franchises/:id/commission-slabs | Custom override |

**Onboarding wizard (8 steps):**
1. Basics (name, contact, GST, territory)
2. KYC documents upload (PAN, GST cert, address proof) → S3
3. Contract (load template → e-sign via Digio)
4. Bank details for payouts
5. Commission slab assignment
6. Lead source connections
7. Training module assignment
8. Credential provisioning (creates Tenant + FRANCHISE_OWNER User)

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /franchises | FranchisesPage | FranchiseList, StatusBadge |
| /franchises/new | OnboardingWizard | 8-step WizardStepper |
| /franchises/[id] | FranchiseDetailPage | Tabs: Overview, KYC, Contract, Commission, Scorecard, AuditTrail |

---

### Module 8: Franchise Leads (F2 — same /leads route, tenant-scoped)
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

Same endpoints and UI as Module 3 — RLS automatically scopes to franchise tenant.

Additional source-connection endpoints:
| Method | Path | Description |
|--------|------|-------------|
| GET | /lead-sources | Connected sources |
| POST | /lead-sources/meta/oauth-start | Returns Meta OAuth URL |
| POST | /lead-sources/meta/oauth-callback | Exchange code, store token |
| POST | /lead-sources/indiamart | { apiKey } |
| POST | /lead-sources/justdial | { webhookSecret } |
| POST | /lead-sources/website | Returns embeddable JS snippet |
| DELETE | /lead-sources/:id | Disconnect source |
| POST | /lead-sources/:id/test | Trigger test webhook |

---

### Module 9: Franchise Earnings & Coach Tips (F3)
**Agents:** DATABASE-AGENT + BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | /commissions | Commission ledger |
| GET | /commissions/:id | Detail with deal breakdown |
| GET | /payouts | Payout history |
| GET | /payouts/:id | UTR, included commissions |
| GET | /earnings/forecast | 60-day forward projection |
| GET | /earnings/coach-tips | 8 deterministic tips (not LLM) |
| GET | /earnings/tax-certificates | Auto-generated PDFs |
| POST | /payouts/instant-request | Instant payout (wallet feature-flagged) |

**Coach Tips engine** (`packages/shared/src/coach-tips.ts`):
Pure function `generateTips(franchiseMetrics, networkBenchmarks): Tip[]` — 8 deterministic rules (no LLM): slow AI handoff response, low ad spend, pending quotations, slow WhatsApp dispatch, referral bonus distance, tier upgrade distance, untrained members, low review rate.

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /earnings | EarningsPage | CommissionTable, PayoutHistory, ForecastChart (Recharts), CoachTipsCards |

---

### Module 10: Quotation Builder (F5)
**Agents:** DATABASE-AGENT + BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | /quotations | List |
| POST | /quotations | Create (lead facts pre-filled) |
| GET | /quotations/:id | Detail |
| PATCH | /quotations/:id | Update |
| POST | /quotations/:id/render-pdf | Enqueue to pdf-render queue → return S3 key |
| POST | /quotations/:id/send | { via: 'WHATSAPP'|'EMAIL', recipient } |
| GET | /product-catalogue | System sizes, brands, current prices |

PDF: Puppeteer + Handlebars template with Excess branding, Tamil-safe fonts, memory-bounded Lambda container.

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /quotations | QuotationsPage | QuotationList, QuotationBuilder (auto-calculates subsidy/EMI/payback), PDFPreview |

---

### Module 11: Support Tickets & KB (F4)
**Agents:** DATABASE-AGENT + BACKEND-AGENT + FRONTEND-AGENT

**Backend Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | /tickets | Franchise's tickets |
| POST | /tickets | Create with SLA set on creation |
| GET | /tickets/:id | Detail |
| POST | /tickets/:id/messages | Thread reply |
| PATCH | /tickets/:id | Update (role-gated fields) |
| POST | /tickets/:id/satisfaction | { rating, comment } |
| GET | /kb | KB article index |
| GET | /kb/:slug | KB article |

SLA: BullMQ job at slaDueAt-15min (warning), at slaDueAt (escalate to ops lead).

**Frontend Pages:**
| Route | Page | Components |
|-------|------|------------|
| /support | SupportPage | TicketList, CreateTicketForm, ThreadView |
| /kb | KBPage | ArticleIndex, ArticleReader (Tamil/English toggle) |

---

### Module 12: Lead Source Webhooks (Backend only)
**Agents:** BACKEND-AGENT

All handlers: verify HMAC → respond 200 OK → enqueue to `lead-ingest`.

| Method | Path | Source | Signature |
|--------|------|--------|-----------|
| POST | /api/webhooks/meta | Meta Lead Ads | X-Hub-Signature-256 HMAC-SHA256 |
| POST | /api/webhooks/indiamart | IndiaMART | X-Excess-Signature shared secret |
| POST | /api/webhooks/justdial | JustDial | Bearer token per tenant |
| POST | /api/webhooks/website | Website embed | HMAC-signed body, tenant-specific secret |
| POST | /api/webhooks/whatsapp | WhatsApp inbound | X-Hub-Signature-256 |
| POST | /api/leads/manual | Manual entry | Authenticated session |

**Deduplication:** same phone within 90 days → append LeadActivity, skip new lead creation.

---

### Module 13: WhatsApp Business API
**Agents:** BACKEND-AGENT

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/whatsapp/send | { leadId, templateName?, templateParams?, freeFormText?, mediaUrl? } |

6 pre-approved templates: welcome_catalogue_v1, appointment_confirmation_v1, appointment_reminder_24h_v1, quotation_sent_v1, payment_link_v1, review_request_v1.

Session window: free-form allowed within 24h of last customer message; template-only outside.

---

### Module 14: Background Workers
**Agents:** BACKEND-AGENT

Location: `apps/worker/src/jobs/`

| Queue | File | Purpose | Concurrency |
|-------|------|---------|-------------|
| lead-ingest | lead-ingest.ts | Normalise, dedup, insert, enqueue voice-dial | 50 |
| voice-dial | voice-dial.ts | DND → hours → cap → dedup → Vapi dial | 20 |
| voice-followup | voice-followup.ts | Scheduled retry calls per cadence | 20 |
| whatsapp-send | whatsapp-send.ts | Outbound WhatsApp via Meta Cloud API | 30 |
| sms-send | sms-send.ts | Outbound SMS via Exotel | 30 |
| pdf-render | pdf-render.ts | Puppeteer quotation PDFs | 5 |
| s3-upload | s3-upload.ts | Recording + asset uploads | 10 |
| metrics-rollup | metrics-rollup.ts | Hourly + nightly aggregation | 2 |
| coach-tips-refresh | coach-tips-refresh.ts | Nightly franchise tips via generateTips() | 5 |
| qa-llm-judge | qa-llm-judge.ts | Nightly call QA scoring via Claude API | 10 |
| indiamart-pull | indiamart-pull.ts | 5-min fallback pull per active tenant | 1 |
| sla-watcher | sla-watcher.ts | Ticket SLA escalation | 1 |

**Failure handling:** exponential backoff (5s, 30s, 5min, 1hr, 6hr, 24hr) → after 6 failures → dead-letter queue + PagerDuty alert.

---

### Module 15: Additional Franchise Modules (Phase 7)
**Agents:** BACKEND-AGENT + FRONTEND-AGENT

| Module | Route | Description |
|--------|-------|-------------|
| Marketing Library | /marketing-library | Asset browser, Meta ad launcher, WhatsApp co-branded share |
| Training Hub | /training | Video player (S3+CloudFront), quiz (JSON+React), certifications |
| Co-Marketing | /co-marketing | Co-branded campaign management |
| Referrals | /referrals | Customer + franchise referral tracking |
| Leaderboard | /leaderboard | Network-wide rankings |
| Reviews | /reviews | Post-installation review collection automation |
| Inventory | /inventory | Solar component inventory snapshots |
| Wallet | /wallet | Instant payout requests (feature-flagged) |

---

## PHASE EXECUTION PLAN

Build in phase order. **Do not skip phases.** Each phase has a demo deliverable.

---

### Phase 0 — Foundation (Week 1)
**4 agents in parallel**

**DATABASE-AGENT tasks:**
- `pnpm-workspace.yaml`, `turbo.json` — monorepo setup
- `packages/db/schema.prisma` — full schema (all 20+ tables)
- Migration `001_init` — all tables with indexes and FK constraints
- Migration `002_rls_policies` — RLS enable + policies + FORCE for every business table
- `packages/db/src/with-tenant.ts` — `withTenantContext()` implementation
- `packages/db/tests/tenant-isolation.test.ts` — cross-tenant leak tests

**BACKEND-AGENT tasks:**
- `apps/api/src/server.ts` — Fastify server bootstrap
- `apps/api/src/plugins/auth.ts` — session preHandler plugin
- `apps/api/src/plugins/tenant-context.ts` — DB context plugin
- `packages/config/env.ts` — Zod env validator
- `packages/shared/src/permissions.ts` — PERMS map + `can()`
- Auth routes: `/auth/login`, `/auth/2fa/*`, `/auth/logout`, `/auth/me`, `/auth/forgot-password`, `/auth/reset-password`
- `apps/worker/src/server.ts` — BullMQ worker bootstrap

**FRONTEND-AGENT tasks:**
- `apps/web/` — Next.js 15 App Router scaffold
- `apps/web/app/middleware.ts` — role-aware route guarding
- `apps/web/app/(auth)/` — login, 2fa, forgot-password pages
- `apps/web/app/(app)/layout.tsx` — authenticated shell (sidebar, topbar, role-aware nav)
- `packages/ui/tokens.ts` — design tokens (colors, spacing)
- `packages/ui/` — base shadcn components

**DEVOPS-AGENT tasks:**
- `docker-compose.yml` — postgres, redis, mailhog
- `tsconfig.base.json`, `eslint.config.mjs`, `prettier.config.cjs`
- `.github/workflows/ci.yml` — lint + typecheck + unit + integration
- `infra/cdk/lib/excess-crm-stack.ts` — VPC + ECS + RDS + Redis skeleton
- `.env.example` — all variables documented

**Validation Gate 0:**
```bash
pnpm install                          # workspace installs without errors
docker-compose up -d                  # postgres + redis start
pnpm --filter @excess/db prisma migrate dev --name init
pnpm --filter @excess/db test         # tenant-isolation.test.ts passes
pnpm --filter api dev                 # Fastify starts on :8000
curl http://localhost:8000/health     # 200 OK
pnpm --filter web dev                 # Next.js starts on :3000
# Admin login → empty dashboard → franchise login → sees only own empty state
```

---

### Phase 1 — Lead Capture & Manual Workflow (Weeks 2–3)
**Database + Backend + Frontend in parallel, then integrate**

**DATABASE-AGENT tasks:**
- Seed: HQ tenant, 2 franchise tenants, test users per role
- Test data: 1000 leads across both franchises for UI development

**BACKEND-AGENT tasks:**
- Lead CRUD: GET /leads (all filters), GET /leads/:id, PATCH /leads/:id
- POST /leads/:id/notes, POST /leads/:id/assign
- Webhook handlers: /api/webhooks/meta, /indiamart, /justdial, /website, /whatsapp
- Webhook deduplication logic (90-day phone window)
- POST /api/leads/manual
- Lead source connect/disconnect endpoints
- AuditLog middleware (auto-log every PATCH/POST on business entities)
- `apps/worker/src/jobs/lead-ingest.ts` — normalise, dedup, insert

**FRONTEND-AGENT tasks:**
- /leads — VirtualisedLeadList (TanStack Table, 100k rows), FilterSidebar (15+ filters), MasterDetail layout
- /leads/[id] — tabs: Overview, ActivityTimeline, Files
- /leads/sources — ConnectSourceWizard (Meta OAuth, IndiaMART, JustDial, website snippet)
- Saved views dropdown + "Save this view" button

**Validation Gate 1:**
```bash
pnpm lint && pnpm typecheck           # zero errors
# Simulate Meta webhook → lead appears in /leads within 3s
# Send same webhook twice → only 1 lead created
# Bad HMAC → 401, no DB write
# Franchise A user tries GET /leads for Franchise B lead → 0 results (RLS)
pnpm --filter api test:api            # all endpoint tests pass
```

---

### Phase 2 — Voice Agent: Reshma Verification (Weeks 4–5)
**Backend + Frontend in parallel**

**BACKEND-AGENT tasks:**
- Vapi assistant setup (Reshma-Verify): assistant ID, phone number ID, prompt from `packages/voice-agent/prompts/reshma-verify.md`
- `apps/worker/src/jobs/voice-dial.ts` — full gates: DND → business hours → daily cap → dedup → Vapi dial
- Vapi webhook handlers: function-call (< 300ms), end-of-call (S3 upload), status
- Tool handler implementations: update_fact_sheet, classify_lead, schedule_followup, send_whatsapp_catalogue, mark_dnd, escalate_to_human, end_call
- Call recording: download from Vapi CDN → upload to S3 → presigned URL on fetch
- LLM-as-Judge: `apps/worker/src/jobs/qa-llm-judge.ts` — nightly Claude API scoring
- Retry cadence scheduler (NOT_ANSWERED → Day1/Day2/Day3 schedule via BullMQ delayed jobs)

**FRONTEND-AGENT tasks:**
- /leads/[id] — Conversation tab: wavesurfer.js waveform player + transcript viewer (click line → seek audio)
- /voice-agent/dashboard — health metrics (speed-to-lead p95, MOS, bot-rate, cost)
- /voice-agent/calls — searchable call log
- /voice-agent/calls/[id] — audio + transcript + LLM analysis

**Validation Gate 2:**
```bash
# Pilot lead → AI rings within 5s (mock staging with real Vapi test mode)
# function-call webhook latency < 300ms p95
# Recording in S3 within 60s of call end
# DND number → voice-dial worker skips, logs DND_BLOCKED
# Off-hours lead → BullMQ deferred to next 09:00
pnpm test                             # all tests pass
```

---

### Phase 3 — Voice Agent: Karthik Sales + Follow-up (Week 6)
**Backend + Frontend in parallel**

**BACKEND-AGENT tasks:**
- Karthik-Sales assistant configured (voice cloned, prompt from `packages/voice-agent/prompts/karthik-sales.md`)
- Reshma-FollowUp assistant configured
- Persona-to-persona handoff: QUALIFIED → enqueue Karthik +30min warm window
- Full retry cadences per persona (see build spec §10.6)
- A/B test infrastructure for prompt versions (split % in VoiceAgentConfig)
- POST /voice-agent/prompts/:personaId/activate confirm-modal enforcement

**FRONTEND-AGENT tasks:**
- /voice-agent/personas — PersonaCard with voice ID + live test button
- /voice-agent/prompts — PromptEditor with version history, diff view, A/B config
- /voice-agent/qa — QA dashboard with sampling controls, rubric scorer
- /voice-agent/settings — Business hours editor, daily cap slider, DND policy

**Validation Gate 3:**
```bash
# End-to-end demo: lead → Reshma → QUALIFIED → Karthik (+30min) → appointment booked → human assigned
# "Promote to prod" shows confirm modal, default CTA = "Run A/B test"
# A/B test routes 50% to each prompt version (verified in call log)
```

---

### Phase 4 — Appointments + Teams (Week 7)
**Backend + Frontend in parallel**

**BACKEND-AGENT tasks:**
- Appointment CRUD endpoints (all 8)
- Fast-path: Redis-cached engineer availability for < 300ms booking response
- schedule_appointment Vapi tool handler wired to fast-path
- Team + RoutingRule CRUD endpoints
- Lead auto-assignment engine (routing rules evaluation on new lead ingest)
- POST /appointments/:id/no-show → enqueue Reshma re-engagement

**FRONTEND-AGENT tasks:**
- /appointments — FullCalendar.io integration, Day/Week/Month views, drag-to-reschedule, EngineerCapacityPanel, HeatmapOverlay
- /teams — TeamList, MemberPanel, RoutingRuleEditor with drag-to-reorder priority

**Validation Gate 4:**
```bash
# During live Karthik call: customer agrees to survey → appointment auto-created → engineer notified
# POST /appointments p95 latency < 300ms (load test with Redis warm)
# Drag-to-reschedule triggers WhatsApp template to customer
# Routing rule: pincode in list → auto-assigns to correct team
```

---

### Phase 5 — Franchise Workspace (Weeks 8–9)
**Backend + Frontend in parallel**

**BACKEND-AGENT tasks:**
- Franchise governance: all 11 endpoints including 8-step onboarding
- Digio e-sign integration (contract step)
- Commission + Payout CRUD
- Earnings forecast algorithm (60-day projection)
- Coach tips engine (`packages/shared/src/coach-tips.ts`) — 8 deterministic rules
- `apps/worker/src/jobs/coach-tips-refresh.ts` — nightly recalculation
- Support ticket CRUD + KB article endpoints
- SLA enforcement: `apps/worker/src/jobs/sla-watcher.ts`
- Tax certificate PDF generation

**FRONTEND-AGENT tasks:**
- /franchises — list + 8-step OnboardingWizard
- /franchises/[id] — detail tabs (Overview, KYC, Contract, Commission, Scorecard, AuditTrail)
- /earnings — CommissionTable, PayoutHistory, ForecastChart, CoachTipsCards
- /support — TicketList, CreateForm, ThreadView
- /kb — ArticleIndex, ArticleReader (Tamil/English)
- Franchise dashboard variant (/dashboard with earnings + tier progress)

**Validation Gate 5:**
```bash
# Onboard new franchise end-to-end: basics → KYC upload → contract → bank → commissions → source connect → training → credentials
# Franchise connects Meta OAuth → mock webhook → leads route correctly
# Coach tips generated for fresh franchise (no historical data) — no crash
# SLA escalation fires within 30s of due time (fast-clock test)
# Franchise A URL-hacking to Franchise B lead → 0 results / 404
```

---

### Phase 6 — Sales Enablement Suite (Weeks 10–11)
**Backend + Frontend in parallel**

**BACKEND-AGENT tasks:**
- Quotation CRUD + PDF render queue + send API
- `apps/worker/src/jobs/pdf-render.ts` — Puppeteer + Handlebars (Tamil-safe)
- Product catalogue API
- WhatsApp Business API: all 6 template sends + session window enforcement
- Marketing library: asset CRUD, Meta ad launcher, WhatsApp co-branded share
- Training hub: module CRUD, progress tracking, quiz scoring, certification

**FRONTEND-AGENT tasks:**
- /quotations — QuotationBuilder with auto-calculations, PDFPreview, send buttons
- /marketing-library — AssetBrowser, MetaAdLauncher
- /training — ModuleList, VideoPlayer, Quiz (JSON-driven), CertificateView

**Validation Gate 6:**
```bash
# Franchise user generates quotation → renders PDF with Tamil characters correctly → sends via WhatsApp → activity logged in lead timeline
# Training video plays from CloudFront presigned URL
# Quiz submit → score calculated → certification issued if pass
# WhatsApp free-form blocked outside 24h session window with clear error
```

---

### Phase 7 — Network Effects (Week 12)
**Backend + Frontend in parallel**

**BACKEND-AGENT tasks:**
- Co-marketing, referral, leaderboard, review, inventory, wallet endpoints
- Review request automation trigger (post-installation Appointment.complete event)
- Referral tracking (customer + franchise referrals with attribution)

**FRONTEND-AGENT tasks:**
- /co-marketing, /referrals, /leaderboard, /reviews, /inventory, /wallet pages

**Validation Gate 7:**
```bash
# End-to-end referral flow: referral link → new lead → conversion → referral commission
# Review request WhatsApp fires after appointment marked complete
# Leaderboard rankings update correctly after new conversion
```

---

### Phase 8 — Hardening & Launch (Weeks 13–14)
**TEST-AGENT + REVIEW-AGENT + DEVOPS-AGENT**

**TEST-AGENT tasks:**
- All 10 critical E2E flows (Playwright) — see build spec §15.2
- k6 load test: 50 leads/sec for 10 min, all p95 latencies within budget
- Coverage report: ≥ 80% in packages/shared, ≥ 70% overall
- Voice agent: Vapi webCall test mode for all prompt versions

**REVIEW-AGENT tasks:**
- Cross-tenant RLS leak test on every business table
- `can()` permission check audit — every protected handler
- PII logging audit — no phone/email/name in clear text logs
- Secrets audit — nothing hardcoded, all in Secrets Manager
- TRAI compliance: verify business hours gate + DND scrub on all outbound call paths
- DPDP compliance: data retention hooks, consent tracking, erasure path

**DEVOPS-AGENT tasks:**
- CDK stack: full prod topology (VPC, ALB, ECS Fargate ×3, RDS Aurora, ElastiCache, S3 ×4, CloudFront, Route 53, WAF, Secrets Manager)
- Blue/green deploy pipeline in GitHub Actions
- Datadog dashboard `Excess CRM — Health` with all critical metrics
- PagerDuty alerts: SEV-1 (API error >2%, voice-dial queue >500 backlog, DB CPU >85%), SEV-2 (webhook 5xx >1%, dial-latency p95 >10s)
- DR runbook + first drill scheduled

**Validation Gate 8 (Launch checklist):**
```bash
# All 10 E2E flows pass on staging
pnpm test                             # full suite green
# k6: 50 leads/sec × 10 min — zero errors, p95 within SLA
# Security pen test (external vendor) — no critical/high findings
# CDK diff reviewable — no manual infra changes
# Blue/green deploy + rollback verified in staging
# All secrets in Secrets Manager — git history scan clean
# Datadog dashboard live with all metrics
# Tamil UI renders without truncation across all pages
# Mobile experience at 360px passes for franchise dashboard
```

---

### Phase 9 — Post-launch Tuning (Weeks 15–16)
**All agents on-call, minor improvements only**

- Real-data prompt tuning (Reshma naturalness, Karthik close rate)
- Coach tips refinement from actual franchise data
- Performance regression hunting from Datadog APM
- Hand-over to long-term support model

---

## VALIDATION GATES SUMMARY

| Gate | Phase | Key Commands |
|------|-------|-------------|
| 0 | Foundation | `pnpm install`, `prisma migrate dev`, tenant-isolation.test.ts passes, Fastify + Next.js start |
| 1 | Lead Capture | `pnpm lint && pnpm typecheck`, Meta webhook → lead in 3s, dedup works, RLS enforced |
| 2 | Reshma AI | Voice-dial < 5s p95, function-call < 300ms, recording in S3 < 60s, DND blocked |
| 3 | All 3 Personas | E2E flow: lead → Reshma → Karthik → appointment, A/B test working |
| 4 | Appointments | Booking < 300ms p95 (load tested), calendar UI, routing rules working |
| 5 | Franchise | Onboarding wizard, source OAuth, SLA escalation, cross-tenant isolation |
| 6 | Sales Suite | Quotation PDF with Tamil, WhatsApp send, training quiz |
| 7 | Network | Referral flow, review automation |
| 8 (Launch) | Hardening | All 10 E2E pass, k6 load test, pen test, CDK prod deployed |

---

## AGENT DISPATCH TEMPLATES

### DATABASE-AGENT
```yaml
TO: DATABASE-AGENT
SKILLS: skills/DATABASE.md
CONTEXT:
  - packages/db/schema.prisma (Prisma schema)
  - Build spec §5 (DB schema + RLS)
RULES:
  - Every table needs tenant_id, created_at, updated_at
  - Every table needs RLS policies (admin bypass + tenant isolation)
  - FORCE ROW LEVEL SECURITY on every business table
  - Cross-tenant isolation test for every new table
```

### BACKEND-AGENT
```yaml
TO: BACKEND-AGENT
SKILLS: skills/BACKEND.md
CONTEXT:
  - apps/api/src/server.ts (Fastify setup)
  - packages/shared/src/permissions.ts (can() helper)
  - packages/db/src/with-tenant.ts (withTenantContext)
  - Build spec §7 (API conventions)
RULES:
  - Every handler uses withTenantContext()
  - Every protected handler calls can() before business logic
  - Every log line includes tenantId/userId/requestId
  - Webhook handlers: verify HMAC → 200 OK immediately → enqueue
  - Standard response shape: { data, meta? } success / { error: { code, message } } failure
```

### FRONTEND-AGENT
```yaml
TO: FRONTEND-AGENT
SKILLS: skills/FRONTEND.md
CONTEXT:
  - apps/web/app/(app)/layout.tsx (authenticated shell)
  - packages/ui/tokens.ts (design tokens)
  - Build spec §13 (frontend architecture)
RULES:
  - Desktop-first for HQ; mobile-first for franchise (360px, 768px, 1280px, 1920px)
  - Tamil + English via next-intl, cookie-switched
  - Indian number format: 1,23,456
  - All interactive elements keyboard navigable
  - ARIA labels on icon-only buttons
  - Loading + empty + error states always designed
```

### DEVOPS-AGENT
```yaml
TO: DEVOPS-AGENT
SKILLS: skills/DEPLOYMENT.md
CONTEXT:
  - infra/cdk/ (AWS CDK stacks)
  - Build spec §16 (deployment + infrastructure)
RULES:
  - All infra in CDK TypeScript — no manual AWS console changes
  - All secrets in AWS Secrets Manager
  - Blue/green deploys with automated rollback on smoke failure
  - ap-south-1 (Mumbai) — data residency
```

### TEST-AGENT
```yaml
TO: TEST-AGENT
SKILLS: skills/TESTING.md
CONTEXT:
  - Build spec §15 (testing strategy + 10 critical E2E flows)
RULES:
  - Unit: Vitest, ≥ 80% coverage in packages/shared
  - Integration: Vitest + testcontainers, RLS cross-tenant leak test per table
  - API: Supertest, happy + auth + validation + permission paths
  - E2E: Playwright, all 10 critical flows
  - Load: k6, 50 leads/sec for 10 min
```

### REVIEW-AGENT
```yaml
TO: REVIEW-AGENT
SKILLS: skills/security-review/, skills/coding-standards/
CONTEXT:
  - Build spec §18 (definition of done)
RULES:
  - Cross-tenant leak test for every new business table
  - can() audit: every handler must have permission check
  - PII audit: phone/email/name must not appear in logs
  - Secrets audit: grep for hardcoded keys, tokens, passwords
  - TRAI: verify DND scrub + business hours gate on all outbound call paths
  - DPDP: verify data retention policy implementation
```

---

## ENVIRONMENT VARIABLES

```env
# App
NODE_ENV=development|staging|production
APP_URL=https://app.excessindia.com
API_URL=https://api.excessindia.com
LOG_LEVEL=info

# Database
DATABASE_URL=postgres://user:pass@host:5432/excess_crm?schema=public
DATABASE_URL_REPLICA=postgres://...

# Redis
REDIS_URL=redis://default:pass@host:6379

# Auth
SESSION_SECRET=<64-byte random hex>
COOKIE_DOMAIN=.excessindia.com

# AWS
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_RECORDINGS=excess-crm-recordings
S3_BUCKET_QUOTATIONS=excess-crm-quotations
S3_BUCKET_ASSETS=excess-crm-assets

# Voice Agent (Vapi)
VAPI_API_KEY=...
VAPI_WEBHOOK_SECRET=<HMAC secret>
VAPI_PHONE_NUMBER_ID_RESHMA_VERIFY=...
VAPI_PHONE_NUMBER_ID_KARTHIK_SALES=...
VAPI_PHONE_NUMBER_ID_RESHMA_FOLLOWUP=...
VAPI_ASSISTANT_ID_RESHMA_VERIFY=...
VAPI_ASSISTANT_ID_KARTHIK_SALES=...
VAPI_ASSISTANT_ID_RESHMA_FOLLOWUP=...

# Telephony (Exotel)
EXOTEL_ACCOUNT_SID=...
EXOTEL_API_KEY=...
EXOTEL_API_TOKEN=...
EXOTEL_SUBDOMAIN=...
EXOTEL_VIRTUAL_NUMBER=...

# ElevenLabs
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID_RESHMA=...
ELEVENLABS_VOICE_ID_KARTHIK=...

# LLM
ANTHROPIC_API_KEY=...

# Meta
META_APP_ID=...
META_APP_SECRET=...
META_WEBHOOK_VERIFY_TOKEN=<random>
META_WEBHOOK_APP_SECRET=<HMAC>
WHATSAPP_BUSINESS_ACCOUNT_ID=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...

# IndiaMART (per-tenant keys in DB, not env)
INDIAMART_PULL_FALLBACK_INTERVAL_MIN=5

# Google Maps
GOOGLE_MAPS_API_KEY=...

# Email
RESEND_API_KEY=...
FROM_EMAIL=noreply@excessindia.com

# Observability
DATADOG_API_KEY=...
SENTRY_DSN=...

# Feature flags
ENABLE_AI_DIAL=true
DAILY_AI_CALL_CAP=2000
BUSINESS_HOURS_START=09:00
BUSINESS_HOURS_END=21:00
DEFAULT_TIMEZONE=Asia/Kolkata
```

---

## CRITICAL PERFORMANCE TARGETS

| Metric | Target | Measurement |
|--------|--------|-------------|
| Speed-to-lead (AI dials) | < 5 seconds p95 | Measured webhook receipt → Vapi call initiated |
| Vapi function-call response | < 300ms p95 | Measured at /api/webhooks/vapi/function-call |
| Appointment booking | < 300ms p95 | Load test POST /appointments |
| Webhook 200 OK response | < 100ms p95 | All webhook endpoints |
| Dashboard load | < 800ms p95 | Staging Lighthouse |
| Leads list (100k rows) | No UX degradation | VirtualisedTable, no full-table scan |
| Webhook reliability | ≥ 99.5% within 30s | Delivered end-to-end |
| System uptime | 99.9% | Measured monthly |
| Load test | 50 leads/sec × 10 min | k6, zero errors |

---

## OPEN QUESTIONS (OPEN_QUESTIONS.md)

These require Excess stakeholder input — log answers as they arrive:

1. Exact pincode/district list per franchise territory
2. Commission slab: percentages by system size and product category
3. SLA times per ticket priority (P1/P2/P3/P4 hours)
4. Voice cloning consent: which two staff members provide voice samples (Reshma + Karthik real names)
5. Brand kit: final logo SVG, confirmed hex codes, font choices for quotations
6. Subsidy calculation: latest PM Surya Ghar slabs + Tamil Nadu state-specific top-up
7. Product catalogue with current prices for quotation builder
8. Bank account + GST details for franchise payout invoicing (Excess or franchise as GST vendor?)
9. Historical data migration: spreadsheets / old CRM? Volume and format?
10. Digio account setup for e-sign integration

---

## NEXT STEP

```bash
/execute-prp PRPs/excess-crm-prp.md
```

Start with Phase 0. Report back after Phase 0 foundation is laid.
