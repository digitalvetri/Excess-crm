# Excess CRM — Operations Runbook

## Quick Reference

| Service | URL / Location |
|---------|---------------|
| API | https://api.excessindia.com |
| API Health | https://api.excessindia.com/health |
| API Ready | https://api.excessindia.com/ready |
| Frontend | https://app.excessindia.com |
| Database | AWS RDS Aurora PostgreSQL 16 (ap-south-1) |
| Cache / Queue | AWS ElastiCache Redis 7 |
| Logs | CloudWatch → Log group `/excess-crm/api`, `/excess-crm/worker` |
| Metrics | Datadog — dashboard "Excess CRM Production" |
| Alerts | PagerDuty / Datadog monitors |
| Mail preview (local) | http://localhost:8025 (MailHog) |

---

## Startup / Shutdown

### Local Development

```bash
# Start all backing services (Postgres, Redis, MailHog)
docker-compose up -d

# Install dependencies (pnpm only)
pnpm install

# Run all apps in watch mode (Turborepo)
pnpm dev

# Individual apps
pnpm --filter web dev      # Next.js on :3000
pnpm --filter api dev      # Fastify on :4000
pnpm --filter worker dev   # BullMQ worker

# Stop all backing services
docker-compose down
```

### Production (ECS / Docker)

```bash
# Deploy latest image (via CI/CD — preferred)
git push origin main   # triggers GitHub Actions → ECR push → ECS rolling deploy

# Manual force-deploy (emergency)
aws ecs update-service \
  --cluster excess-crm-prod \
  --service excess-crm-api \
  --force-new-deployment \
  --region ap-south-1

# Stop a service (maintenance window)
aws ecs update-service \
  --cluster excess-crm-prod \
  --service excess-crm-api \
  --desired-count 0 \
  --region ap-south-1

# Restart (restore desired count)
aws ecs update-service \
  --cluster excess-crm-prod \
  --service excess-crm-api \
  --desired-count 2 \
  --region ap-south-1
```

---

## Database Maintenance

### Run Prisma migrations in production

```bash
# Always take a snapshot first
aws rds create-db-cluster-snapshot \
  --db-cluster-identifier excess-crm-prod \
  --db-cluster-snapshot-identifier pre-migrate-$(date +%Y%m%d) \
  --region ap-south-1

# Apply pending migrations
DATABASE_URL="<prod-url>" npx prisma migrate deploy
```

### Run data retention manually

```bash
cd apps/worker && tsx src/jobs/data-retention.ts
```

### Check DND audit log

```bash
# Search worker logs for DND audit entries
aws logs filter-log-events \
  --log-group-name /excess-crm/worker \
  --filter-pattern "dnd_audit" \
  --region ap-south-1
```

### Create a new franchise tenant

```bash
DATABASE_URL="<prod-url>" tsx scripts/create-tenant.ts \
  --name "Franchise Name" \
  --email "owner@franchise.com" \
  --phone "+919876543210"
```

### Validate environment variables before deployment

```bash
tsx scripts/validate-env.ts
```

---

## Common Incidents

### API is returning 503

1. Check the health endpoint to identify the failing subsystem:

   ```bash
   curl https://api.excessindia.com/health
   # Response includes: { database: "ok"|"error", redis: "ok"|"error", queues: "ok"|"error" }
   ```

2. If **database** is down:
   - Open AWS Console → RDS → Clusters → `excess-crm-prod`
   - Check cluster status; if failover in progress, wait (typically < 30s for Aurora)
   - Check CloudWatch logs for connection errors

3. If **redis** is down:
   - Open AWS Console → ElastiCache → Redis clusters → `excess-crm-cache`
   - Check node status; if primary failed, ElastiCache auto-promotes a replica
   - Check CloudWatch metrics for `CurrConnections`, `EngineCPUUtilization`

4. Check application logs for detailed errors:

   ```bash
   aws logs tail /excess-crm/api --follow --region ap-south-1
   ```

5. If load-related (CPU / memory spike): scale ECS tasks horizontally:

   ```bash
   aws ecs update-service \
     --cluster excess-crm-prod \
     --service excess-crm-api \
     --desired-count 4 \
     --region ap-south-1
   ```

---

### Voice agent calls not going out

1. Check the BullMQ `voice-dial` queue depth in Redis:

   ```bash
   redis-cli -u "$REDIS_URL" LLEN bull:voice-dial:waiting
   redis-cli -u "$REDIS_URL" LLEN bull:voice-dial:failed
   ```

2. Verify the Vapi API key is valid:

   ```bash
   curl -H "Authorization: Bearer $VAPI_API_KEY" \
     https://api.vapi.ai/assistant | jq '.message'
   ```

3. Check business hours configuration in the database:

   ```sql
   SELECT tenant_id, business_hours_start, business_hours_end, timezone, daily_call_cap
   FROM voice_agent_settings;
   ```

4. Check whether the daily call cap has been reached (Redis key pattern):

   ```bash
   redis-cli -u "$REDIS_URL" GET "dial:cap:$(date +%Y-%m-%d)"
   ```

5. Check the worker logs for DND gate rejections or dial errors:

   ```bash
   aws logs filter-log-events \
     --log-group-name /excess-crm/worker \
     --filter-pattern "voice-dial" \
     --region ap-south-1
   ```

---

### Lead webhook not ingesting

1. Check webhook signature validation in the API logs — look for `"webhook.signature_invalid"`:

   ```bash
   aws logs filter-log-events \
     --log-group-name /excess-crm/api \
     --filter-pattern "signature" \
     --region ap-south-1
   ```

2. Check the `lead-ingest` BullMQ queue for failed jobs:

   ```bash
   redis-cli -u "$REDIS_URL" LLEN bull:lead-ingest:failed
   # Inspect the failed job payload
   redis-cli -u "$REDIS_URL" LRANGE bull:lead-ingest:failed 0 0
   ```

3. Check lead deduplication — the lead may already exist (same phone + tenant within 24h):

   ```sql
   SELECT id, phone, source_type, created_at
   FROM leads
   WHERE tenant_id = '<tenant-id>'
     AND phone = '<phone>'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

4. Verify the source webhook URL is pointing to the correct endpoint:
   - Meta/Facebook: `https://api.excessindia.com/api/v1/webhooks/meta`
   - IndiaMART: `https://api.excessindia.com/api/v1/webhooks/indiamart`
   - JustDial: `https://api.excessindia.com/api/v1/webhooks/justdial`

---

### WhatsApp messages not sending

1. Check the WhatsApp access token expiry (Meta tokens expire every 60 days):

   ```bash
   curl "https://graph.facebook.com/debug_token?input_token=$WHATSAPP_ACCESS_TOKEN&access_token=$META_APP_ID|$META_APP_SECRET" \
     | jq '.data.expires_at'
   # Rotate token in Meta Developer Console if expiry < 7 days away
   ```

2. Check the `whatsapp-send` BullMQ queue for failed jobs:

   ```bash
   redis-cli -u "$REDIS_URL" LLEN bull:whatsapp-send:failed
   ```

3. Verify phone number format — must be E.164 (e.g., `+919876543210`, no spaces or dashes):

   ```sql
   SELECT id, phone FROM leads WHERE phone NOT LIKE '+%' LIMIT 5;
   ```

4. Check worker logs for WhatsApp API error responses:

   ```bash
   aws logs filter-log-events \
     --log-group-name /excess-crm/worker \
     --filter-pattern "whatsapp" \
     --region ap-south-1
   ```

---

### BullMQ failed job backlog growing

```bash
# Count failed jobs per queue
for q in lead-ingest voice-dial whatsapp-send pdf-render; do
  echo "$q: $(redis-cli -u "$REDIS_URL" LLEN bull:$q:failed)"
done

# Retry all failed jobs in a queue (use with care — may cause duplicate side effects)
redis-cli -u "$REDIS_URL" LRANGE bull:voice-dial:failed 0 -1 | \
  xargs -I{} redis-cli -u "$REDIS_URL" RPOPLPUSH bull:voice-dial:failed bull:voice-dial:wait
```

---

## Scaling

| Component | Scaling approach |
|-----------|-----------------|
| **API** (Fastify) | Horizontal — stateless; rate limit state lives in Redis. Increase ECS desired count. |
| **Worker** (BullMQ) | Horizontal — BullMQ handles concurrency and job locking. Run multiple ECS tasks safely. |
| **Database** | Vertical (RDS instance class) for writes. Read replicas available via `DATABASE_URL_REPLICA`. |
| **Redis** | Vertical or cluster mode. Session + rate limit data; backpressure tolerated for a few seconds. |

---

## Monitoring Checklist (daily)

- [ ] `GET https://api.excessindia.com/health` returns `200 OK` with all subsystems healthy
- [ ] BullMQ failed job count across all queues < 10
- [ ] DND audit log shows 0 violations (calls outside business hours or to DND numbers)
- [ ] WhatsApp access token expiry > 7 days
- [ ] RDS storage usage < 80% (CloudWatch metric: `FreeStorageSpace`)
- [ ] No P1/P2 Sentry errors in the last 24h
- [ ] Datadog APM p99 latency < 500ms for `/api/v1/leads`

---

## Contacts

| Team | Contact |
|------|---------|
| DigitalVetri (build team) | info@digitalvetri.com |
| Excess Renew Tech (client) | — (see project docs) |
| AWS Support | AWS Console → Support → Create case |
| Vapi Support | support@vapi.ai |
| Meta Business Support | https://business.facebook.com/help |
