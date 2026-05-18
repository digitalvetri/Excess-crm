import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { env } from '@excess/config';

const corsPluginImpl: FastifyPluginAsync = async (app) => {
  await app.register(cors, {
    origin: [env.APP_URL],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });
};

export const corsPlugin = fp(corsPluginImpl, { name: 'cors' });
