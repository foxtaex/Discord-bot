import {
  EmbedBuilder,
  Events,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { VoiceSupportService } from '../../services/VoiceSupportService.js';
import { NotFoundError } from '../../core/errors.js';

export async function createModule(context) {
  const service = new VoiceSupportService(context);
  context.services.voiceSupport = service;

  return {
    name: 'voice-support',
    async register(registry) {
      registry.registerEvent(Events.VoiceStateUpdate, (oldState, newState) =>
        service.handleVoiceState(oldState, newState),
      );
      registry.registerEvent(
        Events.ClientReady,
        async (client) => {
          for (const guild of client.guilds.cache.values()) {
            const cases = await service.reconcileGuild(guild);
            if (cases.length > 0) {
              context.logger.info(
                { guildId: guild.id, caseCount: cases.length },
                'Recovered waiting voice support members',
              );
            }
          }
        },
        { once: true },
      );
      registry.registerCommand(voiceCommand(service));
      registry.registerButton('voice:', (interaction) =>
        handleButton(interaction, service),
      );
    },
  };
}

function voiceCommand(service) {
  return {
    data: new SlashCommandBuilder()
      .setName('voice-support')
      .setDescription('Verwaltet Voice-Supportfaelle.')
      .addSubcommand((command) =>
        command
          .setName('status')
          .setDescription('Zeigt den aktiven Supportfall eines Nutzers.')
          .addUserOption((option) =>
            option
              .setName('nutzer')
              .setDescription('Standard: du selbst')
              .setRequired(false),
          ),
      )
      .addSubcommand((command) =>
        command
          .setName('move')
          .setDescription('Verschiebt einen wartenden Nutzer.')
          .addUserOption((option) =>
            option.setName('nutzer').setDescription('Wartender Nutzer').setRequired(true),
          ),
      )
      .addSubcommand((command) =>
        command
          .setName('close')
          .setDescription('Schliesst einen Voice-Supportfall.')
          .addUserOption((option) =>
            option.setName('nutzer').setDescription('Betroffener Nutzer').setRequired(true),
          ),
      ),
    async execute(interaction) {
      const action = interaction.options.getSubcommand();
      const user = interaction.options.getUser('nutzer') || interaction.user;
      const voiceCase = await service.voiceCaseRepository.findActive(
        interaction.guildId,
        user.id,
      );
      if (!voiceCase) {
        throw new NotFoundError('Fuer diesen Nutzer gibt es keinen aktiven Fall.');
      }

      if (action === 'status') {
        if (user.id !== interaction.user.id) {
          const config = await service.configService.get(interaction.guildId);
          service.assertSupport(interaction.member, config);
        }
        await interaction.reply({
          content: `Fall #${voiceCase.id}: **${voiceCase.status}**, Raum: ${
            voiceCase.supportChannelId
              ? `<#${voiceCase.supportChannelId}>`
              : 'nicht vorhanden'
          }`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (action === 'move') {
        await service.moveUser(voiceCase, interaction.member);
        await interaction.editReply(`<@${user.id}> wurde in den Support-Raum verschoben.`);
      } else {
        await service.close(voiceCase, interaction.member);
        await interaction.editReply(`Voice-Supportfall #${voiceCase.id} wurde geschlossen.`);
      }
    },
  };
}

async function handleButton(interaction, service) {
  const [, action, rawId] = interaction.customId.split(':');
  const voiceCase = await service.voiceCaseRepository.findById(Number(rawId));
  if (!voiceCase) throw new NotFoundError('Der Voice-Supportfall existiert nicht.');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (action === 'claim') {
    const claimed = await service.claimAndMove(voiceCase, interaction.member);
    const embed = interaction.message.embeds[0]
      ? EmbedBuilder.from(interaction.message.embeds[0]).addFields({
          name: 'Claimed by',
          value: `<@${interaction.member.id}>`,
          inline: true,
        })
      : null;
    await interaction.message
      .edit({
        embeds: embed ? [embed] : interaction.message.embeds,
        components: [
          service.createClaimedControls(
            voiceCase.id,
            interaction.member.displayName,
          ),
        ],
      })
      .catch((error) =>
        service.logger.warn(
          { error, voiceCaseId: voiceCase.id },
          'Could not update claimed voice support notification',
        ),
      );
    await interaction.editReply(
      [
        `Voice-Supportfall #${voiceCase.id} wurde dir zugewiesen.`,
        `<@${voiceCase.userId}> wurde in <#${claimed.supportChannelId}> verschoben.`,
        `Dein temporaerer Join-Link: ${claimed.inviteUrl}`,
        'Der Link ist einmal nutzbar, laeuft nach einer Stunde ab und wird beim Schliessen des Falls geloescht.',
      ].join('\n'),
    );
  } else if (action === 'move') {
    await service.moveUser(voiceCase, interaction.member);
    await interaction.editReply('Der Nutzer wurde in den privaten Support-Raum verschoben.');
  } else if (action === 'close') {
    await service.close(voiceCase, interaction.member);
    await interaction.editReply(`Voice-Supportfall #${voiceCase.id} wurde geschlossen.`);
  }
}
