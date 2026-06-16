import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { PermissionError, UserError } from '../../core/errors.js';
import {
  FACTION_STATUSES,
  FACTION_TYPES,
} from '../../services/FactionService.js';
import { parseColor } from '../../utils/discord.js';

const statusChoices = [
  { name: 'Aktiv', value: 'active' },
  { name: 'Inaktiv', value: 'inactive' },
  { name: 'Bewerbungsphase', value: 'recruiting' },
  { name: 'Geschlossen', value: 'closed' },
];
const typeChoices = [
  { name: 'Staatlich', value: 'state' },
  { name: 'Legal', value: 'legal' },
  { name: 'Illegal', value: 'illegal' },
  { name: 'Neutral', value: 'neutral' },
];

export async function createModule(context) {
  return {
    name: 'factions',
    async register(registry) {
      registry.registerCommand(createFactionCommand(context));
    },
  };
}

function createFactionCommand(context) {
  return {
    data: new SlashCommandBuilder()
      .setName('fraktion')
      .setDescription('Verwaltet und zeigt die Fraktionsliste.')
      .addSubcommand((command) =>
        addFactionOptions(
          command
            .setName('erstellen')
            .setDescription('Erstellt eine neue Fraktion.')
            .addStringOption((option) =>
              option
                .setName('name')
                .setDescription('Name der Fraktion')
                .setRequired(true)
                .setMaxLength(100),
            ),
        ),
      )
      .addSubcommand((command) =>
        addFactionOptions(
          command
            .setName('bearbeiten')
            .setDescription('Bearbeitet eine Fraktion.')
            .addStringOption((option) =>
              option
                .setName('fraktion')
                .setDescription('Fraktion')
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addStringOption((option) =>
              option
                .setName('name')
                .setDescription('Neuer Fraktionsname')
                .setMaxLength(100),
            ),
        ).addStringOption((option) =>
          option
            .setName('leeren')
            .setDescription('Optionales Feld entfernen')
            .addChoices(
              { name: 'Leitung', value: 'leaderId' },
              { name: 'Stellvertretung', value: 'deputyId' },
              { name: 'Discord-Rolle', value: 'discordRoleId' },
              { name: 'Channel', value: 'channelId' },
              { name: 'Beschreibung', value: 'description' },
              { name: 'Notizen', value: 'notes' },
            ),
        ),
      )
      .addSubcommand((command) =>
        command
          .setName('loeschen')
          .setDescription('Loescht eine Fraktion.')
          .addStringOption((option) =>
            option
              .setName('fraktion')
              .setDescription('Fraktion')
              .setRequired(true)
              .setAutocomplete(true),
          ),
      )
      .addSubcommand((command) =>
        command
          .setName('liste')
          .setDescription('Zeigt alle Fraktionen.'),
      )
      .addSubcommand((command) =>
        command
          .setName('anzeigen')
          .setDescription('Zeigt eine Fraktion im Detail.')
          .addStringOption((option) =>
            option
              .setName('fraktion')
              .setDescription('Fraktion')
              .setRequired(true)
              .setAutocomplete(true),
          ),
      )
      .addSubcommand((command) =>
        command
          .setName('mitglied-hinzufuegen')
          .setDescription('Fuegt einer Fraktion ein Mitglied hinzu.')
          .addStringOption((option) =>
            option
              .setName('fraktion')
              .setDescription('Fraktion')
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addUserOption((option) =>
            option
              .setName('mitglied')
              .setDescription('Discord-Mitglied')
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName('position')
              .setDescription('Position oder Rang')
              .setMaxLength(100),
          )
          .addStringOption((option) =>
            option
              .setName('notizen')
              .setDescription('Interne Notizen')
              .setMaxLength(1000),
          ),
      )
      .addSubcommand((command) =>
        command
          .setName('mitglied-entfernen')
          .setDescription('Entfernt ein Mitglied aus einer Fraktion.')
          .addStringOption((option) =>
            option
              .setName('fraktion')
              .setDescription('Fraktion')
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addUserOption((option) =>
            option
              .setName('mitglied')
              .setDescription('Discord-Mitglied')
              .setRequired(true),
          ),
      ),
    async execute(interaction) {
      const config = await context.configService.get(interaction.guildId);
      if (!config.factions.enabled) {
        throw new UserError('Das Fraktionsmodul ist deaktiviert.');
      }
      const action = interaction.options.getSubcommand();
      if (action === 'liste') {
        const factions = await context.factionService.list(interaction.guildId);
        await interaction.reply({
          embeds: createFactionListEmbeds(factions, config),
        });
        return;
      }
      if (action === 'anzeigen') {
        const faction = await context.factionService.get(
          interaction.guildId,
          interaction.options.getString('fraktion', true),
        );
        await interaction.reply({ embeds: [createFactionEmbed(faction, config)] });
        return;
      }

      assertManageGuild(interaction.member);
      const actorId = interaction.user.id;
      if (action === 'erstellen') {
        const faction = await context.factionService.create(
          interaction.guildId,
          collectFactionInput(interaction, true),
          actorId,
        );
        await interaction.reply({
          content: `Fraktion **${faction.name}** wurde erstellt.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const identifier = interaction.options.getString('fraktion', true);
      if (action === 'bearbeiten') {
        const changes = collectFactionInput(interaction, false);
        const clearField = interaction.options.getString('leeren');
        if (clearField) changes[clearField] = '';
        if (Object.keys(changes).length === 0) {
          throw new UserError('Gib mindestens eine Aenderung an.');
        }
        const faction = await context.factionService.update(
          interaction.guildId,
          identifier,
          changes,
          actorId,
        );
        await interaction.reply({
          content: `Fraktion **${faction.name}** wurde aktualisiert.`,
          flags: MessageFlags.Ephemeral,
        });
      } else if (action === 'loeschen') {
        const faction = await context.factionService.remove(
          interaction.guildId,
          identifier,
          actorId,
        );
        await interaction.reply({
          content: `Fraktion **${faction.name}** wurde geloescht.`,
          flags: MessageFlags.Ephemeral,
        });
      } else if (action === 'mitglied-hinzufuegen') {
        const user = interaction.options.getUser('mitglied', true);
        const member = interaction.options.getMember('mitglied');
        const faction = await context.factionService.addMember(
          interaction.guildId,
          identifier,
          {
            userId: user.id,
            displayName: member?.displayName || user.username,
            position: interaction.options.getString('position') || '',
            notes: interaction.options.getString('notizen') || '',
          },
          actorId,
        );
        await interaction.reply({
          content: `<@${user.id}> wurde zu **${faction.name}** hinzugefuegt.`,
          flags: MessageFlags.Ephemeral,
        });
      } else if (action === 'mitglied-entfernen') {
        const member = interaction.options.getUser('mitglied', true);
        const faction = await context.factionService.removeMember(
          interaction.guildId,
          identifier,
          member.id,
          actorId,
        );
        await interaction.reply({
          content: `<@${member.id}> wurde aus **${faction.name}** entfernt.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    },
    async autocomplete(interaction) {
      const factions = await context.factionService.list(interaction.guildId);
      const focused = interaction.options.getFocused().toLowerCase();
      await interaction.respond(
        factions
          .filter((faction) => faction.name.toLowerCase().includes(focused))
          .slice(0, 25)
          .map((faction) => ({
            name: faction.name,
            value: faction.publicId,
          })),
      );
    },
  };
}

function addFactionOptions(command) {
  return command
    .addStringOption((option) =>
      option
        .setName('status')
        .setDescription('Status der Fraktion')
        .addChoices(...statusChoices),
    )
    .addStringOption((option) =>
      option
        .setName('typ')
        .setDescription('Typ der Fraktion')
        .addChoices(...typeChoices),
    )
    .addUserOption((option) =>
      option.setName('leitung').setDescription('Fraktionsleitung'),
    )
    .addUserOption((option) =>
      option.setName('stellvertretung').setDescription('Stellvertretende Leitung'),
    )
    .addRoleOption((option) =>
      option.setName('discord-rolle').setDescription('Discord-Rolle'),
    )
    .addChannelOption((option) =>
      option.setName('channel').setDescription('Fraktionschannel'),
    )
    .addStringOption((option) =>
      option
        .setName('beschreibung')
        .setDescription('Oeffentliche Beschreibung')
        .setMaxLength(2000),
    )
    .addStringOption((option) =>
      option
        .setName('notizen')
        .setDescription('Interne Notizen')
        .setMaxLength(2000),
    );
}

function collectFactionInput(interaction, includeName) {
  const input = {};
  const values = {
    name: includeName
      ? interaction.options.getString('name', true)
      : interaction.options.getString('name'),
    status: interaction.options.getString('status'),
    type: interaction.options.getString('typ'),
    leaderId: interaction.options.getUser('leitung')?.id,
    deputyId: interaction.options.getUser('stellvertretung')?.id,
    discordRoleId: interaction.options.getRole('discord-rolle')?.id,
    channelId: interaction.options.getChannel('channel')?.id,
    description: interaction.options.getString('beschreibung'),
    notes: interaction.options.getString('notizen'),
  };
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined) input[key] = value;
  }
  return input;
}

function createFactionListEmbeds(factions, config) {
  if (factions.length === 0) {
    return [
      new EmbedBuilder()
        .setColor(parseColor(config.factions.color))
        .setTitle('Fraktionsliste')
        .setDescription('Es sind keine Fraktionen eingetragen.'),
    ];
  }
  const chunks = [];
  for (let index = 0; index < factions.length; index += 10) {
    chunks.push(factions.slice(index, index + 10));
  }
  return chunks.slice(0, 10).map((chunk, index) =>
    new EmbedBuilder()
      .setColor(parseColor(config.factions.color))
      .setTitle(index === 0 ? 'Fraktionsliste' : `Fraktionsliste ${index + 1}`)
      .setDescription(
        chunk
          .map(
            (faction) =>
              `**${faction.name}** | ${labelType(faction.type)} | ${labelStatus(
                faction.status,
              )}\nLeitung: ${
                faction.leaderId ? `<@${faction.leaderId}>` : 'nicht gesetzt'
              } | Mitglieder: ${faction.members.length}`,
          )
          .join('\n\n'),
      ),
  );
}

function createFactionEmbed(faction, config) {
  const members =
    faction.members.length > 0
      ? faction.members
          .map(
            (member) =>
              `<@${member.userId}>${
                member.position ? ` - ${member.position}` : ''
              }`,
          )
          .join('\n')
          .slice(0, 1024)
      : 'Keine Mitglieder eingetragen';
  return new EmbedBuilder()
    .setColor(parseColor(config.factions.color))
    .setTitle(faction.name)
    .setDescription(faction.description || 'Keine Beschreibung')
    .addFields(
      { name: 'Status', value: labelStatus(faction.status), inline: true },
      { name: 'Typ', value: labelType(faction.type), inline: true },
      {
        name: 'Leitung',
        value: faction.leaderId ? `<@${faction.leaderId}>` : 'Nicht gesetzt',
        inline: true,
      },
      {
        name: 'Stellvertretung',
        value: faction.deputyId ? `<@${faction.deputyId}>` : 'Nicht gesetzt',
        inline: true,
      },
      {
        name: 'Discord',
        value: [
          faction.discordRoleId ? `<@&${faction.discordRoleId}>` : null,
          faction.channelId ? `<#${faction.channelId}>` : null,
        ]
          .filter(Boolean)
          .join(' | ') || 'Nicht gesetzt',
        inline: true,
      },
      { name: 'Mitglieder', value: members },
    )
    .setFooter({ text: `ID: ${faction.publicId}` })
    .setTimestamp(new Date(faction.updatedAt || faction.createdAt));
}

function labelStatus(status) {
  return (
    statusChoices.find((entry) => entry.value === status)?.name ||
    FACTION_STATUSES.at(0)
  );
}

function labelType(type) {
  return (
    typeChoices.find((entry) => entry.value === type)?.name ||
    FACTION_TYPES.at(-1)
  );
}

function assertManageGuild(member) {
  if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    throw new PermissionError();
  }
}
