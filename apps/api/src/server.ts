import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { env } from '@excess/config';
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
import { appointmentsRoutes } from './routes/appointments.js';
import { franchiseRoutes } from './routes/franchise.js';
import { commissionsRoutes } from './routes/commissions.js';
import { payoutsRoutes } from './routes/payouts.js';
import { quotationsRoutes } from './routes/quotations.js';
import { whatsappMessagingRoutes } from './routes/whatsapp.js';
import { kbRoutes } from './routes/kb.js';
import { referralsRoutes } from './routes/referrals.js';
import { leaderboardRoutes } from './routes/leaderboard.js';
import { reviewsRoutes } from './routes/reviews.js';
import { walletRoutes } from './routes/wallet.js';
import { reportsRoutes } from './routes/reports.js';
import { teamsRoutes } from './routes/teams.js';
import { routingRulesRoutes } from './routes/routing-rules.js';
import { usersRoutes } from './routes/users.js';
import { integrationsRoutes } from './routes/integrations.js';
import { csvImportRoutes } from './routes/csv-import.js';
import { slaRulesRoutes } from './routes/sla-rules.js';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' && {
        transport: { target: 'pino-pretty' },
      }),
    },
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

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(leadsRoutes, { prefix: '/leads' });
  await app.register(metaWebhookRoutes, { prefix: '/webhooks' });
  await app.register(indiamartWebhookRoutes, { prefix: '/webhooks' });
  await app.register(justdialWebhookRoutes, { prefix: '/webhooks' });
  await app.register(whatsappWebhookRoutes, { prefix: '/webhooks' });
  await app.register(vapiWebhookRoutes, { prefix: '/webhooks' });
  await app.register(exotelWebhookRoutes, { prefix: '/webhooks' });
  await app.register(voiceAgentRoutes, { prefix: '/voice-agent' });
  await app.register(appointmentsRoutes, { prefix: '/appointments' });
  await app.register(franchiseRoutes, { prefix: '/franchise' });
  await app.register(commissionsRoutes, { prefix: '/commissions' });
  await app.register(payoutsRoutes, { prefix: '/payouts' });
  await app.register(quotationsRoutes, { prefix: '/quotations' });
  await app.register(whatsappMessagingRoutes, { prefix: '/whatsapp' });
  await app.register(kbRoutes, { prefix: '/kb' });
  await app.register(referralsRoutes, { prefix: '/referrals' });
  await app.register(leaderboardRoutes, { prefix: '/leaderboard' });
  await app.register(reviewsRoutes, { prefix: '/reviews' });
  await app.register(walletRoutes, { prefix: '/wallet' });
  await app.register(reportsRoutes, { prefix: '/reports' });
  await app.register(teamsRoutes, { prefix: '/teams' });
  await app.register(routingRulesRoutes, { prefix: '/routing-rules' });
  await app.register(usersRoutes, { prefix: '/users' });
  await app.register(integrationsRoutes, { prefix: '/integrations' });
  await app.register(csvImportRoutes, { prefix: '/leads/import' });
  await app.register(slaRulesRoutes, { prefix: '/sla-rules' });

  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
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
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
