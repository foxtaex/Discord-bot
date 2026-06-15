import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { UserError } from '../../core/errors.js';
import { TicketCategoryService } from '../../services/TicketCategoryService.js';

const editableKeys = [
  ['welcome.enabled', 'Willkommen aktiv'],
  ['welcome.channelId', 'Willkommenskanal'],
  ['welcome.message', 'Willkommenstext'],
  ['tickets.enabled', 'Tickets aktiv'],
  ['tickets.categoryId', 'Ticket-Kategorie'],
  ['tickets.archiveCategoryId', 'Archiv-Kategorie'],
  ['tickets.logChannelId', 'Ticket-Logkanal'],
  ['tickets.transcriptsEnabled', 'Transkripte aktiv'],
  ['voiceSupport.enabled', 'Voice-Support aktiv'],
  ['voiceSupport.waitingChannelId', 'Voice-Warteraum'],
  ['voiceSupport.categoryId', 'Voice-Kategorie'],
  ['voiceSupport.notificationChannelId', 'Voice-Benachrichtigungskanal'],
];

export async function createModule(context) {
  const ticketCategoryService = new TicketCategoryService(
    context.configService,
  );
  context.services.ticketCategories = ticketCategoryService;

  return {
    name: 'configuration',
    async register(registry) {
      registry.registerCommand({
        data: new SlashCommandBuilder()
          .setName('bot-config')
          .setDescription('Zeigt oder aendert die Server-Konfiguration.')
          .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
          .addSubcommand((command) =>
            command
              .setName('show')
              .setDescription('Zeigt eine Zusammenfassung der Konfiguration.'),
          )
          .addSubcommand((command) =>
            command
              .setName('set')
              .setDescription('Aendert einen Konfigurationswert.')
              .addStringOption((option) =>
                option
                  .setName('schluessel')
                  .setDescription('Konfigurationsschluessel')
                  .setRequired(true)
                  .addChoices(
                    ...editableKeys.map(([value, name]) => ({ name, value })),
                  ),
              )
              .addStringOption((option) =>
                option
                  .setName('wert')
                  .setDescription('ID, Text, true oder false')
                  .setRequired(true),
              ),
          ),
        async execute(interaction) {
          const action = interaction.options.getSubcommand();
          if (action === 'show') {
            const config = await context.configService.get(interaction.guildId);
            await interaction.reply({
              content: summarize(config),
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const key = interaction.options.getString('schluessel', true);
          const rawValue = interaction.options.getString('wert', true);
          const current = await context.configService.get(interaction.guildId);
          const oldValue = getPath(current, key);
          const value = parseValue(rawValue, oldValue);
          await context.configService.update(
            interaction.guildId,
            createPatch(key, value),
          );
          await interaction.reply({
            content: `\`${key}\` wurde auf \`${String(value)}\` gesetzt.`,
            flags: MessageFlags.Ephemeral,
          });
          },
      });
      registry.registerCommand(
        createTicketCategoryCommand(ticketCategoryService),
      );
    },
  };
}

function createTicketCategoryCommand(service) {
  return {
    data: new SlashCommandBuilder()
      .setName('ticket-category')
      .setDescription('Verwaltet Kategorien im Ticket-Dropdown.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((command) =>
        command
          .setName('add')
          .setDescription('Erstellt eine neue Ticket-Kategorie.')
          .addStringOption((option) =>
            option
              .setName('key')
              .setDescription('Kurzer interner Name, z. B. billing')
              .setRequired(true)
              .setMinLength(2)
              .setMaxLength(64),
          )
          .addStringOption((option) =>
            option
              .setName('name')
              .setDescription('Sichtbarer Name im Dropdown')
              .setRequired(true)
              .setMaxLength(100),
          )
          .addStringOption((option) =>
            option
              .setName('description')
              .setDescription('Kurze Beschreibung im Dropdown')
              .setRequired(true)
              .setMaxLength(100),
          )
          .addStringOption((option) =>
            option
              .setName('emoji')
              .setDescription('Optionales Unicode-Emoji')
              .setRequired(false)
              .setMaxLength(100),
          )
          .addChannelOption((option) =>
            option
              .setName('discord-category')
              .setDescription('Discord-Kategorie fuer neue Ticket-Kanaele')
              .addChannelTypes(ChannelType.GuildCategory)
              .setRequired(false),
          )
          .addRoleOption((option) =>
            option
              .setName('support-role')
              .setDescription('Zustaendige Support-Rolle')
              .setRequired(false),
          ),
      )
      .addSubcommand((command) =>
        command
          .setName('list')
          .setDescription('Zeigt alle Ticket-Kategorien.'),
      )
      .addSubcommand((command) =>
        command
          .setName('delete')
          .setDescription('Loescht eine Ticket-Kategorie.')
          .addStringOption((option) =>
            option
              .setName('key')
              .setDescription('Interner Name der Kategorie')
              .setRequired(true)
              .setAutocomplete(true),
          ),
      ),
    async execute(interaction) {
      const action = interaction.options.getSubcommand();

      if (action === 'list') {
        const categories = await service.list(interaction.guildId);
        await interaction.reply({
          content:
            categories.length === 0
              ? 'Es sind keine Ticket-Kategorien konfiguriert.'
              : [
                  '**Ticket-Kategorien**',
                  ...categories.map(
                    (category) =>
                      `${category.emoji || '-'} \`${category.key}\` - **${
                        category.label
                      }**`,
                  ),
                ].join('\n'),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const key = normalizeCategoryKey(
        interaction.options.getString('key', true),
      );
      if (action === 'delete') {
        const removed = await service.remove(interaction.guildId, key);
        await interaction.reply({
          content: `Ticket-Kategorie **${removed.label}** wurde geloescht. Sende das Ticket-Panel erneut, um das Dropdown zu aktualisieren.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const role = interaction.options.getRole('support-role');
      const parent = interaction.options.getChannel('discord-category');
      const category = await service.add(interaction.guildId, {
        key,
        label: interaction.options.getString('name', true),
        description: interaction.options.getString('description', true),
        emoji: interaction.options.getString('emoji') || '',
        parentCategoryId: parent?.id || '',
        supportRoleIds: role ? [role.id] : [],
      });
      await interaction.reply({
        content: `Ticket-Kategorie **${category.label}** (\`${category.key}\`) wurde erstellt. Sende jetzt mit \`/ticket-panel\` ein neues Dropdown.`,
        flags: MessageFlags.Ephemeral,
      });
    },
    async autocomplete(interaction) {
      const categories = await service.list(interaction.guildId);
      const focused = interaction.options.getFocused().toLowerCase();
      await interaction.respond(
        categories
          .filter(
            (category) =>
              category.key.includes(focused) ||
              category.label.toLowerCase().includes(focused),
          )
          .slice(0, 25)
          .map((category) => ({
            name: `${category.label} (${category.key})`.slice(0, 100),
            value: category.key,
          })),
      );
    },
  };
}

function summarize(config) {
  return [
    '**Server-Konfiguration**',
    `Willkommen: **${config.welcome.enabled ? 'aktiv' : 'inaktiv'}** · Kanal: ${
      config.welcome.channelId ? `<#${config.welcome.channelId}>` : 'nicht gesetzt'
    }`,
    `Tickets: **${config.tickets.enabled ? 'aktiv' : 'inaktiv'}** · Kategorien: ${
      config.tickets.categories.length
    } · Archiv: ${
      config.tickets.archiveCategoryId
        ? `<#${config.tickets.archiveCategoryId}>`
        : 'nicht gesetzt'
    }`,
    `Voice-Support: **${
      config.voiceSupport.enabled ? 'aktiv' : 'inaktiv'
    }** · Warteraum: ${
      config.voiceSupport.waitingChannelId
        ? `<#${config.voiceSupport.waitingChannelId}>`
        : 'nicht gesetzt'
    }`,
  ].join('\n');
}

function parseValue(rawValue, oldValue) {
  if (typeof oldValue === 'boolean') {
    if (!['true', 'false'].includes(rawValue.toLowerCase())) {
      throw new UserError('Dieser Wert muss true oder false sein.');
    }
    return rawValue.toLowerCase() === 'true';
  }
  return rawValue;
}

function getPath(object, key) {
  return key.split('.').reduce((value, part) => value?.[part], object);
}

function createPatch(key, value) {
  const parts = key.split('.');
  return parts.reduceRight((result, part) => ({ [part]: result }), value);
}

export function normalizeCategoryKey(value) {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  if (!/^[a-z0-9_-]{2,64}$/.test(key)) {
    throw new UserError(
      'Der Key darf nur Kleinbuchstaben, Zahlen, Bindestriche und Unterstriche enthalten.',
    );
  }
  return key;
}
