# Adopting Prisma migrations (report 2.1) — staged, coordinated

The repo shipped schema with `prisma db push` and had **no migration history** — one bad
deploy could drop a column with live data, and it's the root of the CI schema-drift pain.

This change adds the **baseline migration** (`packages/db/prisma/migrations/0_baseline/`)
and an advisory drift check, **without flipping CI**. Production is *not* yet on migrations
— do that with the steps below, because a never-migrated prod will fail every deploy the
moment CI runs `migrate deploy` against it (it tries to re-`CREATE TABLE` everything)
unless prod is baselined first.

> ⚠️ Do this in a maintenance window, with a **fresh DB backup** taken first.

## What's in the repo now
- `prisma/migrations/0_baseline/migration.sql` — the full current schema (46 tables), generated from `schema.prisma`.
- `prisma/migrations/migration_lock.toml`.
- `pnpm --filter @excess/db run db:migrate:check` — advisory drift check (schema vs migrations). **Not yet a CI gate** — see the cosmetic-diff caveat below.
- CI and deploy still use `db push` — unchanged.

## One-time: baseline production (you run this)
1. **Back up prod** (snapshot / pg_dump). Non-negotiable.
2. Confirm prod schema matches `schema.prisma`. If you suspect drift (e.g. the `system_kw` history, probe columns), generate the baseline **from prod's real schema** instead:
   `prisma migrate diff --from-empty --to-url "$PROD_DATABASE_URL" --script` and use that as `0_baseline/migration.sql`.
3. In the Coolify API-container terminal, mark the baseline as already applied (this writes the `_prisma_migrations` ledger; it does **not** run any DDL):
   ```bash
   pnpm --filter @excess/db exec prisma migrate resolve --applied 0_baseline
   ```
4. Verify: `pnpm --filter @excess/db exec prisma migrate status` → should say "Database schema is up to date".

## After prod is baselined: switch the workflow (follow-up PR)
- New schema changes: `prisma migrate dev --name <change>` locally → commit the migration.
- Deploy/CI runs `prisma migrate deploy` (replace the `db push` step).
- Make the drift check a **CI gate** — but first handle the caveat below.

## ⚠️ Cosmetic-diff caveat (why the check is advisory first)
`db:migrate:check` currently reports one *non-real* diff: Prisma re-renders a DB-generated
default (`(gen_random_uuid())::text` ↔ `gen_random_uuid()::text`) on `whatsapp_configs`.
It's functionally identical. Before making the check a blocking CI gate, regenerate the
baseline so it round-trips clean (or pin the default in `schema.prisma`), so the gate only
ever fails on *real* drift.

## Why this order
Baseline → resolve-applied on prod → then flip CI. Never `db push` prod again, and never
`migrate deploy` against an un-baselined prod. The migration ledger becomes the source of
truth and the drift problem disappears.
