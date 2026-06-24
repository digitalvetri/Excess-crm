# WhatsApp page → shared multi-agent inbox — complete plan

Scope: **Marketing → WhatsApp** (`apps/web/src/app/(app)/whatsapp/page.tsx`). Turn the current page into a wacrm-grade shared inbox **without rebuilding** — it already has the bones.

> ## ✅ STATUS: COMPLETE (all phases shipped)
> - **Phase 1** UX polish — search, preview, relative time, contact context, 24h window (`a663fd6`)
> - **Phase 2** Multi-agent — assignment (lead owner), status, unread, filters (`8867677`, no DDL)
> - **Phase 3** Rich messaging — template picker (`382cbd6`), reply-quote (`5467f39`), reactions (`6db6922`), media inbound+download+display (`d2e558d`, `9e5e6d3`) + outbound send (`afef1f9`)
> - **Phase 4** Real-time — SSE + Redis pub/sub (`7f2e7e4`, verified end-to-end)
> - **Phase 5** AI assist — summarise + suggested replies (`d0f9204`)
> - **Phase 5b** First-response SLA timer (`6346279`)
>
> **Verify on the live number:** outbound/inbound media (Meta media API + S3 — couldn't be tested without prod creds). Everything else is verified locally + in CI.
> **DDL note (verified 2026-06-24):** prod *can* run additive DDL via hand-written `ALTER … ADD COLUMN IF NOT EXISTS` — never `prisma db push`. Phases 2–5 still avoided columns (JSON payload / Redis) so nothing needs a migration.

---

## Where it stands today (already built)
- **Two-pane inbox layout**: left = conversation list (`useConversations`), right = message thread (`useMessages`) + composer (`useSendMessage`).
- **Connection panel** (admin) + connect/disconnect + a connection status bar.
- **AI "Draft with AI"** in the composer (just shipped).
- **Backend:** `WaSession` (one row per tenant+phone, tracks `lastMessageAt`, `sessionExpiresAt` = the 24-h window, `leadId`); messages stored as `lead_activities` (type `WHATSAPP`, `payload.message`); endpoints `GET /whatsapp/conversations`, `/conversations/:leadId`, `POST /send`.

## What a wacrm-grade shared inbox adds (the gaps)
1. **Conversation list:** search, unread badges, last-message preview + relative time, status/assignee filters.
2. **Multi-agent:** per-conversation **assignment**, **status** (Open/Pending/Resolved), **internal notes**.
3. **Rich chat:** media (image/doc/voice), reactions, reply-quote, in-thread template picker, canned/quick replies.
4. **Real-time:** new messages & unread push live (today it polls).
5. **Context + productivity:** contact sidebar (lead stage/score/quick actions), 24-h-window indicator, first-response SLA timer.

---

## Phased plan

### Phase 1 — Inbox UX polish *(front-end only, ~3–4 days)*
No schema change — uses data you already have.
- Conversation list: **search box**, **unread badge**, **last-message preview + relative time**, sorted by `lastMessageAt`.
- **Contact sidebar** on the right of the thread: lead name, **stage, AI score**, "Open lead" link, quick stage-change.
- **24-hour window indicator** in the composer (free-text allowed only inside the window; template-only outside — you already store `sessionExpiresAt`).
- *Files:* `whatsapp/page.tsx`, `use-whatsapp.ts` (expose `sessionExpiresAt`, unread, preview from the conversations endpoint).

### Phase 2 — Multi-agent (assignment · status · unread) ✅ SHIPPED — no DDL
The "shared" in shared inbox — built **without any schema change** to avoid prod DDL risk:
- **Assignment → lead ownership.** "Assign to me" calls the existing `PATCH /leads/:id/assign`; assignee = the lead's owner. Durable, zero new columns.
- **Status (Open/Pending/Resolved) + unread → Redis.** `PATCH /whatsapp/conversations/:leadId/status` and `POST /whatsapp/conversations/:leadId/read`; the inbound webhook bumps `wa_unread:*`. Low-stakes triage state, tolerant of a reset.
- **UI:** filter chips (All / Mine / Unassigned / Open / Resolved), unread badges, status pills, assignee initials, and a triage toolbar (status + Assign-to-me) in the thread header.

> **⚠️ Migration policy (applies to Phases 3+):** the prod schema-change path is unresolved (the `system_kw` incident). **Do NOT run `prisma db push` on prod** — it diffs and can *drop* columns (data loss). If/when DDL is confirmed available, apply additive changes with a hand-written `ALTER TABLE … ADD COLUMN IF NOT EXISTS` only. Status/unread were kept in Redis precisely to avoid this until the DDL question is answered.

### Phase 3 — Rich messaging *(~1–2 weeks)*
- **Media** send + receive (image / document / voice note) — extend the send endpoint + inbound webhook to handle Meta media; store the S3 key (you already have S3 wiring).
- **Reactions**, **reply-quote**, **in-thread template picker** (you already have approved templates), **canned/quick replies** (saved snippets per tenant).
- *Files:* `whatsapp-receive` worker, `POST /send`, thread components.

### Phase 4 — Real-time *(~3–5 days)*
Replace the polling (`refetch`) with push: an **SSE endpoint fed by Redis pub/sub** (Redis is already running). Live: new message, unread bump, assignment/status change.

### Phase 5 — Productivity & AI *(~1 week)*
- **First-response SLA timer** per conversation (your SLA-rules pattern).
- Bulk actions (assign/resolve many), saved filters.
- **AI in the inbox:** the AI draft is live; add **"summarize this conversation"** and **suggested quick replies** (reuse the `llmComplete` helper + the AI-prompts module).

---

## Order & effort
1. **Phase 1** (polish) — fast, visible, zero schema risk → ship first.
2. **Phase 2** (multi-agent) — the core upgrade; needs one additive migration.
3. **Phase 3** (rich media/chat) — highest effort, highest daily value.
4. **Phase 4** (realtime) → **Phase 5** (productivity/AI) — polish.

## Guardrails
- **One additive migration** (Phase 2) — apply with `db push` from the Coolify container, like before; columns are nullable so it's safe.
- Respect the **24-h window + Meta template rules** in the composer (cold outreach = approved template only).
- Keep the existing `WaSession`/`lead_activities` model — **extend, don't replace**.

**Bottom line:** you're ~40% of the way to a wacrm-grade inbox already. Phase 1 makes it *feel* like a real inbox in a few days; Phase 2 makes it genuinely multi-agent; Phase 3 makes it rich. Recommended start: **Phase 1**.
