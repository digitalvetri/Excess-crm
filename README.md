# Excess CRM

Production multi-tenant CRM with an AI voice agent, built for **Excess Renew Tech Pvt Ltd** (Coimbatore solar company, 500+ installations since 2009). Delivered by **DigitalVetri**.

> Source of truth for build rules: `CLAUDE.md` and `EXCESS-CRM-BUILD-SPEC.md`.
> Operations: `RUNBOOK.md` · Client hand-over: `HANDOFF.md` · Roadmaps: `docs/`.

## Stack

- **Backend:** Node.js 20 + TypeScript (strict) + **Fastify 4**
- **Frontend:** **Next.js 15** (App Router) + React 19 + Tailwind v4 + shadcn/ui
- **Database:** PostgreSQL 16 + **Prisma 5**, with **Row-Level Security (FORCE RLS)** for tenant isolation
- **Cache / queues:** Redis 7 + **BullMQ**
- **Auth:** session cookies (Argon2 hashing, tokens hashed at rest) + Redis-backed lockout
- **Voice agent:** **LiveKit Agents** (Python) — Sarvam STT/TTS + Groq LLM (`apps/agent`)
- **Monorepo:** pnpm workspaces + Turborepo

## Layout

```
apps/
  web/      Next.js — HQ + Franchise UI (role-aware)
  api/      Fastify API server
  worker/   BullMQ background workers
  agent/    LiveKit Python voice agent
packages/
  db/        Prisma schema, RLS policies, withTenantContext helpers
  shared/    Zod schemas, types, permissions, money math
  config/    Zod-validated env (fails fast at boot)
  voice-agent/  persona prompts + tool defs
  ui/, integrations/, ...
docs/        planning & assessment docs
```

## Local development

```bash
cp .env.example .env.local      # fill Postgres + Redis + provider creds
docker compose up -d            # postgres, redis, mailhog
pnpm install
pnpm --filter @excess/db prisma db push   # local schema
pnpm --filter @excess/db run seed         # demo data
pnpm dev                        # web :3000 · api :8000 · worker
```

## Quality gates

```bash
pnpm typecheck        # tsc --noEmit (all packages)
pnpm lint             # eslint
pnpm test             # vitest unit/integration (incl. RLS isolation suite)
pnpm --filter web test:e2e   # Playwright (live per-role suites, E2E_LIVE=1)
```

CI runs typecheck + lint + unit/integration (with the cross-tenant RLS leak tests) + the
live per-role E2E suites + a Docker build on every PR.

## Architecture rules (non-negotiable — see `CLAUDE.md`)

- Every business table is `tenant_id`-scoped with FORCE RLS; every query runs inside
  `withTenantContext()` (sets the tenant GUC via `set_config`, transaction-local).
- Every protected handler calls `can(role, permission)` before business logic.
- Webhooks verify an HMAC signature, return 200 immediately, then enqueue to BullMQ.
- Secrets via env (Zod-validated; production refuses to boot on default secrets).

## Deployment

Push to `main` → GitHub Action → Coolify webhook rebuilds & redeploys. Schema changes are
applied deliberately (see `docs/` and `RUNBOOK.md`) — never via an unsupervised `db push`
against production.
