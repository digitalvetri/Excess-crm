import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'crypto';

const requestIdPluginImpl: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (req, reply) => {
    // Use existing X-Request-Id header if present (from load balancer), else generate
    const existingId = req.headers['x-request-id'];
    const requestId = (typeof existingId === 'string' ? existingId : null) ?? randomUUID();
    // Attach to reply header for traceability
    void reply.header('X-Request-Id', requestId);
    // Attach to request for log context — use req.id which Fastify already sets
    // Just ensure the header is echoed back
  });
};

export const requestIdPlugin = fp(requestIdPluginImpl, { name: 'request-id' });
