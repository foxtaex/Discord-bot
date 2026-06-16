import path from 'node:path';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { PermissionError, UserError } from '../core/errors.js';

const loginSchema = z.object({
  key: z.string().min(20).max(200),
});
const factionSchema = z.object({
  name: z.string().min(1).max(100),
  status: z
    .enum(['active', 'inactive', 'recruiting', 'closed'])
    .default('active'),
  type: z.enum(['state', 'legal', 'illegal', 'neutral']).default('neutral'),
  leaderId: z.string().max(32).default(''),
  deputyId: z.string().max(32).default(''),
  discordRoleId: z.string().max(32).default(''),
  channelId: z.string().max(32).default(''),
  description: z.string().max(4000).default(''),
  notes: z.string().max(4000).default(''),
});
const factionUpdateSchema = factionSchema.partial();
const apiKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()).min(1).max(30),
});

export function createWebPanelRouter(context) {
  const router = express.Router();
  const staticDirectory = path.resolve(process.cwd(), 'src/web');
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });

  router.use('/assets', express.static(path.join(staticDirectory, 'assets')));
  router.get('/', (_req, res) => {
    res.sendFile(path.join(staticDirectory, 'index.html'));
  });

  router.post('/api/login', loginLimiter, async (req, res) => {
    const { key } = loginSchema.parse(req.body);
    const exchanged = await context.webAccessService.exchange(key);
    setSessionCookies(res, context, exchanged);
    res.json({
      ok: true,
      session: serializeSession(exchanged.session),
    });
  });

  router.use('/api', authenticatePanelSession(context));

  router.get('/api/session', (req, res) => {
    res.json({ session: serializeSession(req.panelSession) });
  });

  router.post('/api/logout', requireCsrf(context), async (req, res) => {
    await context.webAccessRepository.revokeSession(
      req.panelSession.id,
      new Date(),
    );
    clearSessionCookies(res, context);
    res.json({ ok: true });
  });

  router.get('/api/dashboard', requirePanelPermission('panel:read'), async (req, res) => {
    const guild = await context.client.guilds.fetch(req.panelSession.guildId);
    const [config, factions, webKeys, ticketCount, voiceCount] =
      await Promise.all([
        context.configService.get(guild.id),
        context.factionService.list(guild.id),
        context.webAccessService.list(guild.id),
        context.database('tickets')
          .where({ guild_id: guild.id })
          .count({ count: '*' })
          .first(),
        context.database('voice_cases')
          .where({ guild_id: guild.id })
          .count({ count: '*' })
          .first(),
      ]);
    res.json({
      guild: {
        id: guild.id,
        name: guild.name,
        iconUrl: guild.iconURL({ size: 128 }),
        memberCount: guild.memberCount,
      },
      bot: {
        ready: context.client.isReady(),
        user: context.client.user?.tag || null,
        ping: context.client.ws.ping,
        uptime: process.uptime(),
      },
      modules: {
        welcome: config.welcome.enabled,
        tickets: config.tickets.enabled,
        voiceSupport: config.voiceSupport.enabled,
        factions: config.factions.enabled,
      },
      counts: {
        factions: factions.length,
        webKeys: webKeys.length,
        tickets: Number(ticketCount?.count || 0),
        voiceCases: Number(voiceCount?.count || 0),
      },
    });
  });

  router.get('/api/config', requirePanelPermission('panel:read'), async (req, res) => {
    res.json(await context.configService.get(req.panelSession.guildId));
  });

  router.patch(
    '/api/config',
    requirePanelPermission('config:write'),
    requireCsrf(context),
    async (req, res) => {
      const patch = z.record(z.string(), z.unknown()).parse(req.body);
      const config = await context.configService.update(
        req.panelSession.guildId,
        patch,
      );
      await auditPanel(context, req, 'Konfiguration wurde aktualisiert.', {
        fields: Object.keys(patch),
      });
      res.json(config);
    },
  );

  router.put(
    '/api/ticket-categories',
    requirePanelPermission('config:write'),
    requireCsrf(context),
    async (req, res) => {
      const categories = z
        .array(
          z.object({
            key: z.string().regex(/^[a-z0-9_-]{2,64}$/),
            label: z.string().min(1).max(100),
            description: z.string().max(100).default(''),
            emoji: z.string().max(100).default(''),
            parentCategoryId: z.string().default(''),
            supportRoleIds: z.array(z.string()).default([]),
          }),
        )
        .max(25)
        .parse(req.body);
      const config = await context.configService.replaceCategories(
        req.panelSession.guildId,
        categories,
      );
      await context.services.tickets.refreshPanels(req.panelSession.guildId);
      await auditPanel(context, req, 'Ticket-Kategorien wurden aktualisiert.', {
        count: categories.length,
      });
      res.json(config.tickets.categories);
    },
  );

  router.get('/api/factions', requirePanelPermission('factions:read'), async (req, res) => {
    res.json({
      factions: await context.factionService.list(req.panelSession.guildId),
    });
  });

  router.post(
    '/api/factions',
    requirePanelPermission('factions:write'),
    requireCsrf(context),
    async (req, res) => {
      const faction = await context.factionService.create(
        req.panelSession.guildId,
        factionSchema.parse(req.body),
        panelActor(req),
      );
      res.status(201).json(faction);
    },
  );

  router.patch(
    '/api/factions/:id',
    requirePanelPermission('factions:write'),
    requireCsrf(context),
    async (req, res) => {
      res.json(
        await context.factionService.update(
          req.panelSession.guildId,
          req.params.id,
          factionUpdateSchema.parse(req.body),
          panelActor(req),
        ),
      );
    },
  );

  router.delete(
    '/api/factions/:id',
    requirePanelPermission('factions:write'),
    requireCsrf(context),
    async (req, res) => {
      res.json(
        await context.factionService.remove(
          req.panelSession.guildId,
          req.params.id,
          panelActor(req),
        ),
      );
    },
  );

  router.get('/api/webkeys', requirePanelPermission('panel:read'), async (req, res) => {
    res.json({
      keys: await context.webAccessService.list(req.panelSession.guildId),
    });
  });

  router.post(
    '/api/webkeys',
    requirePanelPermission('admin:keys'),
    requireCsrf(context),
    async (req, res) => {
      const body = z
        .object({
          permissionLevel: z.enum(['viewer', 'editor', 'admin']),
          durationHours: z.number().int().min(1).max(24).default(2),
        })
        .parse(req.body);
      res.status(201).json(
        await context.webAccessService.create({
          guildId: req.panelSession.guildId,
          createdBy: req.panelSession.userId,
          ...body,
        }),
      );
    },
  );

  router.delete(
    '/api/webkeys/:id',
    requirePanelPermission('admin:keys'),
    requireCsrf(context),
    async (req, res) => {
      res.json(
        await context.webAccessService.revoke(
          req.panelSession.guildId,
          req.params.id,
          panelActor(req),
        ),
      );
    },
  );

  router.get('/api/api-keys', requirePanelPermission('admin:keys'), async (req, res) => {
    const keys = await context.apiKeyService.list();
    res.json({
      keys: keys.filter(
        (key) => key.allowedGuildIds.includes(req.panelSession.guildId),
      ),
    });
  });

  router.post(
    '/api/api-keys',
    requirePanelPermission('admin:keys'),
    requireCsrf(context),
    async (req, res) => {
      const body = apiKeySchema.parse(req.body);
      const created = await context.apiKeyService.create({
        name: body.name,
        permissions: body.permissions,
        allowedGuildIds: [req.panelSession.guildId],
      });
      await auditPanel(context, req, `API-Key "${body.name}" wurde erstellt.`);
      res.status(201).json(created);
    },
  );

  router.delete(
    '/api/api-keys/:id',
    requirePanelPermission('admin:keys'),
    requireCsrf(context),
    async (req, res) => {
      const key = await context.apiKeyService.find(Number(req.params.id));
      if (
        !key ||
        !key.allowedGuildIds.includes(req.panelSession.guildId)
      ) {
        throw new UserError('API-Key nicht gefunden.', 'NOT_FOUND', 404);
      }
      await context.apiKeyService.revoke(Number(req.params.id));
      await auditPanel(context, req, `API-Key #${req.params.id} wurde widerrufen.`);
      res.json({ ok: true });
    },
  );

  router.get('/api/logs', requirePanelPermission('logs:read'), async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    res.json({
      logs: await context.logRepository.list({
        guildId: req.panelSession.guildId,
        limit,
      }),
    });
  });

  return router;
}

function authenticatePanelSession(context) {
  return async function authenticate(req, res, next) {
    const sessionToken = parseCookies(req).panel_session;
    const session =
      await context.webAccessService.authenticateSession(sessionToken);
    if (!session) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Webpanel-Sitzung ungueltig.' },
      });
      return;
    }
    req.panelSession = session;
    next();
  };
}

function requirePanelPermission(permission) {
  return function authorize(req, _res, next) {
    const permissions = req.panelSession.permissions;
    if (!permissions.includes('*') && !permissions.includes(permission)) {
      next(new PermissionError(`Webpanel-Berechtigung "${permission}" fehlt.`));
      return;
    }
    next();
  };
}

function requireCsrf(context) {
  return function csrf(req, _res, next) {
    const token = req.get('x-csrf-token');
    if (!context.webAccessService.verifyCsrf(req.panelSession, token)) {
      next(new UserError('Ungueltiger CSRF-Token.', 'CSRF_ERROR', 403));
      return;
    }
    next();
  };
}

function setSessionCookies(res, context, exchanged) {
  const maxAge = Math.max(
    0,
    new Date(exchanged.session.expiresAt).getTime() - Date.now(),
  );
  const options = {
    path: '/panel',
    sameSite: 'strict',
    secure: context.config.api.webPanelCookieSecure,
    maxAge,
  };
  res.cookie('panel_session', exchanged.sessionToken, {
    ...options,
    httpOnly: true,
  });
  res.cookie('panel_csrf', exchanged.csrfToken, {
    ...options,
    httpOnly: false,
  });
}

function clearSessionCookies(res, context) {
  const options = {
    path: '/panel',
    sameSite: 'strict',
    secure: context.config.api.webPanelCookieSecure,
  };
  res.clearCookie('panel_session', options);
  res.clearCookie('panel_csrf', options);
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.get('cookie') || '')
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf('=');
        if (separator === -1) return [decodeURIComponent(entry), ''];
        return [
          decodeURIComponent(entry.slice(0, separator)),
          decodeURIComponent(entry.slice(separator + 1)),
        ];
      }),
  );
}

function serializeSession(session) {
  return {
    guildId: session.guildId,
    userId: session.userId,
    permissionLevel: session.permissionLevel,
    permissions: session.permissions,
    expiresAt: session.expiresAt,
  };
}

function panelActor(req) {
  return `panel:${req.panelSession.userId}`;
}

function auditPanel(context, req, message, details = {}) {
  return context.auditService.write({
    guildId: req.panelSession.guildId,
    source: 'webpanel',
    message,
    context: {
      actorId: req.panelSession.userId,
      sessionId: req.panelSession.id,
      ...details,
    },
  });
}
