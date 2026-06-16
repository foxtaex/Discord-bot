import {
  AttachmentBuilder,
  ChannelType,
  EmbedBuilder,
  Events,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { TicketService } from '../../services/TicketService.js';
import { TranscriptService } from '../../services/TranscriptService.js';
import { UserError } from '../../core/errors.js';

export async function createModule(context) {
  const transcriptService = new TranscriptService(context);
  const service = new TicketService({ ...context, transcriptService });
  context.services.tickets = service;

  return {
    name: 'tickets',
    async register(registry) {
      registry.registerCommand(panelCommand(service));
      registry.registerCommand(ticketCommand(service));
      registry.registerEvent(
        Events.ClientReady,
        async (client) => {
          for (const guild of client.guilds.cache.values()) {
            const result = await service.refreshPanels(guild.id);
            if (result.total > 0) {
              context.logger.info(
                { guildId: guild.id, ...result },
                'Registered ticket panels refreshed',
              );
            }
          }
        },
        { once: true },
      );
      registry.registerSelect('ticket:create', (interaction) =>
        handleCreate(interaction, service),
      );
      registry.registerButton('ticket-open', (interaction) =>
        handleTicketOpen(interaction, service),
      );
      registry.registerButton('ticket:', (interaction) =>
        handleButton(interaction, service),
      );
    },
  };
}

function panelCommand(service) {
  return {
    data: new SlashCommandBuilder()
      .setName('ticket-panel')
      .setDescription('Sendet das Open-Ticket-Panel.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addChannelOption((option) =>
        option
          .setName('kanal')
          .setDescription('Zielkanal; Standard ist der aktuelle Kanal.')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false),
      ),
    async execute(interaction) {
      const channel = interaction.options.getChannel('kanal') || interaction.channel;
      await service.sendPanel(channel, interaction.user.id);
      await interaction.reply({
        content: `Ticket-Panel wurde in <#${channel.id}> gesendet.`,
        flags: MessageFlags.Ephemeral,
      });
    },
  };
}

function ticketCommand(service) {
  return {
    data: new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Verwaltet den aktuellen Ticket-Kanal.')
      .addSubcommand((command) =>
        command.setName('close').setDescription('Archiviert dieses Ticket.'),
      )
      .addSubcommand((command) =>
        command.setName('reopen').setDescription('Oeffnet dieses Ticket wieder.'),
      )
      .addSubcommand((command) =>
        command
          .setName('transcript')
          .setDescription('Erstellt ein HTML-Transkript.'),
      )
      .addSubcommand((command) =>
        command
          .setName('delete')
          .setDescription('Loescht dieses Ticket endgueltig.'),
      ),
    async execute(interaction) {
      const ticket = await service.resolveByChannel(interaction.channelId);
      const action = interaction.options.getSubcommand();

      if (action === 'delete') {
        await interaction.reply({
          content: 'Das Ticket wird endgueltig geloescht.',
          flags: MessageFlags.Ephemeral,
        });
        await service.delete(ticket, interaction.member);
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (action === 'close') {
        await service.close(ticket, interaction.member);
        await interaction.editReply('Das Ticket wurde archiviert.');
      } else if (action === 'reopen') {
        await service.reopen(ticket, interaction.member);
        await interaction.editReply('Das Ticket wurde wieder geoeffnet.');
      } else if (action === 'transcript') {
        const config = await contextConfig(service, ticket.guildId);
        service.assertSupport(interaction.member, config, ticket);
        const filePath = await service.createTranscript(ticket);
        await interaction.editReply({
          content: `Transkript fuer Ticket ${ticket.ticketNumber}:`,
          files: [new AttachmentBuilder(filePath)],
        });
      }
    },
  };
}

async function handleCreate(interaction, service) {
  await interaction.deferUpdate();
  try {
    const ticket = await service.createTicket(
      interaction.guild,
      interaction.user,
      interaction.values[0],
    );
    await interaction.editReply({
      content: `Your ticket has been created: <#${ticket.channelId}>.`,
      embeds: [],
      components: [],
    });
  } catch (error) {
    if (!(error instanceof UserError)) throw error;
    await interaction.editReply({
      content: error.message,
      embeds: [],
      components: [],
    });
  }
}

async function handleTicketOpen(interaction, service) {
  await service.registerPanelMessage(interaction.message);
  const payload = await service.createCategorySelectionPayload(
    interaction.guildId,
  );
  await interaction.reply({
    ...payload,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleButton(interaction, service) {
  const [, action, rawId] = interaction.customId.split(':');
  const ticket = await service.ticketRepository.findById(Number(rawId));
  if (!ticket) return;

  if (action === 'delete') {
    await interaction.reply({
      content: 'Das Ticket wird endgueltig geloescht.',
      flags: MessageFlags.Ephemeral,
    });
    await service.delete(ticket, interaction.member);
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (action === 'claim') {
    const claimed = await service.claim(ticket, interaction.member);
    const embed = interaction.message.embeds[0]
      ? EmbedBuilder.from(interaction.message.embeds[0]).addFields({
          name: 'Claimed by',
          value: `<@${interaction.member.id}>`,
          inline: true,
        })
      : null;
    await interaction.message.edit({
      embeds: embed ? [embed] : interaction.message.embeds,
      components: [
        service.createClaimedControls(
          claimed.id,
          interaction.member.displayName,
        ),
      ],
    });
    await interaction.editReply(
      `Ticket ${ticket.ticketNumber} wurde dir zugewiesen.`,
    );
  } else if (action === 'close') {
    await service.close(ticket, interaction.member);
    await interaction.editReply(
      `Ticket ${ticket.ticketNumber} wurde archiviert.`,
    );
  } else if (action === 'reopen') {
    await service.reopen(ticket, interaction.member);
    await interaction.editReply(
      `Ticket ${ticket.ticketNumber} wurde wieder geoeffnet.`,
    );
  } else if (action === 'transcript') {
    const config = await contextConfig(service, ticket.guildId);
    service.assertSupport(interaction.member, config, ticket);
    const filePath = await service.createTranscript(ticket);
    await interaction.editReply({
      content: `Transkript fuer Ticket ${ticket.ticketNumber}:`,
      files: [new AttachmentBuilder(filePath)],
    });
  }
}

function contextConfig(service, guildId) {
  return service.configService.get(guildId);
}
