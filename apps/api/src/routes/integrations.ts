import type { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { can } from '@excess/shared';
import { createLeadSourceSchema, updateLeadSourceSchema } from '@excess/shared';
import { env } from '@excess/config';
import { prisma, withSystemContext } from '@excess/db';

function signState(tenantId: string): string {
  const sig = crypto.createHmac('sha256', env.SESSION_SECRET).update(tenantId).digest('hex').slice(0, 16);
  return Buffer.from(`${tenantId}.${sig}`).toString('base64url');
}

function verifyState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const dotIdx = decoded.indexOf('.');
    if (dotIdx < 1) return null;
    const tenantId = decoded.slice(0, dotIdx);
    const sig = decoded.slice(dotIdx + 1);
    const expected = crypto.createHmac('sha256', env.SESSION_SECRET).update(tenantId).digest('hex').slice(0, 16);
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return tenantId;
  } catch {
    return null;
  }
}

const META_OAUTH_REDIRECT = `${env.API_URL}/integrations/meta/callback`;

interface FbPage { id: string; name: string; category: string; access_token: string }

const metaConnectSchema = z.object({
  sourceId: z.string().min(1),
  pageId: z.string().min(1),
  formId: z.string().optional(),
  formName: z.string().optional(),
});

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
        safe['formId'] = cfg['formId'] ?? null;
        safe['formName'] = cfg['formName'] ?? null;
        safe['hasToken'] = typeof cfg['pageAccessToken'] === 'string' && cfg['pageAccessToken'].length > 0;
        safe['hasPendingPages'] = Array.isArray(cfg['pendingPages']) && (cfg['pendingPages'] as unknown[]).length > 0;
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

  // ── Meta / Facebook OAuth ──────────────────────────────────────────────────

  // GET /integrations/meta/oauth-url — generate Facebook OAuth URL
  app.get('/meta/oauth-url', async (req, reply) => {
    if (!can(req.auth.role, 'integrations.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    if (!env.META_APP_ID) {
      return reply.code(503).send({
        error: { code: 'integrations.meta_not_configured', message: 'Facebook integration is not enabled on this server. Contact your administrator to add META_APP_ID and META_APP_SECRET.' },
      });
    }

    const state = signState(req.auth.tenantId);
    const params = new URLSearchParams({
      client_id: env.META_APP_ID,
      redirect_uri: META_OAUTH_REDIRECT,
      state,
      scope: 'pages_show_list,pages_read_engagement,leads_retrieval',
      response_type: 'code',
      auth_type: 'rerequest',
    });

    return reply.send({ data: { url: `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}` } });
  });

  // GET /integrations/meta/callback — public OAuth callback from Facebook
  app.get('/meta/callback', { config: { public: true } }, async (req, reply) => {
    const q = req.query as Record<string, string>;

    if (q['error']) {
      req.log.warn({ error: q['error'] }, 'Meta OAuth cancelled by user');
      return reply.redirect(`${env.APP_URL}/leads/integrations?fb=cancelled`);
    }

    const { code, state } = q;
    if (!code || !state) {
      return reply.redirect(`${env.APP_URL}/leads/integrations?fb=error`);
    }

    const tenantId = verifyState(state);
    if (!tenantId) {
      req.log.warn('Meta OAuth state verification failed');
      return reply.redirect(`${env.APP_URL}/leads/integrations?fb=error`);
    }

    if (!env.META_APP_ID || !env.META_APP_SECRET) {
      return reply.redirect(`${env.APP_URL}/leads/integrations?fb=error`);
    }

    try {
      // Exchange code for short-lived user access token
      const tokenParams = new URLSearchParams({
        client_id: env.META_APP_ID,
        client_secret: env.META_APP_SECRET,
        redirect_uri: META_OAUTH_REDIRECT,
        code,
      });
      const tokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?${tokenParams.toString()}`,
        { signal: AbortSignal.timeout(10000) },
      );
      const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: { message: string } };

      if (!tokenJson.access_token) {
        req.log.warn({ error: tokenJson.error }, 'Meta token exchange failed');
        return reply.redirect(`${env.APP_URL}/leads/integrations?fb=error`);
      }

      // Exchange for 60-day long-lived user access token
      const llParams = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: env.META_APP_ID,
        client_secret: env.META_APP_SECRET,
        fb_exchange_token: tokenJson.access_token,
      });
      const llRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?${llParams.toString()}`,
        { signal: AbortSignal.timeout(10000) },
      );
      const llJson = (await llRes.json()) as { access_token?: string };
      const longLivedToken = llJson.access_token ?? tokenJson.access_token;

      // Fetch the pages the user manages (page tokens are already long-lived)
      const pagesRes = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(longLivedToken)}&fields=id,name,category,access_token&limit=50`,
        { signal: AbortSignal.timeout(10000) },
      );
      const pagesJson = (await pagesRes.json()) as { data?: FbPage[]; error?: { message: string } };

      if (!pagesJson.data) {
        req.log.warn({ error: pagesJson.error }, 'Meta pages fetch failed');
        return reply.redirect(`${env.APP_URL}/leads/integrations?fb=error`);
      }

      const pendingPages = pagesJson.data.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category ?? '',
        accessToken: p.access_token,
      }));

      const existing = await withSystemContext(prisma, tenantId, (tx) =>
        tx.leadSource.findFirst({ where: { tenantId, type: 'META' } }),
      );

      if (existing) {
        await withSystemContext(prisma, tenantId, (tx) =>
          tx.leadSource.update({
            where: { id: existing.id },
            data: { config: { pendingPages } as never, isActive: false },
          }),
        );
      } else {
        await withSystemContext(prisma, tenantId, (tx) =>
          tx.leadSource.create({
            data: { tenantId, type: 'META', label: 'Meta Lead Ads', config: { pendingPages } as never, isActive: false },
          }),
        );
      }

      req.log.info({ tenantId, pageCount: pendingPages.length }, 'integration.meta_oauth_success');
      return reply.redirect(`${env.APP_URL}/leads/integrations?fb=connected`);
    } catch (err) {
      req.log.error(err, 'Meta OAuth callback error');
      return reply.redirect(`${env.APP_URL}/leads/integrations?fb=error`);
    }
  });

  // GET /integrations/meta/pages — list pages fetched during OAuth
  app.get('/meta/pages', async (req, reply) => {
    if (!can(req.auth.role, 'integrations.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const source = await req.withTenant((tx) =>
      tx.leadSource.findFirst({ where: { tenantId: req.auth.tenantId, type: 'META' } }),
    );

    if (!source) {
      return reply.code(404).send({ error: { code: 'integrations.not_found', message: 'No Meta integration found. Connect with Facebook first.' } });
    }

    const cfg = source.config as Record<string, unknown>;
    const pendingPages = cfg['pendingPages'] as { id: string; name: string; category: string }[] | undefined;

    if (!pendingPages?.length) {
      return reply.code(422).send({ error: { code: 'integrations.no_pages', message: 'No Facebook pages found. Make sure you manage at least one Facebook Page.' } });
    }

    return reply.send({ data: { pages: pendingPages, sourceId: source.id } });
  });

  // GET /integrations/meta/pages/:pageId/forms — list lead forms for a page
  app.get('/meta/pages/:pageId/forms', async (req, reply) => {
    if (!can(req.auth.role, 'integrations.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const { pageId } = req.params as { pageId: string };

    const source = await req.withTenant((tx) =>
      tx.leadSource.findFirst({ where: { tenantId: req.auth.tenantId, type: 'META' } }),
    );

    if (!source) {
      return reply.code(404).send({ error: { code: 'integrations.not_found', message: 'No Meta integration found.' } });
    }

    const cfg = source.config as Record<string, unknown>;
    const pendingPages = cfg['pendingPages'] as { id: string; name: string; accessToken: string }[] | undefined;
    const page = pendingPages?.find((p) => p.id === pageId);

    if (!page) {
      return reply.code(404).send({ error: { code: 'integrations.page_not_found', message: 'Page not found in your connected pages.' } });
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${pageId}/leadgen_forms?access_token=${encodeURIComponent(page.accessToken)}&fields=id,name,status&limit=50`,
        { signal: AbortSignal.timeout(8000) },
      );
      const json = (await res.json()) as { data?: { id: string; name: string; status: string }[]; error?: { message: string } };

      if (json.error) {
        return reply.code(502).send({ error: { code: 'integrations.fb_api_error', message: `Facebook API error: ${json.error.message}` } });
      }

      return reply.send({ data: { forms: json.data ?? [] } });
    } catch {
      return reply.code(502).send({ error: { code: 'integrations.timeout', message: 'Could not reach Facebook API. Please try again.' } });
    }
  });

  // POST /integrations/meta/connect — finalize page + form selection
  app.post('/meta/connect', async (req, reply) => {
    if (!can(req.auth.role, 'integrations.write')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const parsed = metaConnectSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: parsed.error.flatten() } });
    }

    const { sourceId, pageId, formId, formName } = parsed.data;

    const source = await req.withTenant((tx) =>
      tx.leadSource.findFirst({ where: { id: sourceId, tenantId: req.auth.tenantId, type: 'META' } }),
    );

    if (!source) {
      return reply.code(404).send({ error: { code: 'integrations.not_found', message: 'Meta integration not found.' } });
    }

    const cfg = source.config as Record<string, unknown>;
    const pendingPages = cfg['pendingPages'] as { id: string; name: string; accessToken: string }[] | undefined;
    const page = pendingPages?.find((p) => p.id === pageId);

    if (!page) {
      return reply.code(404).send({ error: { code: 'integrations.page_not_found', message: 'Selected page not found. Try reconnecting with Facebook.' } });
    }

    // Subscribe app to page leadgen events
    let subscribed = false;
    try {
      const subRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ access_token: page.accessToken, subscribed_fields: 'leadgen' }).toString(),
        signal: AbortSignal.timeout(8000),
      });
      const subJson = (await subRes.json()) as { success?: boolean; error?: { message: string } };
      subscribed = subJson.success === true;
    } catch {
      subscribed = false;
    }

    const finalConfig: Record<string, unknown> = {
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.accessToken,
      ...(formId && { formId }),
      ...(formName && { formName }),
    };

    await req.withTenant((tx) =>
      tx.leadSource.update({
        where: { id: sourceId },
        data: { config: finalConfig as never, isActive: true },
      }),
    );

    req.log.info(
      { tenantId: req.auth.tenantId, userId: req.auth.userId, pageId, formId: formId ?? 'all', subscribed },
      'integration.meta_connected',
    );

    const message = subscribed
      ? `Connected to "${page.name}". New leads will flow in automatically.`
      : `Connected to "${page.name}". Note: webhook subscription failed — verify your Meta App has the leadgen webhook configured and the app is approved for leads_retrieval (or add yourself as a test user in Development Mode).`;

    return reply.send({ data: { connected: true, pageName: page.name, subscribed, message } });
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

  // GET /integrations/health — per-source lead activity health
  app.get('/health', async (req, reply) => {
    if (!can(req.auth.role, 'integrations.read')) {
      return reply.code(403).send({ error: { code: 'forbidden', message: 'Forbidden' } });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart  = new Date(now.getTime() - 7 * 86400000);

    const [sources, leadsToday, leadsThisWeek] = await req.withTenant((tx) =>
      Promise.all([
        tx.leadSource.findMany({
          where: { tenantId: req.auth.tenantId },
          select: { id: true, type: true, isActive: true, createdAt: true },
        }),
        tx.lead.groupBy({
          by: ['sourceId'],
          where: { tenantId: req.auth.tenantId, createdAt: { gte: todayStart }, sourceId: { not: null } },
          _count: { id: true },
        }),
        tx.lead.groupBy({
          by: ['sourceId'],
          where: { tenantId: req.auth.tenantId, createdAt: { gte: weekStart }, sourceId: { not: null } },
          _count: { id: true },
        }),
      ]),
    );

    const lastLeads = await req.withTenant((tx) =>
      tx.lead.findMany({
        where: { tenantId: req.auth.tenantId, sourceId: { in: sources.map((s) => s.id) } },
        orderBy: { createdAt: 'desc' },
        select: { sourceId: true, createdAt: true },
        distinct: ['sourceId'],
      }),
    );

    const todayMap = new Map(leadsToday.map((l) => [l.sourceId, l._count.id]));
    const weekMap  = new Map(leadsThisWeek.map((l) => [l.sourceId, l._count.id]));
    const lastMap  = new Map(lastLeads.map((l) => [l.sourceId, l.createdAt]));

    const health = sources.map((s) => {
      const lastAt  = lastMap.get(s.id);
      const isRecent = lastAt ? lastAt > new Date(now.getTime() - 48 * 3600000) : false;
      const hasWeek  = (weekMap.get(s.id) ?? 0) > 0;
      const status = !s.isActive ? 'inactive'
        : isRecent   ? 'healthy'
        : hasWeek    ? 'slow'
        : 'stale';
      return {
        sourceId:      s.id,
        type:          s.type,
        isActive:      s.isActive,
        leadsToday:    todayMap.get(s.id) ?? 0,
        leadsThisWeek: weekMap.get(s.id) ?? 0,
        lastLeadAt:    lastAt?.toISOString() ?? null,
        status,
      };
    });

    const totalLeadsToday    = health.reduce((s, h) => s + h.leadsToday, 0);
    const totalLeadsThisWeek = health.reduce((s, h) => s + h.leadsThisWeek, 0);

    return reply.send({ data: { health, totalLeadsToday, totalLeadsThisWeek } });
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
