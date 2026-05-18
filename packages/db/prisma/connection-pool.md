# Prisma Connection Pool Configuration

## Recommended Settings (Production)

Add to DATABASE_URL:
```
postgresql://user:pass@host:5432/excess_crm?connection_limit=10&pool_timeout=20&connect_timeout=10
```

Or set via PRISMA_CLIENT_ENGINE_TYPE and separate params.

| Setting | Value | Reason |
|---------|-------|--------|
| connection_limit | 10 | Per API instance; scale with replica count |
| pool_timeout | 20s | Max wait for connection from pool |
| connect_timeout | 10s | TCP connection timeout |

## Per Service

| Service | connection_limit | Notes |
|---------|-----------------|-------|
| API (per instance) | 10 | 2 API instances = 20 total |
| Worker (per instance) | 5 | Background jobs, less concurrent |
| RDS max_connections | 100 | Aurora PostgreSQL default |

## Read Replica

For heavy reads (reports, leaderboard), set DATABASE_URL_REPLICA and use a separate PrismaClient instance pointing to the replica. The reports route should use the replica client in production.
