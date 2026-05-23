import type { FastifyPluginAsync } from 'fastify';
import { can } from '@excess/shared';
import { createLeadSourceSchema, updateLeadSourceSchema } from '@excess/shared';
import { env } from '@excess/config';

export const integrationsRoutes: FastifyPluginAsync = async (app) => {
  // GET /integrations — list all lead sources for tenant
  app.get('/', async (req, reply) => {
    if (!can(req.auth.role, 'integrations.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const sources = await req.withTenant((tx) =>
      tx.leadSource.findMany({
        where: { tenantId: req.auth.tenantId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          label: true,
          isActive: true,
          lastSyncAt: true,
          createdAt: true,
          config: true,
          _count: { select: { leads: true } },
        },
      }),
    );

    // Redact secrets from config before sending
    const sanitised = sources.map((s) => {
      const cfg = s.config as Record<string, unknown>;
      const safe: Record<string, unknown> = {};

      if (s.type === 'JUSTDIAL') {
        safe['hasSecret'] = typeof cfg['secret'] === 'string' && cfg['secret'].length > 0;
        safe['webhookUrl'] = `${env.API_URL}/webhooks/justdial`;
      } else if (s.type === 'INDIAMART') {
        safe['hasApiKey'] = typeof cfg['apiKey'] === 'string' && cfg['apiKey'].length > 0;
        safe['mobile'] = cfg['mobile'] ?? null;
        safe['pullFrequency'] = cfg['pullFrequency'] ?? 'daily';
        safe['webhookUrl'] = `${env.API_URL}/webhooks/indiamart`;
      } else if (s.type === 'META') {
        safe['pageId'] = cfg['pageId'] ?? null;
        safe['pageName'] = cfg['pageName'] ?? null;
        safe['hasToken'] = typeof cfg['pageAccessToken'] === 'string' && cfg['pageAccessToken'].length > 0;
        safe['fieldMapping'] = cfg['fieldMapping'] ?? {};
        safe['webhookUrl'] = `${env.API_URL}/webhooks/meta`;
      }

      return { ...s, config: safe };
    });

    return reply.send({ data: sanitised });
  });

  // POST /integrations — create a new lead source
  app.post('/', async (req, reply) => {
    if (!can(req.auth.role, 'integrations.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = createLeadSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const { type, label, config } = parsed.data;

    const existing = await req.withTenant((tx) =>
      tx.leadSource.findFirst({ where: { tenantId: req.auth.tenantId, type } }),
    );

    if (existing) {
      return reply.code(409).send({
        error: { code: 'integrations.duplicate_type', message: `A ${type} integration already exists. Update it instead.` },
      });
    }

    const source = await req.withTenant((tx) =>
      tx.leadSource.create({
        data: {
          tenantId: req.auth.tenantId,
          type,
          label,
          config: config as object,
          isActive: true,
        },
        select: { id: true, type: true, label: true, isActive: true, createdAt: true },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, sourceType: type }, 'integration.created');
    return reply.code(201).send({ data: source });
  });

  // PATCH /integrations/:id — update config / label / toggle active
  app.patch('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'integrations.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };
    const parsed = updateLeadSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() },
      });
    }

    const existing = await req.withTenant((tx) =>
      tx.leadSource.findFirst({ where: { id, tenantId: req.auth.tenantId } }),
    );

    if (!existing) {
      return reply.code(404).send({ error: { code: 'integrations.not_found', message: 'Integration not found' } });
    }

    const mergedConfig: Record<string, unknown> = {
      ...(existing.config as Record<string, unknown>),
      ...(parsed.data.config ?? {}),
    };

    const updated = await req.withTenant((tx) =>
      tx.leadSource.update({
        where: { id },
        data: {
          ...(parsed.data.label !== undefined && { label: parsed.data.label }),
          ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
          config: mergedConfig as never,
        },
        select: { id: true, type: true, label: true, isActive: true, lastSyncAt: true },
      }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, sourceId: id }, 'integration.updated');
    return reply.send({ data: updated });
  });

  // DELETE /integrations/:id — deactivate (soft)
  app.delete('/:id', async (req, reply) => {
    if (!can(req.auth.role, 'integrations.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };

    const existing = await req.withTenant((tx) =>
      tx.leadSource.findFirst({ where: { id, tenantId: req.auth.tenantId } }),
    );

    if (!existing) {
      return reply.code(404).send({ error: { code: 'integrations.not_found', message: 'Integration not found' } });
    }

    await req.withTenant((tx) =>
      tx.leadSource.update({ where: { id }, data: { isActive: false } }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, sourceId: id }, 'integration.deactivated');
    return reply.send({ data: { deactivated: true } });
  });

  // POST /integrations/:id/verify — verify credentials
  app.post('/:id/verify', async (req, reply) => {
    if (!can(req.auth.role, 'integrations.verify')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };

    const source = await req.withTenant((tx) =>
      tx.leadSource.findFirst({ where: { id, tenantId: req.auth.tenantId } }),
    );

    if (!source) {
      return reply.code(404).send({ error: { code: 'integrations.not_found', message: 'Integration not found' } });
    }

    const cfg = source.config as Record<string, unknown>;

    if (source.type === 'JUSTDIAL') {
      const secret = cfg['secret'] as string | undefined;
      if (!secret || secret.length < 8) {
        return reply.code(422).send({ error: { code: 'integrations.invalid_config', message: 'Secret key is required and must be at least 8 characters' } });
      }
      return reply.send({
        data: {
          verified: true,
          webhookUrl: `${env.API_URL}/webhooks/justdial`,
          message: 'Webhook is active. Share this URL and the secret key with JustDial support.',
        },
      });
    }

    if (source.type === 'INDIAMART') {
      const apiKey = cfg['apiKey'] as string | undefined;
      const mobile = cfg['mobile'] as string | undefined;

      if (!apiKey || !mobile) {
        return reply.code(422).send({ error: { code: 'integrations.invalid_config', message: 'API key and mobile are required' } });
      }

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);
      const fmt = (d: Date) =>
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T` +
        `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;

      try {
        const url = `https://mapi.indiamart.com/wservce/crm/crmListing/v2/?glusr_crm_key=${encodeURIComponent(apiKey)}&start_time=${fmt(oneHourAgo)}&end_time=${fmt(now)}&mobile=${encodeURIComponent(mobile)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const json = (await res.json()) as { CODE?: string; MESSAGE?: string };

        if (json.CODE === '200' || json.MESSAGE?.toLowerCase().includes('success')) {
          return reply.send({ data: { verified: true, message: 'IndiaMART credentials verified successfully.' } });
        }

        return reply.code(422).send({
          error: { code: 'integrations.verify_failed', message: `IndiaMART API error: ${json.MESSAGE ?? 'Unknown error'}` },
        });
      } catch {
        return reply.code(502).send({ error: { code: 'integrations.verify_timeout', message: 'Could not reach IndiaMART API. Check your credentials and try again.' } });
      }
    }

    if (source.type === 'META') {
      const token = cfg['pageAccessToken'] as string | undefined;
      if (!token) {
        return reply.code(422).send({ error: { code: 'integrations.invalid_config', message: 'Page Access Token is required' } });
      }

      try {
        const res = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${encodeURIComponent(token)}&fields=id,name`, {
          signal: AbortSignal.timeout(8000),
        });
        const json = (await res.json()) as { id?: string; name?: string; error?: { message: string } };

        if (json.error) {
          return reply.code(422).send({ error: { code: 'integrations.verify_failed', message: `Meta API error: ${json.error.message}` } });
        }

        // Store page info back into config
        const updatedCfg: Record<string, unknown> = { ...cfg, pageId: json.id, pageName: json.name };
        await req.withTenant((tx) =>
          tx.leadSource.update({
            where: { id },
            data: { config: updatedCfg as never },
          }),
        );

        return reply.send({ data: { verified: true, pageId: json.id, pageName: json.name, message: `Connected to Facebook page "${json.name}"` } });
      } catch {
        return reply.code(502).send({ error: { code: 'integrations.verify_timeout', message: 'Could not reach Meta API. Check your token and try again.' } });
      }
    }

    return reply.code(422).send({ error: { code: 'integrations.unsupported_type', message: 'Verification not supported for this integration type' } });
  });

  // POST /integrations/:id/sync — trigger manual pull (IndiaMART only)
  app.post('/:id/sync', async (req, reply) => {
    if (!can(req.auth.role, 'integrations.sync')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { id } = req.params as { id: string };

    const source = await req.withTenant((tx) =>
      tx.leadSource.findFirst({ where: { id, tenantId: req.auth.tenantId, type: 'INDIAMART' } }),
    );

    if (!source) {
      return reply.code(404).send({ error: { code: 'integrations.not_found', message: 'IndiaMART integration not found' } });
    }

    const cfg = source.config as Record<string, unknown>;
    const apiKey = cfg['apiKey'] as string | undefined;
    const mobile = cfg['mobile'] as string | undefined;

    if (!apiKey || !mobile) {
      return reply.code(422).send({ error: { code: 'integrations.invalid_config', message: 'API key and mobile required for sync' } });
    }

    await app.queues.leadIngest.add('indiamart-pull', {
      sourceType: 'INDIAMART',
      sourceId: source.id,
      tenantId: req.auth.tenantId,
      apiKey,
      mobile,
      lookbackHours: 24,
    });

    await req.withTenant((tx) =>
      tx.leadSource.update({ where: { id }, data: { lastSyncAt: new Date() } }),
    );

    req.log.info({ tenantId: req.auth.tenantId, userId: req.auth.userId, sourceId: id }, 'integration.sync_triggered');
    return reply.send({ data: { queued: true, message: 'Sync triggered. Leads will appear within a few seconds.' } });
  });
};
