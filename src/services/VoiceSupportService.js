import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { NotFoundError, PermissionError, UserError } from '../core/errors.js';
import {
  parseColor,
  renderTemplate,
  sanitizeVoiceChannelName,
} from '../utils/discord.js';

export class VoiceSupportService {
  constructor({
    client,
    configService,
    voiceCaseRepository,
    permissionService,
    auditService,
    logger,
  }) {
    this.client = client;
    this.configService = configService;
    this.voiceCaseRepository = voiceCaseRepository;
    this.permissionService = permissionService;
    this.auditService = auditService;
    this.logger = logger;
  }

  async handleVoiceState(oldState, newState) {
    if (oldState.channelId === newState.channelId) return;

    if (oldState.channelId && !oldState.member.user.bot) {
      const voiceCase = await this.voiceCaseRepository.findBySupportChannel(
        oldState.channelId,
      );
      if (
        voiceCase?.activeKey &&
        voiceCase.userId === oldState.member.id &&
        ['waiting', 'claimed', 'active'].includes(voiceCase.status)
      ) {
        await this.close(voiceCase, 'user_left_support_room', {
          system: true,
        });
        return;
      }
    }

    if (!newState.channelId) return;
    const config = await this.configService.get(newState.guild.id);
    if (
      !config.voiceSupport.enabled ||
      newState.channelId !== config.voiceSupport.waitingChannelId ||
      newState.member.user.bot
    ) {
      return;
    }

    await this.ensureCase(newState.member, config);
  }

  async reconcileGuild(guild, config = null) {
    config ||= await this.configService.get(guild.id);
    if (
      !config.voiceSupport.enabled ||
      !config.voiceSupport.waitingChannelId
    ) {
      return [];
    }

    const waitingChannel = await guild.channels
      .fetch(config.voiceSupport.waitingChannelId)
      .catch(() => null);
    if (!waitingChannel?.isVoiceBased()) {
      throw new NotFoundError(
        'Der konfigurierte Voice-Warteraum wurde nicht gefunden.',
      );
    }

    const cases = [];
    for (const member of waitingChannel.members.values()) {
      if (!member.user.bot) {
        cases.push(await this.ensureCase(member, config));
      }
    }
    return cases;
  }

  async ensureCase(member, config = null) {
    config ||= await this.configService.get(member.guild.id);
    const existing = await this.voiceCaseRepository.findActive(
      member.guild.id,
      member.id,
    );
    if (existing) {
      if (existing.status === 'creating') return existing;
      const existingChannel = existing.supportChannelId
        ? await member.guild.channels
            .fetch(existing.supportChannelId)
            .catch(() => null)
        : null;
      if (existingChannel?.isVoiceBased()) return existing;

      await this.voiceCaseRepository.update(existing.id, {
        status: 'failed',
        active_key: null,
        support_channel_id: null,
        closed_by: 'system:missing_support_channel',
        closed_at: this.voiceCaseRepository.database.fn.now(),
      });
      await this.auditService.write({
        guildId: member.guild.id,
        level: 'warn',
        source: 'voice-support',
        message: `Veralteter Voice-Supportfall #${existing.id} ohne Kanal wurde ersetzt.`,
        context: { userId: member.id },
      });
    }

    if (
      !config.voiceSupport.waitingChannelId ||
      !config.voiceSupport.notificationChannelId
    ) {
      throw new UserError(
        'Voice-Support ist aktiviert, aber Warte- oder Benachrichtigungskanal fehlt.',
      );
    }

    let supportChannel;
    let voiceCase;
    try {
      voiceCase = await this.voiceCaseRepository.create({
        guildId: member.guild.id,
        userId: member.id,
        waitingChannelId: config.voiceSupport.waitingChannelId,
      });
    } catch (error) {
      const raced = await this.voiceCaseRepository.findActive(
        member.guild.id,
        member.id,
      );
      if (raced) return raced;
      throw error;
    }

    try {
      const roleIds = unique(config.voiceSupport.supportRoleIds);
      const roomName = sanitizeVoiceChannelName(
        renderTemplate(config.voiceSupport.roomName, {
          username: member.user.username,
          displayName: member.displayName,
          userId: member.id,
        }),
        `\u30fbSupport | ${voiceCase.id}`,
      );
      supportChannel = await member.guild.channels.create({
        name: roomName,
        type: ChannelType.GuildVoice,
        parent: config.voiceSupport.categoryId || undefined,
        permissionOverwrites: [
          {
            id: member.guild.roles.everyone.id,
            deny: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
            ],
          },
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
            ],
          },
          {
            id: this.client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.CreateInstantInvite,
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.ManageChannels,
            ],
          },
          ...roleIds.map((roleId) => ({
            id: roleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
              PermissionFlagsBits.MoveMembers,
            ],
          })),
        ],
        reason: `Voice-Supportfall #${voiceCase.id} fuer ${member.user.tag}`,
      });

      const notificationChannel = member.guild.channels.cache.get(
        config.voiceSupport.notificationChannelId,
      );
      if (!notificationChannel?.isTextBased()) {
        throw new NotFoundError(
          'Der konfigurierte Voice-Benachrichtigungskanal wurde nicht gefunden.',
        );
      }

      voiceCase = await this.voiceCaseRepository.update(voiceCase.id, {
        support_channel_id: supportChannel.id,
        notification_channel_id: notificationChannel.id,
        status: 'waiting',
      });
      const mentions = roleIds.map((id) => `<@&${id}>`).join(' ');
      await notificationChannel.send({
        content: [
          mentions,
          `**New voice support request:** <@${member.id}> is waiting.`,
        ]
          .filter(Boolean)
          .join('\n'),
        embeds: [
          new EmbedBuilder()
            .setColor(parseColor(config.branding.color))
            .setTitle(`Voice-Supportfall #${voiceCase.id}`)
            .setDescription(
              `<@${member.id}> wartet in <#${voiceCase.waitingChannelId}>.\nDer Nutzer wird erst nach einer manuellen Uebernahme verschoben.`,
            )
            .addFields({
              name: 'Privater Support-Raum',
              value: `<#${supportChannel.id}>`,
            })
            .setTimestamp(),
        ],
        components: [this.createControls(voiceCase.id)],
        allowedMentions: {
          roles: roleIds,
          users: [member.id],
        },
      });
      await this.auditService.write({
        guildId: member.guild.id,
        source: 'voice-support',
        message: `Voice-Supportfall #${voiceCase.id} wurde erstellt.`,
        context: {
          userId: member.id,
          supportChannelId: supportChannel.id,
        },
      });
      return voiceCase;
    } catch (error) {
      if (supportChannel) await supportChannel.delete().catch(() => undefined);
      await this.voiceCaseRepository.update(voiceCase.id, {
        status: 'failed',
        active_key: null,
      });
      throw error;
    }
  }

  async claimAndMove(voiceCase, member) {
    const config = await this.configService.get(voiceCase.guildId);
    this.assertSupport(member, config);
    if (!['waiting', 'claimed', 'active'].includes(voiceCase.status)) {
      throw new UserError('Dieser Voice-Supportfall ist nicht mehr aktiv.');
    }
    if (voiceCase.claimedBy && voiceCase.claimedBy !== member.id) {
      throw new UserError(
        `Dieser Fall wurde bereits von <@${voiceCase.claimedBy}> uebernommen.`,
      );
    }

    const guild = await this.client.guilds.fetch(voiceCase.guildId);
    const targetMember = await guild.members.fetch(voiceCase.userId);
    if (!targetMember.voice.channelId) {
      throw new UserError('Der wartende Nutzer ist aktuell in keinem Voice-Kanal.');
    }
    const supportChannel = voiceCase.supportChannelId
      ? await guild.channels.fetch(voiceCase.supportChannelId).catch(() => null)
      : null;
    if (!supportChannel?.isVoiceBased()) {
      throw new NotFoundError('Der private Support-Raum wurde nicht gefunden.');
    }

    if (voiceCase.inviteCode) {
      await this.deleteInvite(guild, voiceCase.inviteCode);
    }

    const invite = await supportChannel.createInvite({
      maxAge: 60 * 60,
      maxUses: 1,
      temporary: false,
      unique: true,
      reason: `Voice-Supportfall #${voiceCase.id} von ${member.user.tag} uebernommen`,
    });

    try {
      await targetMember.voice.setChannel(
        supportChannel,
        `Voice-Supportfall #${voiceCase.id} von ${member.user.tag} uebernommen`,
      );
    } catch (error) {
      await invite.delete('Voice-Support: Nutzer konnte nicht verschoben werden')
        .catch(() => undefined);
      throw error;
    }

    const updated = await this.voiceCaseRepository.update(voiceCase.id, {
      status: 'active',
      claimed_by: member.id,
      claimed_at:
        voiceCase.claimedAt || this.voiceCaseRepository.database.fn.now(),
      moved_at: this.voiceCaseRepository.database.fn.now(),
      invite_code: invite.code,
    });
    await this.auditService.write({
      guildId: voiceCase.guildId,
      source: 'voice-support',
      message: `Voice-Supportfall #${voiceCase.id} wurde uebernommen und der Nutzer verschoben.`,
      context: {
        supporterId: member.id,
        userId: voiceCase.userId,
        supportChannelId: supportChannel.id,
      },
    });
    return {
      voiceCase: updated,
      inviteUrl: invite.url,
      supportChannelId: supportChannel.id,
    };
  }

  async moveUser(voiceCase, member, { system = false } = {}) {
    const config = await this.configService.get(voiceCase.guildId);
    if (!system) this.assertSupport(member, config);
    if (!voiceCase.activeKey || voiceCase.status === 'closed') {
      throw new UserError('Dieser Voice-Supportfall ist nicht mehr aktiv.');
    }

    const guild = await this.client.guilds.fetch(voiceCase.guildId);
    const targetMember = await guild.members.fetch(voiceCase.userId);
    if (!targetMember.voice.channelId) {
      throw new UserError('Der wartende Nutzer ist aktuell in keinem Voice-Kanal.');
    }
    const supportChannel = voiceCase.supportChannelId
      ? await guild.channels.fetch(voiceCase.supportChannelId).catch(() => null)
      : null;
    if (!supportChannel?.isVoiceBased()) {
      throw new NotFoundError('Der private Support-Raum wurde nicht gefunden.');
    }

    await targetMember.voice.setChannel(
      supportChannel,
      `Voice-Supportfall #${voiceCase.id} uebernommen`,
    );
    const actorId = system ? member : member.id;
    const updated = await this.voiceCaseRepository.update(voiceCase.id, {
      status: 'active',
      claimed_by: voiceCase.claimedBy || actorId,
      claimed_at:
        voiceCase.claimedAt || this.voiceCaseRepository.database.fn.now(),
      moved_at: this.voiceCaseRepository.database.fn.now(),
    });
    await this.auditService.write({
      guildId: voiceCase.guildId,
      source: 'voice-support',
      message: `Nutzer fuer Voice-Supportfall #${voiceCase.id} wurde verschoben.`,
      context: { supporterId: actorId, userId: voiceCase.userId },
    });
    return updated;
  }

  async close(voiceCase, member, { system = false } = {}) {
    const config = await this.configService.get(voiceCase.guildId);
    if (!system) this.assertSupport(member, config);
    if (voiceCase.status === 'closed') {
      throw new UserError('Dieser Voice-Supportfall ist bereits geschlossen.');
    }

    const guild = await this.client.guilds.fetch(voiceCase.guildId);
    const supportChannel = voiceCase.supportChannelId
      ? await guild.channels.fetch(voiceCase.supportChannelId).catch(() => null)
      : null;
    if (voiceCase.inviteCode) {
      await this.deleteInvite(guild, voiceCase.inviteCode);
    }
    if (supportChannel && config.voiceSupport.deleteRoomOnClose) {
      await supportChannel.delete(`Voice-Supportfall #${voiceCase.id} geschlossen`);
    }

    const actorId = system ? member : member.id;
    const updated = await this.voiceCaseRepository.update(voiceCase.id, {
      status: 'closed',
      active_key: null,
      support_channel_id: config.voiceSupport.deleteRoomOnClose
        ? null
        : voiceCase.supportChannelId,
      invite_code: null,
      closed_by: actorId,
      closed_at: this.voiceCaseRepository.database.fn.now(),
    });
    await this.auditService.write({
      guildId: voiceCase.guildId,
      source: 'voice-support',
      message: `Voice-Supportfall #${voiceCase.id} wurde geschlossen.`,
      context: { actorId, userId: voiceCase.userId },
    });
    return updated;
  }

  async deleteInvite(guild, inviteCode) {
    const invite = await guild.invites.fetch(inviteCode).catch(() => null);
    if (invite) {
      await invite.delete('Voice-Supportfall geschlossen').catch(() => undefined);
    }
  }

  assertSupport(member, config) {
    if (
      !this.permissionService.canVoiceSupport(
        member,
        config.voiceSupport.supportRoleIds,
      )
    ) {
      throw new PermissionError();
    }
  }

  createControls(caseId) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`voice:claim:${caseId}`)
        .setLabel('Claim')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`voice:move:${caseId}`)
        .setLabel('Move user')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`voice:close:${caseId}`)
        .setLabel('Close')
        .setStyle(ButtonStyle.Danger),
    );
  }

  createClaimedControls(caseId, supporterName) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`voice:claimed:${caseId}`)
        .setLabel(`Claimed by ${supporterName}`.slice(0, 80))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`voice:moved:${caseId}`)
        .setLabel('User moved')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`voice:close:${caseId}`)
        .setLabel('Close')
        .setStyle(ButtonStyle.Danger),
    );
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
