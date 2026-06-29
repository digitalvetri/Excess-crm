import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import * as Sentry from '@sentry/node';
import { fileURLToPath } from 'url';
import { env } from '@excess/config';
import { ensureRls, prisma } from '@excess/db';
import { requestIdPlugin } from './plugins/request-id.js';
import { authPlugin } from './plugins/auth.js';
import { tenantContextPlugin } from './plugins/tenant-context.js';
import { corsPlugin } from './plugins/cors.js';
import { queuesPlugin } from './plugins/queues.js';
import { redisPlugin } from './plugins/redis.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { idempotencyPlugin } from './plugins/idempotency.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { leadsRoutes } from './routes/leads.js';
import { metaWebhookRoutes } from './routes/webhooks/meta.js';
import { indiamartWebhookRoutes } from './routes/webhooks/indiamart.js';
import { justdialWebhookRoutes } from './routes/webhooks/justdial.js';
import { whatsappWebhookRoutes } from './routes/webhooks/whatsapp.js';
import { vapiWebhookRoutes } from './routes/webhooks/vapi.js';
import { exotelWebhookRoutes } from './routes/webhooks/exotel.js';
import { voiceAgentRoutes } from './routes/voice-agent.js';
import { appointmentsRoutes, surveyCompletionRoutes } from './routes/appointments.js';
import { franchiseRoutes } from './routes/franchise.js';
import { commissionsRoutes } from './routes/commissions.js';
import { payoutsRoutes } from './routes/payouts.js';
import { quotationsRoutes } from './routes/quotations.js';
import { whatsappMessagingRoutes } from './routes/whatsapp.js';
import { kbRoutes } from './routes/kb.js';
import { referralsRoutes } from './routes/referrals.js';
import { leaderboardRoutes } from './routes/leaderboard.js';
import { aiRoutes } from './routes/ai.js';
import { reviewsRoutes } from './routes/reviews.js';
import { walletRoutes } from './routes/wallet.js';
import { reportsRoutes } from './routes/reports.js';
import { teamsRoutes } from './routes/teams.js';
import { routingRulesRoutes } from './routes/routing-rules.js';
import { usersRoutes } from './routes/users.js';
import { integrationsRoutes } from './routes/integrations.js';
import { csvImportRoutes } from './routes/csv-import.js';
import { slaRulesRoutes } from './routes/sla-rules.js';
import { stageGatesRoutes } from './routes/stage-gates.js';
import { projectsRoutes } from './routes/projects.js';
import { serviceTicketsRoutes } from './routes/service-tickets.js';
import { amcContractsRoutes } from './routes/amc-contracts.js';
import { broadcastsRoutes } from './routes/broadcasts.js';
import { sequencesRoutes } from './routes/sequences.js';
import { portalRoutes } from './routes/portal.js';
import { reportBuilderRoutes } from './routes/report-builder.js';
import { engagementRoutes } from './routes/engagement.js';
import { settingsWebhooksRoutes } from './routes/settings-webhooks.js';
import { notificationsRoutes } from './routes/notifications.js';
import { callsRoutes } from './routes/calls.js';

export async function buildServer() {
  // Error tracking — no-op unless SENTRY_DSN is set, so local/dev is untouched.
  if (env.SENTRY_DSN) {
    Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0.1 });
  }
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' && {
        transport: { target: 'pino-pretty' },
      }),
    },
    // Trust the Next.js proxy so req.ip reflects the real browser IP via
    // X-Forwarded-For, not the internal container address shared by all users.
    trustProxy: true,
  });

  // Capture raw request body bytes so webhook handlers can verify HMAC signatures
  app.addContentTypeParser('application/json', { parseAs: 'string' }, function (_req, body, done) {
    _req.rawBody = body as string;
    try { done(null, JSON.parse(body as string)); }
    catch (e) { done(e as Error, undefined); }
  });

  await app.register(requestIdPlugin);
  await app.register(helmet);
  await app.register(cookie);
  await app.register(corsPlugin);
  await app.register(queuesPlugin);
  await app.register(redisPlugin);
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);
  // idempotency must come after authPlugin so its preHandler hook can read req.auth
  await app.register(idempotencyPlugin);
  await app.register(tenantContextPlugin);

  await app.register(async (api) => {
    await api.register(healthRoutes);
    await api.register(authRoutes, { prefix: '/auth' });
    await api.register(leadsRoutes, { prefix: '/leads' });
    await api.register(metaWebhookRoutes, { prefix: '/webhooks' });
    await api.register(indiamartWebhookRoutes, { prefix: '/webhooks' });
    await api.register(justdialWebhookRoutes, { prefix: '/webhooks' });
    await api.register(whatsappWebhookRoutes, { prefix: '/webhooks' });
    await api.register(vapiWebhookRoutes, { prefix: '/webhooks' });
    await api.register(exotelWebhookRoutes, { prefix: '/webhooks' });
    await api.register(voiceAgentRoutes, { prefix: '/voice-agent' });
    await api.register(appointmentsRoutes, { prefix: '/appointments' });
    await api.register(surveyCompletionRoutes, { prefix: '/survey' });
    await api.register(franchiseRoutes, { prefix: '/franchise' });
    await api.register(commissionsRoutes, { prefix: '/commissions' });
    await api.register(payoutsRoutes, { prefix: '/payouts' });
    await api.register(quotationsRoutes, { prefix: '/quotations' });
    await api.register(whatsappMessagingRoutes, { prefix: '/whatsapp' });
    await api.register(kbRoutes, { prefix: '/kb' });
    await api.register(referralsRoutes, { prefix: '/referrals' });
    await api.register(leaderboardRoutes, { prefix: '/leaderboard' });
    await api.register(aiRoutes, { prefix: '/ai' });
    await api.register(reviewsRoutes, { prefix: '/reviews' });
    await api.register(walletRoutes, { prefix: '/wallet' });
    await api.register(engagementRoutes, { prefix: '/engagement' });
    await api.register(reportsRoutes, { prefix: '/reports' });
    await api.register(teamsRoutes, { prefix: '/teams' });
    await api.register(routingRulesRoutes, { prefix: '/routing-rules' });
    await api.register(usersRoutes, { prefix: '/users' });
    await api.register(integrationsRoutes, { prefix: '/integrations' });
    await api.register(csvImportRoutes, { prefix: '/leads/import' });
    await api.register(slaRulesRoutes, { prefix: '/sla-rules' });
    await api.register(stageGatesRoutes, { prefix: '/stage-gates' });
    await api.register(projectsRoutes, { prefix: '/projects' });
    await api.register(serviceTicketsRoutes, { prefix: '/service-tickets' });
    await api.register(amcContractsRoutes, { prefix: '/amc-contracts' });
    await api.register(broadcastsRoutes, { prefix: '/broadcasts' });
    await api.register(sequencesRoutes, { prefix: '/sequences' });
    await api.register(portalRoutes, { prefix: '/portal' });
    await api.register(reportBuilderRoutes, { prefix: '/report-builder' });
    await api.register(settingsWebhooksRoutes, { prefix: '/settings/webhooks' });
    await api.register(notificationsRoutes, { prefix: '/notifications' });
    await api.register(callsRoutes, { prefix: '/calls' });
  }, { prefix: '/api/v1' });

  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
    if (env.SENTRY_DSN && statusCode >= 500) Sentry.captureException(error);
    return reply.code(statusCode).send({
      error: {
        code: error.code ?? 'internal_error',
        message: statusCode === 500 ? 'Internal server error' : error.message,
      },
    });
  });

  return app;
}

async function main() {
  const app = await buildServer();
  // Apply Row-Level Security policies to the running DB at boot. Safe + idempotent;
  // never crashes the API (see ensureRls). Schema ships via `prisma db push`, which
  // does not apply RLS, so this is the only thing that enables it in production.
  try {
    await ensureRls(prisma, app.log);
  } catch (err) {
    app.log.error({ err }, 'rls.ensure_unexpected_error');
  }
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only run when executed directly, not when imported by tests
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
