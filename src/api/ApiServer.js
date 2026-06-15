import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { createAuthMiddleware, requirePermission } from './auth.js';
import { createOpenApiDocument } from './openapi.js';
import { UserError } from '../core/errors.js';

const messageSchema = z.object({
  channelId: z.string().min(1),
  content: z.string().max(2000).optional(),
  embeds: z
    .array(
      z.object({
        title: z.string().max(256).optional(),
        description: z.string().max(4096).optional(),
        color: z.number().int().min(0).max(0xffffff).optional(),
        url: z.url().optional(),
        footer: z.object({ text: z.string().max(2048) }).optional(),
        fields: z
          .array(
            z.object({
              name: z.string().max(256),
              value: z.string().max(1024),
              inline: z.boolean().optional(),
            }),
          )
          .max(25)
          .optional(),
      }),
    )
    .max(10)
    .optional(),
});

const ticketCreateSchema = z.object({
  userId: z.string().min(1),
  categoryKey: z.string().min(1),
});

const categorySchema = z.array(
  z.object({
    key: z.string().regex(/^[a-z0-9_-]+$/),
    label: z.string().min(1).max(100),
    description: z.string().max(100).default(''),
    emoji: z.string().max(100).default(''),
    parentCategoryId: z.string().default(''),
    supportRoleIds: z.array(z.string()).default([]),
  }),
);

export class ApiServer {
  constructor(context) {
    this.context = context;
    this.server = null;
    this.app = express();
    this.configure();
  }

  configure() {
    const { config, apiKeyService } = this.context;
    this.app.disable('x-powered-by');
    this.app.use(helmet());
    this.app.use(express.json({ limit: '256kb' }));
    this.app.use(
      rateLimit({
        windowMs: 60_000,
        limit: config.api.rateLimit,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
      }),
    );

    if (config.api.corsOrigins.length > 0) {
      this.app.use(
        cors({
          origin: config.api.corsOrigins,
          methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
        }),
      );
    }

    this.app.get('/api/health', (_req, res) => {
      res.json({
        status: 'ok',
        discord: this.context.client.isReady(),
        uptime: process.uptime(),
      });
    });
    this.app.get('/api/openapi.json', (_req, res) => {
      res.json(createOpenApiDocument(config.api.port));
    });

    this.app.use('/api/v1', createAuthMiddleware(apiKeyService));
    this.registerRoutes();
    this.app.use((error, _req, res, _next) => this.handleError(error, res));
  }

  registerRoutes() {
    const router = express.Router();
    const {
      client,
      configService,
      ticketRepository,
      auditService,
      services,
    } = this.context;

    router.get(
      '/guilds/:guildId/config',
      requirePermission('config:read'),
      async (req, res) => {
        res.json(await configService.get(req.params.guildId));
      },
    );

    router.patch(
      '/guilds/:guildId/config',
      requirePermission('config:write'),
      async (req, res) => {
        const patch = z.record(z.string(), z.unknown()).parse(req.body);
        res.json(await configService.update(req.params.guildId, patch));
      },
    );

    router.put(
      '/guilds/:guildId/ticket-categories',
      requirePermission('config:write'),
      async (req, res) => {
        const categories = categorySchema.parse(req.body);
        res.json(
          await configService.replaceCategories(req.params.guildId, categories),
        );
      },
    );

    router.post(
      '/guilds/:guildId/messages',
      requirePermission('messages:write'),
      async (req, res) => {
        const body = messageSchema.parse(req.body);
        if (!body.content && !body.embeds?.length) {
          throw new UserError('content oder embeds muss gesetzt sein.');
        }
        const guild = await client.guilds.fetch(req.params.guildId);
        const channel = await guild.channels.fetch(body.channelId);
        if (!channel?.isTextBased()) {
          throw new UserError('Der Zielkanal ist nicht textbasiert.');
        }
        const message = await channel.send({
          content: body.content,
          embeds: body.embeds,
          allowedMentions: { parse: [] },
        });
        res.status(201).json({ id: message.id, channelId: message.channelId });
      },
    );

    router.get(
      '/guilds/:guildId/users/:userId',
      requirePermission('users:read'),
      async (req, res) => {
        const guild = await client.guilds.fetch(req.params.guildId);
        const member = await guild.members.fetch(req.params.userId);
        res.json({
          id: member.id,
          username: member.user.username,
          displayName: member.displayName,
          avatarUrl: member.displayAvatarURL({ size: 256 }),
          joinedAt: member.joinedAt?.toISOString() || null,
          roles: member.roles.cache
            .filter((role) => role.id !== guild.id)
            .map((role) => ({ id: role.id, name: role.name })),
        });
      },
    );

    router.get(
      '/guilds/:guildId/tickets',
      requirePermission('tickets:read'),
      async (req, res) => {
        const limit = Math.min(Number(req.query.limit) || 100, 500);
        const tickets = await ticketRepository.list({
          guildId: req.params.guildId,
          status: req.query.status,
          userId: req.query.userId,
          limit,
        });
        res.json({ tickets });
      },
    );

    router.post(
      '/guilds/:guildId/tickets',
      requirePermission('tickets:write'),
      async (req, res) => {
        const body = ticketCreateSchema.parse(req.body);
        const guild = await client.guilds.fetch(req.params.guildId);
        const member = await guild.members.fetch(body.userId);
        const ticket = await services.tickets.createTicket(
          guild,
          member.user,
          body.categoryKey,
          apiActor(req),
        );
        res.status(201).json(ticket);
      },
    );

    router.get(
      '/guilds/:guildId/tickets/:ticketId',
      requirePermission('tickets:read'),
      async (req, res) => {
        const ticket = await getTicket(ticketRepository, req);
        const actions = await ticketRepository.listActions(ticket.id);
        res.json({ ticket, actions });
      },
    );

    router.post(
      '/guilds/:guildId/tickets/:ticketId/close',
      requirePermission('tickets:write'),
      async (req, res) => {
        const ticket = await getTicket(ticketRepository, req);
        res.json(
          await services.tickets.close(ticket, apiActor(req), { system: true }),
        );
      },
    );

    router.post(
      '/guilds/:guildId/tickets/:ticketId/reopen',
      requirePermission('tickets:write'),
      async (req, res) => {
        const ticket = await getTicket(ticketRepository, req);
        res.json(
          await services.tickets.reopen(ticket, apiActor(req), { system: true }),
        );
      },
    );

    router.post(
      '/guilds/:guildId/tickets/:ticketId/transcript',
      requirePermission('tickets:read'),
      async (req, res) => {
        const ticket = await getTicket(ticketRepository, req);
        const filePath = await services.tickets.createTranscript(ticket);
        res.json({ ticketId: ticket.publicId, filePath });
      },
    );

    router.delete(
      '/guilds/:guildId/tickets/:ticketId',
      requirePermission('tickets:delete'),
      async (req, res) => {
        const ticket = await getTicket(ticketRepository, req);
        res.json(
          await services.tickets.delete(ticket, apiActor(req), { system: true }),
        );
      },
    );

    router.post(
      '/guilds/:guildId/logs',
      requirePermission('logs:write'),
      async (req, res) => {
        const body = z
          .object({
            level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
            source: z.string().min(1).max(64),
            message: z.string().min(1).max(4000),
            context: z.record(z.string(), z.unknown()).default({}),
            discord: z.boolean().default(false),
          })
          .parse(req.body);
        await auditService.write({ guildId: req.params.guildId, ...body });
        res.status(201).json({ ok: true });
      },
    );

    this.app.use('/api/v1', router);
  }

  handleError(error, res) {
    const isValidation = error instanceof z.ZodError;
    const status = isValidation ? 400 : error.status || 500;
    this.context.logger[status >= 500 ? 'error' : 'warn'](
      { error },
      'API request failed',
    );
    res.status(status).json({
      error: {
        code: isValidation ? 'VALIDATION_ERROR' : error.code || 'INTERNAL_ERROR',
        message:
          status >= 500
            ? 'Interner Serverfehler.'
            : error.message || 'Ungueltige Anfrage.',
        details: isValidation ? error.issues : undefined,
      },
    });
  }

  async start() {
    const { host, port } = this.context.config.api;
    await new Promise((resolve) => {
      this.server = this.app.listen(port, host, resolve);
    });
    this.context.logger.info({ host, port }, 'REST API listening');
  }

  async stop() {
    if (!this.server) return;
    await new Promise((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function getTicket(repository, req) {
  const raw = req.params.ticketId;
  let ticket = await repository.findByPublicId(raw);
  if (!ticket && /^\d{6}$/.test(raw)) {
    ticket = await repository.findByTicketNumber(raw);
  }
  if (!ticket && /^\d+$/.test(raw)) {
    ticket = await repository.findById(Number(raw));
  }
  if (!ticket || ticket.guildId !== req.params.guildId) {
    throw new UserError('Ticket nicht gefunden.', 'NOT_FOUND', 404);
  }
  return ticket;
}

function apiActor(req) {
  return `api:${req.principal.id}`;
}
