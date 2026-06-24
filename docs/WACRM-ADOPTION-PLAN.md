# Adopting wacrm's best ideas into Excess CRM — analysis & phased plan

**Repo analysed:** `digitalvetri/wp-crm` = **wacrm** — a self-hostable, WhatsApp-first CRM template (Next.js 16 + **Supabase** + Tailwind/shadcn). Shared WhatsApp inbox, contacts, Kanban pipelines, broadcasts, and a **visual no-code automation builder**.

---

## ⚠️ Read this first — don't clone it, harvest it

1. **Different stack.** wacrm = Next.js API routes + **Supabase** (Postgres + Supabase Auth + Supabase Realtime). Excess = Next.js + **Fastify API + Prisma + BullMQ workers + Redis + Lucia auth**. You **cannot** drop wacrm's code in — it assumes Supabase everywhere. We re-implement the *features* in your stack.
2. **You're already a superset.** Excess already has WhatsApp send/receive + a conversations page, broadcasts (Meta templates + delivery), automations (drip sequences, SLA, assignment rules, stage gates, webhooks), a Kanban view, contacts (leads + tags + fact sheet), multi-role teams — **plus** things wacrm has *no* answer for: the **solar vertical** (install pipeline, subsidy/net-metering, ₹/kW commissions, AMC), the **AI Voice Agent**, the **franchise model**, and the **AI layer** (draft reply, next-best-action, call summaries, daily brief). Making Excess "exactly like wacrm" would be a **downgrade**.
3. So the goal isn't parity — it's **grafting wacrm's 5 genuinely-nicer WhatsApp-CRM touches onto Excess.**

## Side-by-side (where wacrm actually adds something)

| Capability | wacrm | Excess today | Worth adopting? |
|---|---|---|---|
| Shared WhatsApp inbox (assignment, status, notes per convo) | ✅ polished | ⚠️ has a conversations page; not full multi-agent inbox | **Yes — enhance** |
| Rich chat (reactions, replies, media, template picker in-thread) | ✅ | ⚠️ basic text thread | **Yes — enhance** |
| Drag-drop Kanban (move card → change stage) | ✅ `@dnd-kit` | ⚠️ static Kanban view (`leads-kanban.tsx`) | **Yes — quick win** |
| Visual no-code automation builder | ✅ React Flow (`@xyflow`) | ⚠️ form-based drip sequences (engine exists) | **Yes — flagship** |
| Scoped, revocable **public API keys** | ✅ | ❌ only outbound webhooks | **Yes — real gap** |
| Real-time presence (online/typing, live updates) | ✅ Supabase Realtime | ⚠️ polling | Optional |
| Everything else (broadcasts, contacts, teams, dashboard, RBAC) | ✅ | ✅ **equal or better** | No — keep yours |

---

## Phased plan (implemented natively in Excess's stack)

### Phase 1 — Drag-drop Kanban *(quick win, ~2 days)*
Upgrade `leads-kanban.tsx` with `@dnd-kit`: drag a lead card between stage columns → calls the **existing** `PATCH /leads/:id` (so SLA rules, stage gates, commission-on-convert all still fire). Add WIP counts + value per column.
*Reuses:* the entire stage-change backend. Pure front-end + one dep.

### Phase 2 — Shared WhatsApp inbox *(flagship, ~1–2 weeks)*
Turn the WhatsApp page into a true multi-agent inbox:
- **Conversation list** across all leads (unread, last message, assignee, status filters).
- **Per-conversation assignment + status + internal notes** (new columns on the conversation/lead).
- **Rich thread:** reactions, reply-quote, media (image/doc/voice), in-thread template picker.
*Reuses:* your existing WhatsApp send/receive + webhooks + conversations API; extend the schema (conversation assignment/status) and the inbound webhook to capture reactions/media.

### Phase 3 — Visual no-code automation builder *(flagship, ~2–3 weeks)*
Add a **React Flow** (`@xyflow/react`) canvas that compiles to your **existing** automation engine:
- Nodes: **Trigger** (lead stage / inbound message / keyword / schedule) → **Steps** (Send WhatsApp/Email, Wait, Tag, Branch on condition, Webhook).
- The canvas serializes to the **same `sequences` model** you already run (trigger + ordered steps). A thin "flow → sequence" compiler means the runtime is *already built and tested*.
*Reuses:* the `sequences` engine + `sequence-runner` worker. This is mostly a visual front-end + a serializer.

### Phase 4 — Scoped public API keys *(~3–4 days)*
A user-managed **API Keys** screen (Settings): generate, name, scope (read/write per module), and revoke keys. Auth middleware accepts `Authorization: Bearer <key>` on `/api/v1` alongside sessions, resolves tenant + scopes, rate-limits per key.
*Reuses:* your existing `can()` permission model (scopes map to permissions). New: `api_keys` table (hashed key, scopes, lastUsedAt) + a key-auth branch in the auth plugin.

### Phase 5 — Real-time presence & live updates *(optional, ~1 week)*
Replace inbox/dashboard polling with push: a lightweight **SSE or WebSocket** channel fed by **Redis pub/sub** (you already run Redis) — new message, assignment change, who's viewing a conversation.
*Reuses:* Redis. New: an SSE endpoint + client subscription.

---

## Recommended order & effort
1. **Phase 1 (Kanban)** — fast, visible, low risk → ship first.
2. **Phase 3 (visual automation builder)** — biggest "wow", and the backend already exists.
3. **Phase 2 (shared inbox)** — highest effort, highest daily-use value.
4. **Phase 4 (API keys)** — clean, self-contained.
5. **Phase 5 (realtime)** — polish.

## What NOT to do
- ❌ Don't migrate to Supabase. Your Fastify/Prisma/BullMQ stack is more capable for your workers, voice agent, and queues.
- ❌ Don't replace your sequences engine — wrap it with the visual builder.
- ❌ Don't drop your solar/voice/franchise/AI features to "match" wacrm — they're your moat.

**Bottom line:** wacrm is a clean WhatsApp-inbox CRM, but Excess is a far broader product. Cherry-pick its **drag-drop Kanban, shared inbox polish, visual automation canvas, and scoped API keys** — implemented natively — and Excess gains wacrm's strengths while keeping everything that already makes it better.
