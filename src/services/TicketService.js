import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} from 'discord.js';
import { UserError, NotFoundError, PermissionError } from '../core/errors.js';
import { parseColor, sanitizeChannelName } from '../utils/discord.js';

export class TicketService {
  constructor({
    client,
    configService,
    ticketRepository,
    ticketPanelRepository,
    transcriptService,
    permissionService,
    auditService,
    logger,
  }) {
    this.client = client;
    this.configService = configService;
    this.ticketRepository = ticketRepository;
    this.ticketPanelRepository = ticketPanelRepository;
    this.transcriptService = transcriptService;
    this.permissionService = permissionService;
    this.auditService = auditService;
    this.logger = logger;
  }

  async sendPanel(channel, createdBy = null) {
    const config = await this.configService.get(channel.guild.id);
    if (!config.tickets.enabled) {
      throw new UserError('Das Ticket-System ist deaktiviert.');
    }
    const payload = this.createPanelPayload(config, {
      requireCategories: true,
    });
    const message = await channel.send(payload);
    await this.registerPanelMessage(message, createdBy);
    return message;
  }

  createPanelPayload(config, { requireCategories = false } = {}) {
    const categories = config.tickets.categories.slice(0, 25);
    if (requireCategories && categories.length === 0) {
      throw new UserError('Es sind keine Ticket-Kategorien konfiguriert.');
    }

    const embed = new EmbedBuilder()
      .setColor(parseColor(config.branding.color))
      .setTitle(config.tickets.panel.title)
      .setDescription(
        categories.length > 0
          ? config.tickets.panel.description
          : `${config.tickets.panel.description}\n\nAktuell sind keine Ticket-Kategorien verfuegbar.`,
      )
      .setFooter({ text: config.branding.footer });
    const openButton = new ButtonBuilder()
      .setCustomId('ticket-open')
      .setLabel('Open Ticket')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(categories.length === 0);
    return {
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(openButton)],
    };
  }

  async createCategorySelectionPayload(guildId) {
    const config = await this.configService.get(guildId, { refresh: true });
    const categories = config.tickets.categories.slice(0, 25);
    if (!config.tickets.enabled) {
      throw new UserError('Das Ticket-System ist deaktiviert.');
    }
    if (categories.length === 0) {
      throw new UserError('Es sind keine Ticket-Kategorien konfiguriert.');
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId('ticket:create')
      .setPlaceholder(config.tickets.panel.placeholder)
      .addOptions(
        categories.map((category) => {
          const option = {
            label: category.label,
            description: category.description.slice(0, 100),
            value: category.key,
          };
          if (category.emoji) option.emoji = category.emoji;
          return option;
        }),
      );

    return {
      embeds: [
        new EmbedBuilder()
          .setColor(parseColor(config.branding.color))
          .setTitle('Select a ticket category')
          .setDescription(
            categories
              .map(
                (category) =>
                  `${category.emoji || ''} **${category.label}**\n${category.description}`,
              )
              .join('\n\n')
              .slice(0, 4096),
          )
          .setFooter({ text: config.branding.footer }),
      ],
      components: [new ActionRowBuilder().addComponents(select)],
    };
  }

  async registerPanelMessage(message, createdBy = null) {
    if (!this.ticketPanelRepository || !message?.guildId) return null;
    return this.ticketPanelRepository.register({
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      createdBy,
    });
  }

  async refreshPanels(guildId) {
    if (!this.ticketPanelRepository) {
      return { total: 0, updated: 0, removed: 0, failed: 0 };
    }
    const panels = await this.ticketPanelRepository.listByGuild(guildId);
    if (panels.length === 0) {
      return { total: 0, updated: 0, removed: 0, failed: 0 };
    }

    const config = await this.configService.get(guildId, { refresh: true });
    const payload = this.createPanelPayload(config);
    const guild = await this.client.guilds.fetch(guildId);
    const result = {
      total: panels.length,
      updated: 0,
      removed: 0,
      failed: 0,
    };

    for (const panel of panels) {
      const channel = await guild.channels
        .fetch(panel.channelId)
        .catch(() => null);
      if (!channel?.isTextBased() || !channel.messages) {
        await this.ticketPanelRepository.removeByMessage(panel.messageId);
        result.removed += 1;
        continue;
      }

      const message = await channel.messages
        .fetch(panel.messageId)
        .catch(() => null);
      if (!message) {
        await this.ticketPanelRepository.removeByMessage(panel.messageId);
        result.removed += 1;
        continue;
      }

      try {
        await message.edit(payload);
        result.updated += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.warn(
          {
            error,
            guildId,
            channelId: panel.channelId,
            messageId: panel.messageId,
          },
          'Ticket panel could not be updated',
        );
      }
    }
    return result;
  }

  async createTicket(guild, user, categoryKey, actorId = user.id) {
    const config = await this.configService.get(guild.id);
    if (!config.tickets.enabled) {
      throw new UserError('Das Ticket-System ist deaktiviert.');
    }

    const category = this.getCategory(config, categoryKey);
    if (!category) throw new UserError('Diese Ticket-Kategorie existiert nicht.');

    const maxActive = config.tickets.maxActivePerCategory;
    const activeCount = await this.ticketRepository.countActive(
      guild.id,
      user.id,
      categoryKey,
    );
    if (activeCount >= maxActive) {
      throw new UserError(
        `Du hast in dieser Kategorie bereits ${activeCount} aktive Tickets. Archiviere zuerst eines, bevor du ein neues erstellst.`,
      );
    }

    let ticket;
    try {
      ticket = await this.ticketRepository.create({
        guildId: guild.id,
        userId: user.id,
        categoryKey,
        maxActive,
      });
    } catch (error) {
      if (error.code === 'TICKET_ACTIVE_LIMIT') {
        throw new UserError(
          `Du hast in dieser Kategorie bereits ${maxActive} aktive Tickets. Archiviere zuerst eines, bevor du ein neues erstellst.`,
        );
      }
      throw error;
    }

    try {
      const supportRoleIds = unique([
        ...config.tickets.supportRoleIds,
        ...category.supportRoleIds,
      ]);
      const channel = await guild.channels.create({
        name: createTicketChannelName('ticket', ticket, user.username),
        type: ChannelType.GuildText,
        parent:
          category.parentCategoryId || config.tickets.categoryId || undefined,
        topic: `Ticket ${ticket.ticketNumber} | Nutzer ${user.id} | Kategorie ${category.key}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks,
            ],
          },
          {
            id: this.client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.ManageMessages,
              PermissionFlagsBits.AttachFiles,
            ],
          },
          ...supportRoleIds.map((roleId) => ({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
            ],
          })),
        ],
        reason: `Ticket ${ticket.ticketNumber} fuer ${user.tag}`,
      });

      ticket = await this.ticketRepository.update(ticket.id, {
        channel_id: channel.id,
        status: 'open',
      });
      await this.ticketRepository.addAction(
        ticket.id,
        'created',
        actorId,
        { channelId: channel.id, categoryKey },
      );
      await this.sendTicketControls(channel, ticket, category, supportRoleIds);
      await this.auditService.write({
        guildId: guild.id,
        source: 'ticket',
        message: `Ticket ${ticket.ticketNumber} wurde erstellt.`,
        context: {
          ticketNumber: ticket.ticketNumber,
          userId: user.id,
          categoryKey,
          channelId: channel.id,
        },
        discord: true,
      });
      return ticket;
    } catch (error) {
      await this.ticketRepository.update(ticket.id, {
        status: 'failed',
        active_key: null,
      });
      await this.ticketRepository.addAction(ticket.id, 'creation_failed', actorId, {
        error: error.message,
      });
      throw error;
    }
  }

  async claim(ticket, member) {
    const config = await this.configService.get(ticket.guildId);
    this.assertSupport(member, config, ticket);
    if (!['open', 'claimed'].includes(ticket.status)) {
      throw new UserError('Dieses Ticket kann nicht uebernommen werden.');
    }
    if (ticket.claimedBy && ticket.claimedBy !== member.id) {
      throw new UserError(
        `Dieses Ticket wurde bereits von <@${ticket.claimedBy}> uebernommen.`,
      );
    }

    const updated = await this.ticketRepository.update(ticket.id, {
      status: 'claimed',
      claimed_by: member.id,
    });
    await this.ticketRepository.addAction(ticket.id, 'claimed', member.id);
    await this.auditService.write({
      guildId: ticket.guildId,
      source: 'ticket',
      message: `Ticket ${ticket.ticketNumber} wurde uebernommen.`,
      context: {
        ticketNumber: ticket.ticketNumber,
        supporterId: member.id,
      },
      discord: true,
    });
    return updated;
  }

  async close(ticket, actor, { system = false } = {}) {
    const config = await this.configService.get(ticket.guildId);
    if (!system) this.assertCanClose(actor, config, ticket);
    if (!['open', 'claimed'].includes(ticket.status)) {
      throw new UserError('Dieses Ticket ist nicht offen.');
    }

    const guild = await this.client.guilds.fetch(ticket.guildId);
    const channel = ticket.channelId
      ? await guild.channels.fetch(ticket.channelId).catch(() => null)
      : null;
    if (!channel?.isTextBased()) {
      throw new NotFoundError('Der Ticket-Kanal wurde nicht gefunden.');
    }

    let transcriptPath = ticket.transcriptPath;
    if (config.tickets.transcriptsEnabled) {
      transcriptPath = await this.createTranscript(ticket, guild, channel, config);
    }

    if (config.tickets.archiveCategoryId) {
      await channel.setParent(config.tickets.archiveCategoryId, {
        lockPermissions: false,
        reason: `Ticket ${ticket.ticketNumber} archiviert`,
      });
    }
    await channel.permissionOverwrites.edit(ticket.userId, {
      ViewChannel: false,
      SendMessages: false,
    });
    const ticketMember = await guild.members.fetch(ticket.userId).catch(() => null);
    await channel
      .setName(
        createTicketChannelName(
          'archived',
          ticket,
          ticketMember?.user.username || 'user',
        ),
      )
      .catch(() => undefined);

    const actorId = system ? actor : actor.id;
    const updated = await this.ticketRepository.update(ticket.id, {
      status: 'archived',
      active_key: null,
      closed_by: actorId,
      closed_at: this.ticketRepository.database.fn.now(),
      transcript_path: transcriptPath || null,
    });
    await this.ticketRepository.addAction(ticket.id, 'archived', actorId);
    await this.sendArchiveControls(channel, updated);
    await this.auditService.write({
      guildId: ticket.guildId,
      source: 'ticket',
      message: `Ticket ${ticket.ticketNumber} wurde archiviert.`,
      context: {
        ticketNumber: ticket.ticketNumber,
        actorId,
        channelId: channel.id,
      },
      discord: true,
    });
    return updated;
  }

  async reopen(ticket, actor, { system = false } = {}) {
    const config = await this.configService.get(ticket.guildId);
    if (!system) this.assertSupport(actor, config, ticket);
    if (ticket.status !== 'archived') {
      throw new UserError('Nur archivierte Tickets koennen wieder geoeffnet werden.');
    }

    const maxActive = config.tickets.maxActivePerCategory;
    const activeCount = await this.ticketRepository.countActive(
      ticket.guildId,
      ticket.userId,
      ticket.categoryKey,
    );
    if (activeCount >= maxActive) {
      throw new UserError(
        `Der Nutzer hat in dieser Kategorie bereits ${activeCount} aktive Tickets.`,
      );
    }

    const guild = await this.client.guilds.fetch(ticket.guildId);
    const channel = ticket.channelId
      ? await guild.channels.fetch(ticket.channelId).catch(() => null)
      : null;
    if (!channel?.isTextBased()) {
      throw new NotFoundError('Der archivierte Ticket-Kanal wurde nicht gefunden.');
    }

    const category = this.getCategory(config, ticket.categoryKey);
    const reserved = await this.ticketRepository.reserveActiveSlot(ticket.id, {
      guildId: ticket.guildId,
      userId: ticket.userId,
      categoryKey: ticket.categoryKey,
      maxActive,
      changes: { status: 'reopening' },
    });
    if (!reserved) {
      throw new UserError(
        `Der Nutzer hat in dieser Kategorie bereits ${maxActive} aktive Tickets.`,
      );
    }

    try {
      const parentId =
        category?.parentCategoryId || config.tickets.categoryId || null;
      if (parentId) {
        await channel.setParent(parentId, {
          lockPermissions: false,
          reason: `Ticket ${ticket.ticketNumber} wieder geoeffnet`,
        });
      }
      await channel.permissionOverwrites.edit(ticket.userId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      await channel
        .setName(
          createTicketChannelName(
            'ticket',
            ticket,
            channel.guild.members.cache.get(ticket.userId)?.user.username ||
              'user',
          ),
        )
        .catch(() => undefined);
    } catch (error) {
      await this.ticketRepository.update(ticket.id, {
        status: 'archived',
        active_key: null,
      });
      throw error;
    }

    const actorId = system ? actor : actor.id;
    const updated = await this.ticketRepository.update(ticket.id, {
      status: 'open',
      closed_by: null,
      closed_at: null,
    });
    await this.ticketRepository.addAction(ticket.id, 'reopened', actorId);
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(parseColor(config.branding.color))
          .setDescription(
            `Ticket ${ticket.ticketNumber} wurde wieder geoeffnet.`,
          )
          .setTimestamp(),
      ],
      components: [this.createOpenControls(ticket.id)],
    });
    await this.auditService.write({
      guildId: ticket.guildId,
      source: 'ticket',
      message: `Ticket ${ticket.ticketNumber} wurde wieder geoeffnet.`,
      context: { ticketNumber: ticket.ticketNumber, actorId },
      discord: true,
    });
    return updated;
  }

  async delete(ticket, actor, { system = false } = {}) {
    const config = await this.configService.get(ticket.guildId);
    if (!system) this.assertSupport(actor, config, ticket);
    if (ticket.status === 'deleted') {
      throw new UserError('Dieses Ticket wurde bereits geloescht.');
    }

    const guild = await this.client.guilds.fetch(ticket.guildId);
    const channel = ticket.channelId
      ? await guild.channels.fetch(ticket.channelId).catch(() => null)
      : null;
    if (channel) {
      await channel.delete(
        `Ticket ${ticket.ticketNumber} endgueltig geloescht`,
      );
    }

    const actorId = system ? actor : actor.id;
    const updated = await this.ticketRepository.update(ticket.id, {
      status: 'deleted',
      active_key: null,
      channel_id: null,
      deleted_by: actorId,
      deleted_at: this.ticketRepository.database.fn.now(),
    });
    await this.ticketRepository.addAction(ticket.id, 'deleted', actorId);
    await this.auditService.write({
      guildId: ticket.guildId,
      source: 'ticket',
      message: `Ticket ${ticket.ticketNumber} wurde endgueltig geloescht.`,
      context: { ticketNumber: ticket.ticketNumber, actorId },
      discord: true,
    });
    return updated;
  }

  async createTranscript(ticket, guild = null, channel = null, config = null) {
    guild ||= await this.client.guilds.fetch(ticket.guildId);
    channel ||=
      ticket.channelId &&
      (await guild.channels.fetch(ticket.channelId).catch(() => null));
    if (!channel?.isTextBased()) {
      throw new NotFoundError('Der Ticket-Kanal wurde nicht gefunden.');
    }
    config ||= await this.configService.get(ticket.guildId);
    const filePath = await this.transcriptService.create(
      channel,
      ticket,
      config.tickets.transcriptMaxMessages,
    );
    await this.ticketRepository.update(ticket.id, {
      transcript_path: filePath,
    });
    await this.ticketRepository.addAction(ticket.id, 'transcript_created', null, {
      filePath,
    });
    await this.sendTranscriptToLog(guild, config, ticket, filePath);
    return filePath;
  }

  async resolveByChannel(channelId) {
    const ticket = await this.ticketRepository.findByChannelId(channelId);
    if (!ticket) throw new NotFoundError('Dieser Kanal ist kein Ticket.');
    return ticket;
  }

  getCategory(config, key) {
    return config.tickets.categories.find((category) => category.key === key);
  }

  assertCanClose(member, config, ticket) {
    if (member.id === ticket.userId) return;
    this.assertSupport(member, config, ticket);
  }

  assertSupport(member, config, ticket) {
    const category = this.getCategory(config, ticket.categoryKey);
    const roleIds = unique([
      ...config.tickets.supportRoleIds,
      ...(category?.supportRoleIds || []),
    ]);
    if (!this.permissionService.canTicketSupport(member, roleIds)) {
      throw new PermissionError();
    }
  }

  async sendTicketControls(channel, ticket, category, supportRoleIds) {
    const mentions = supportRoleIds.map((id) => `<@&${id}>`).join(' ');
    await channel.send({
      content: [`<@${ticket.userId}>`, mentions].filter(Boolean).join(' '),
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle(`Ticket ${ticket.ticketNumber}: ${category.label}`)
          .setDescription(
            'Beschreibe dein Anliegen so genau wie moeglich. Ein Supporter wird sich darum kuemmern.',
          )
          .addFields(
            { name: 'Ersteller', value: `<@${ticket.userId}>`, inline: true },
            { name: 'Kategorie', value: category.label, inline: true },
          )
          .setTimestamp(),
      ],
      components: [this.createOpenControls(ticket.id)],
      allowedMentions: {
        users: [ticket.userId],
        roles: supportRoleIds,
      },
    });
  }

  createOpenControls(ticketId) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:claim:${ticketId}`)
        .setLabel('Claim')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`ticket:close:${ticketId}`)
        .setLabel('Archive')
        .setStyle(ButtonStyle.Danger),
    );
  }

  createClaimedControls(ticketId, supporterName) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:claimed:${ticketId}`)
        .setLabel(`Claimed by ${supporterName}`.slice(0, 80))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`ticket:close:${ticketId}`)
        .setLabel('Archive')
        .setStyle(ButtonStyle.Danger),
    );
  }

  async sendArchiveControls(channel, ticket) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle(`Ticket ${ticket.ticketNumber} archiviert`)
          .setDescription(
            'Der Kanal bleibt erhalten. Supporter koennen ihn wieder oeffnen, ein Transkript erzeugen oder endgueltig loeschen.',
          )
          .setTimestamp(),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket:reopen:${ticket.id}`)
            .setLabel('Reopen')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`ticket:transcript:${ticket.id}`)
            .setLabel('Transcript')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`ticket:delete:${ticket.id}`)
            .setLabel('Delete permanently')
            .setStyle(ButtonStyle.Danger),
        ),
      ],
    });
  }

  async sendTranscriptToLog(guild, config, ticket, filePath) {
    const channel = config.tickets.logChannelId
      ? guild.channels.cache.get(config.tickets.logChannelId)
      : null;
    if (!channel?.isTextBased()) return;

    await channel
      .send({
        content: `Transkript fuer Ticket ${ticket.ticketNumber}`,
        files: [new AttachmentBuilder(filePath)],
      })
      .catch((error) =>
        this.logger.warn(
          {
            error,
            ticketId: ticket.id,
            ticketNumber: ticket.ticketNumber,
          },
          'Could not upload ticket transcript to log channel',
        ),
      );
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function createTicketChannelName(prefix, ticket, username) {
  return `${prefix}-${ticket.ticketNumber}-${sanitizeChannelName(
    username,
    'user',
  )}`;
}
