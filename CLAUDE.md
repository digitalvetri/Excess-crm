# CLAUDE.md - Excess CRM Project Rules

> Project-specific rules for Claude Code. This file is read automatically on every session.
> Build spec: `EXCESS-CRM-BUILD-SPEC.md` (the source of truth — when this file disagrees with your training, the spec wins).

---

## Project Overview

**Product:** Excess CRM — production multi-tenant CRM with AI Voice Agent
**Client:** Excess Renew Tech Pvt Ltd, Coimbatore (solar company, 500+ installations since 2009)
**Delivered by:** DigitalVetri
**Timeline:** 14–16 weeks, 9 phases
**Status:** Greenfield build

**Tech Stack:**
- Backend: Node.js 20 LTS + TypeScript (strict) + Fastify 4
- Frontend: Next.js 15 (App Router) + React 19 + TypeScript
- Database: PostgreSQL 16 (AWS RDS Aurora) + RLS
- ORM: Prisma 5
- Cache / Queue: Redis 7 + BullMQ
- Auth: Lucia Auth v3 + session table
- UI: shadcn/ui + Tailwind CSS v4
- Monorepo: pnpm workspaces + Turborepo

---

## Project Structure

```
excess-crm/
├── apps/
│   ├── web/                    # Next.js 15 — HQ + Franchise UI (role-aware)
│   ├── api/                    # Fastify API server
│   ├── worker/                 # BullMQ background workers
│   └── mobile/                 # (Phase 9+) React Native engineer app
├── packages/
│   ├── db/                     # Prisma schema, migrations, RLS SQL
│   ├── shared/                 # Zod schemas, types, constants, permissions
│   ├── voice-agent/            # Vapi prompts, persona configs, tool definitions
│   ├── integrations/           # Meta, IndiaMART, JustDial, WhatsApp adapters
│   ├── ui/                     # shadcn components, design tokens
│   └── config/                 # Shared ESLint, TS, Tailwind configs
├── infra/                      # AWS CDK stacks
├── scripts/                    # seed, backfill one-off scripts
├── .github/workflows/          # CI/CD
├── docker-compose.yml          # Local dev: postgres, redis, mailhog
├── turbo.json
├── pnpm-workspace.yaml
└── OPEN_QUESTIONS.md           # Ambiguities — log here, don't block
```

---

## Naming Conventions

| Thing | Convention | Example |
|-------|------------|---------|
| Files | `kebab-case.ts` | `voice-dial.ts` |
| Components | `PascalCase.tsx` | `LeadCard.tsx` |
| Hooks | `useCamelCase.ts` | `useLeadFilters.ts` |
| Server actions / API routes | verb-first | `createLead`, `assignLead` |
| DB tables | `snake_case`, plural | `leads`, `call_recordings` |
| DB columns | `snake_case` | `tenant_id`, `created_at` |
| TS types | `PascalCase`, no `I` prefix | `Lead`, `UserRole` |
| Zod schemas | `pascalCaseSchema` | `leadSchema`, `createLeadSchema` |

---

## Code Standards

### TypeScript (everywhere)

```typescript
// ALWAYS strict mode — no any. Use unknown + narrowing.
// ALWAYS define interfaces for all data shapes
interface Lead {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  stage: LeadStage;
  // ...
}

// Zod schemas live in packages/shared/src/schemas/<entity>.ts
// imported by BOTH api and web apps — single source of truth
import { leadSchema } from '@excess/shared/schemas/lead';

// Every async function must handle errors; never swallow them
const fetchLead = async (id: string): Promise<Lead> => {
  const result = await db.lead.findUniqueOrThrow({ where: { id } });
  return result;
};
```

### Database — MANDATORY RULES

```typescript
// EVERY db query must use withTenantContext(). NO EXCEPTIONS.
// Even if you think you don't need it.
await withTenantContext(prisma, { tenantId, role, userId }, async (tx) => {
  return tx.lead.findMany({ where: { stage: 'NEW' } });
});

// Never use prisma directly outside withTenantContext in business logic
// Exception: auth queries (sessions, users by email) — these are pre-auth
```

### API Handlers (Fastify)

```typescript
// EVERY protected handler must call can() before any business logic
app.get('/leads', async (req, reply) => {
  if (!can(req.auth.role, 'leads.read.own')) {
    return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
  }
  // ... rest of handler
});

// Standard success response shape
return reply.send({ data: leads, meta: { nextCursor, total } });

// Standard error response shape
return reply.code(404).send({ error: { code: 'leads.not_found', message: 'Lead not found' } });
```

### Logging (pino — everywhere)

```typescript
// EVERY log line must include tenantId, userId, requestId
req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, leadId }, 'lead.stage_changed');

// NEVER log PII in clear text
// BAD:  req.log.info({ phone: lead.phone }, 'dialling')
// GOOD: req.log.info({ leadId: lead.id }, 'dialling')
```

---

## Forbidden Patterns

### Global
- Never use `console.log` — use pino (`req.log` in handlers, `logger` in workers)
- Never use `any` — use `unknown` with type narrowing or proper interfaces
- Never hardcode secrets — use `packages/config/env.ts` (Zod-validated at boot)
- Never commit `.env` — CI uses GitHub Secrets → AWS Secrets Manager
- Never use `SELECT *` style — Prisma `select` / `include` explicitly
- Never skip `withTenantContext()` on business-table queries
- Never skip `can()` on protected handlers
- Never use `TODO` without a linked GitHub issue number
- Never leave commented-out code

### Backend-specific
- Never skip HMAC signature verification on webhook handlers
- Never write to `audit_log` manually — use the shared `logMutation()` helper
- Never run PDF rendering in the API process — always enqueue to `pdf-render` queue
- Never store recordings locally — always upload to S3 and store only the key

### Frontend-specific
- Never use inline styles — use Tailwind utility classes
- Never fetch directly in Server Components without tenant context
- Never expose session token to client-side JS
- Never skip loading / empty / error states in UI

---

## Architecture Rules

### Multi-Tenancy (non-negotiable)
1. Every business table has `tenant_id UUID NOT NULL`
2. RLS enforced at DB layer — FORCE ROW LEVEL SECURITY on every table
3. `withTenantContext()` wraps every DB transaction — sets `app.tenant_id`, `app.role`, `app.user_id` via `SET LOCAL`
4. HQ Admin (role=ADMIN) gets DB bypass policy; all others are tenant-scoped
5. Test cross-tenant isolation on every new table — see `packages/db/tests/tenant-isolation.test.ts`

### Webhook Pattern (non-negotiable)
1. Verify HMAC signature → return 200 OK immediately → enqueue raw payload to BullMQ
2. Worker normalises + dedupes + inserts + enqueues voice-dial
3. Never do business logic synchronously in webhook handlers
4. Sources retry aggressively on 5xx — always return 200 immediately after signature check

### Voice Agent Pipeline (non-negotiable)
1. Lead arrives → `lead-ingest` queue → dedup → insert → `voice-dial` queue
2. Voice-dial worker: DND check → business hours check → daily cap check → duplicate-call check → Vapi dial
3. Vapi function-call webhook must respond in < 300ms — use Redis-cached data for fast lookups
4. Recording: download from Vapi CDN → upload to S3 → store only S3 key (never the CDN URL long-term)
5. All persona prompts live in `packages/voice-agent/prompts/` — version-controlled

### API Design
- All endpoints prefixed with `/api/v1/` (Fastify) or `/api/` (Next.js route handlers)
- Cursor pagination only — never offset
- Idempotency-Key header on all state-changing POSTs (store response 24h)
- Rate limits: 60/min (anon), 600/min (user), 100/min per tenant (webhooks)
- OpenAPI 3.1 spec auto-generated from Zod schemas — update on every endpoint change

---

## Lead Pipeline

```
NEW → QUALIFIED → FOLLOW_UP → CONVERTED
         ↓            ↓
    NOT_ANSWERED   NOT_ANSWERED
         ↓
       INVALID
         ↓
   WRONG_ENQUIRY
```

Stage transitions trigger:
- QUALIFIED → enqueue Karthik-Sales call after 30-min warm handoff
- FOLLOW_UP → enqueue Reshma-FollowUp at scheduled time
- NOT_ANSWERED → retry cadence (see retry table in build spec §10.6)
- CONVERTED → human assignment + WhatsApp + Resend email

---

## Voice Agent Retry Cadence

| Persona | Trigger | Cadence | Max |
|---------|---------|---------|-----|
| Reshma-Verify | NEW for > 0s | Immediate (< 5s) | 1 + retry at +30min |
| Reshma-Verify | NOT_ANSWERED | Day 1: +2h, +6h; Day 2: 10am, 4pm; Day 3: 11am | 5 total |
| Karthik-Sales | → QUALIFIED | +30 min | 1 + retry at +4h |
| Reshma-FollowUp | FOLLOW_UP with scheduledAt | At scheduled time | 3 with 24h gaps |

All cadences configurable per-tenant via `voice_agent_settings` table.

---

## Design Tokens

```typescript
// packages/ui/tokens.ts — Tailwind consumes these
export const colors = {
  primary:   '#0F4C81',  // Excess Solar blue
  accent:    '#F39C12',  // Solar amber
  success:   '#27AE60',  // Eco green
  danger:    '#C0392B',
  warning:   '#D68910',
  text:      '#1A1A1A',
  subtle:    '#5D6D7E',
  light:     '#F2F4F7',
  lighter:   '#FAFBFC',
};
```

---

## Environment Variables

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
SESSION_SECRET=<64-byte random>
COOKIE_DOMAIN=.excessindia.com

# AWS
AWS_REGION=ap-south-1
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

# Meta (Facebook/Instagram + WhatsApp)
META_APP_ID=...
META_APP_SECRET=...
META_WEBHOOK_VERIFY_TOKEN=<random>
META_WEBHOOK_APP_SECRET=<HMAC>
WHATSAPP_BUSINESS_ACCOUNT_ID=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_ACCESS_TOKEN=...

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

Config validated at boot via Zod in `packages/config/env.ts` — fails fast if anything missing.

---

## Development Commands

```bash
# Local setup
cp .env.example .env.local
docker-compose up -d              # postgres, redis, mailhog

# Install (pnpm only — no npm/yarn)
pnpm install

# DB
pnpm --filter @excess/db prisma migrate dev
pnpm --filter @excess/db prisma db seed

# Run all apps (Turborepo)
pnpm dev

# Individual apps
pnpm --filter web dev             # Next.js on :3000
pnpm --filter api dev             # Fastify on :8000
pnpm --filter worker dev          # BullMQ worker

# Tests
pnpm test                         # All (Vitest + Playwright)
pnpm --filter @excess/shared test # Unit tests (Vitest)
pnpm --filter api test:api        # Supertest integration
pnpm --filter web test:e2e        # Playwright E2E

# Lint + typecheck
pnpm lint
pnpm typecheck

# Build
pnpm build
```

---

## Commit Message Format

```
feat(leads): add bulk reassignment endpoint
fix(voice-agent): correct DND gate ordering
refactor(db): extract withTenantContext to shared helper
test(auth): add cross-tenant RLS leak test
chore(infra): bump ECS task memory to 2GB
```

Scope = module name (auth, leads, voice-agent, appointments, teams, franchise, earnings, quotations, tickets, webhooks, worker, db, infra, ui).

---

## Build Order (Phase-by-Phase)

Follow the build spec §17. **Do not skip phases.**

| Phase | Weeks | Key Deliverable |
|-------|-------|-----------------|
| 0 | 1 | Monorepo + auth + RLS + empty dashboard |
| 1 | 2–3 | Lead capture (all sources) + Unified Leads UI |
| 2 | 4–5 | Reshma Verification voice agent live |
| 3 | 6 | Karthik Sales + Reshma Follow-up personas |
| 4 | 7 | Appointments + Teams + human handoff |
| 5 | 8–9 | Franchise workspace end-to-end |
| 6 | 10–11 | Sales enablement (quotations, marketing, training, WhatsApp) |
| 7 | 12 | Network effects (referrals, leaderboard, reviews, wallet) |
| 8 | 13–14 | Hardening, pen test, load test, launch |
| 9 | 15–16 | Post-launch tuning + hand-over |

---

## Definition of Done (per feature)

A feature is done ONLY when ALL pass:

**Code:** TypeScript strict, no `any`, Zod schemas on all inputs, `withTenantContext` on all DB queries, `can()` on all protected handlers, pino logging with tenantId/userId/requestId, no console.log, no TODO without issue link, no commented-out code.

**Tests:** Unit (happy + 2 error paths), integration (DB with RLS verification), API (auth + validation + permission), E2E if user-facing.

**Security:** Cross-tenant leak test for new table, PII not logged, secrets via Secrets Manager, input sanitised.

**Observability:** Custom metric if revenue-relevant, Sentry wired (frontend), audit log entry for state mutations.

**UX:** Responsive at 360px / 768px / 1280px, keyboard navigable, loading + empty + error states, Tamil + English copy reviewed.

**Compliance:** DPDP retention policy, TRAI business hours + DND scrub for any outbound call feature.

---

## Open Questions

If anything in sections 5–7 of the build spec is ambiguous:
1. Log the question in `OPEN_QUESTIONS.md`
2. Choose the most reversible default
3. Continue — do not block on perfection

See `Appendix A` of the build spec for pre-identified open questions (territory lists, commission slabs, voice samples, etc.) that require Excess stakeholder input.

---

## Skills Reference

| Task | Skill to Read |
|------|---------------|
| Database models + RLS | `skills/DATABASE.md` |
| API + Auth + Fastify | `skills/BACKEND.md` |
| Next.js + shadcn/ui | `skills/FRONTEND.md` |
| Vitest + Playwright | `skills/TESTING.md` |
| Docker + CDK + CI/CD | `skills/DEPLOYMENT.md` |
| Security (OWASP + RLS) | `skills/security-review/` |
| Code quality review | `skills/coding-standards/` |

---

## Agent Coordination

For complex tasks, the ORCHESTRATOR coordinates:
- DATABASE-AGENT → Prisma schema + migrations + RLS policies
- BACKEND-AGENT → Fastify API + BullMQ workers + webhook handlers
- FRONTEND-AGENT → Next.js pages + shadcn/ui components
- TEST-AGENT → Vitest unit/integration + Supertest API + Playwright E2E
- REVIEW-AGENT → RLS leak detection + permission audit + secrets scan + TRAI/DPDP compliance
- DEVOPS-AGENT → AWS CDK + docker-compose + GitHub Actions

Read agent definitions in `/agents/` folder.
