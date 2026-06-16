import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { UserError } from '../../core/errors.js';
import { TicketCategoryService } from '../../services/TicketCategoryService.js';
import { VoiceCategoryService } from '../../services/VoiceCategoryService.js';

const editableKeys = [
  ['welcome.enabled', 'Willkommen aktiv'],
  ['welcome.channelId', 'Willkommenskanal'],
  ['welcome.message', 'Willkommenstext'],
  ['tickets.enabled', 'Tickets aktiv'],
  ['tickets.categoryId', 'Ticket-Kategorie'],
  ['tickets.archiveCategoryId', 'Archiv-Kategorie'],
  ['tickets.logChannelId', 'Ticket-Logkanal'],
  ['tickets.maxActivePerCategory', 'Maximale aktive Tickets je Kategorie'],
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
  const voiceCategoryService = new VoiceCategoryService(context.configService);
  context.services.ticketCategories = ticketCategoryService;
  context.services.voiceCategories = voiceCategoryService;

  return {
    name: 'configuration',
    async register(registry) {
      registry.registerCommand(createConfigCommand(context));
      registry.registerCommand(
        createTicketCategoryCommand(ticketCategoryService, context),
      );
      registry.registerCommand(createVoiceCategoryCommand(voiceCategoryService));
    },
  };
}

function createConfigCommand(context) {
  return {
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
  };
}

function createTicketCategoryCommand(service, context) {
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
          .setName('edit')
          .setDescription('Bearbeitet eine vorhandene Ticket-Kategorie.')
          .addStringOption((option) =>
            option
              .setName('key')
              .setDescription('Zu bearbeitende Kategorie')
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addStringOption((option) =>
            option
              .setName('name')
              .setDescription('Neuer sichtbarer Name')
              .setRequired(false)
              .setMaxLength(100),
          )
          .addStringOption((option) =>
            option
              .setName('description')
              .setDescription('Neue Beschreibung')
              .setRequired(false)
              .setMaxLength(100),
          )
          .addStringOption((option) =>
            option
              .setName('emoji')
              .setDescription('Neues Unicode-Emoji')
              .setRequired(false)
              .setMaxLength(100),
          )
          .addChannelOption((option) =>
            option
              .setName('discord-category')
              .setDescription('Neue Discord-Kategorie')
              .addChannelTypes(ChannelType.GuildCategory)
              .setRequired(false),
          )
          .addRoleOption((option) =>
            option
              .setName('support-role')
              .setDescription('Neue zustaendige Support-Rolle')
              .setRequired(false),
          )
          .addBooleanOption((option) =>
            option
              .setName('clear-emoji')
              .setDescription('Vorhandenes Emoji entfernen'),
          )
          .addBooleanOption((option) =>
            option
              .setName('clear-discord-category')
              .setDescription('Eigene Discord-Kategorie entfernen'),
          )
          .addBooleanOption((option) =>
            option
              .setName('clear-support-role')
              .setDescription('Eigene Support-Rolle entfernen'),
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
        const refresh = await refreshTicketPanels(
          context,
          interaction.guildId,
        );
        await interaction.reply({
          content: `Ticket-Kategorie **${removed.label}** wurde geloescht. ${formatPanelRefresh(refresh)}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (action === 'edit') {
        const changes = collectTicketCategoryChanges(interaction);
        if (Object.keys(changes).length === 0) {
          throw new UserError('Gib mindestens einen neuen Wert an.');
        }
        const category = await service.update(
          interaction.guildId,
          key,
          changes,
        );
        const refresh = await refreshTicketPanels(
          context,
          interaction.guildId,
        );
        await interaction.reply({
          content: `Ticket-Kategorie **${category.label}** wurde aktualisiert. ${formatPanelRefresh(refresh)}`,
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
      const refresh = await refreshTicketPanels(
        context,
        interaction.guildId,
      );
      await interaction.reply({
        content: `Ticket-Kategorie **${category.label}** (\`${category.key}\`) wurde erstellt. ${formatPanelRefresh(refresh)}`,
        flags: MessageFlags.Ephemeral,
      });
    },
    async autocomplete(interaction) {
      await respondWithCategoryAutocomplete(interaction, service);
    },
  };
}

function createVoiceCategoryCommand(service) {
  return {
    data: new SlashCommandBuilder()
      .setName('voice-category')
      .setDescription('Verwaltet Voice-Support-Warteraeume.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((command) =>
        command
          .setName('add')
          .setDescription('Erstellt eine neue Voice-Support-Kategorie.')
          .addStringOption((option) =>
            option
              .setName('key')
              .setDescription('Kurzer interner Name, z. B. technical')
              .setRequired(true)
              .setMinLength(2)
              .setMaxLength(64),
          )
          .addStringOption((option) =>
            option
              .setName('name')
              .setDescription('Sichtbarer Name der Voice-Kategorie')
              .setRequired(true)
              .setMaxLength(100),
          )
          .addChannelOption((option) =>
            option
              .setName('waiting-channel')
              .setDescription('Voice-Warteraum fuer diese Kategorie')
              .addChannelTypes(
                ChannelType.GuildVoice,
                ChannelType.GuildStageVoice,
              )
              .setRequired(true),
          )
          .addChannelOption((option) =>
            option
              .setName('notification-channel')
              .setDescription('Textkanal fuer Support-Benachrichtigungen')
              .addChannelTypes(
                ChannelType.GuildText,
                ChannelType.GuildAnnouncement,
              )
              .setRequired(true),
          )
          .addChannelOption((option) =>
            option
              .setName('discord-category')
              .setDescription('Discord-Kategorie fuer private Support-Raeume')
              .addChannelTypes(ChannelType.GuildCategory),
          )
          .addRoleOption((option) =>
            option
              .setName('support-role')
              .setDescription('Zustaendige Support-Rolle'),
          )
          .addStringOption((option) =>
            option
              .setName('room-name')
              .setDescription('Raum-Schema, z. B. Support | {username}')
              .setMaxLength(100),
          ),
      )
      .addSubcommand((command) =>
        command
          .setName('edit')
          .setDescription('Bearbeitet eine Voice-Support-Kategorie.')
          .addStringOption((option) =>
            option
              .setName('key')
              .setDescription('Zu bearbeitende Kategorie')
              .setRequired(true)
              .setAutocomplete(true),
          )
          .addStringOption((option) =>
            option
              .setName('name')
              .setDescription('Neuer sichtbarer Name')
              .setMaxLength(100),
          )
          .addChannelOption((option) =>
            option
              .setName('waiting-channel')
              .setDescription('Neuer Voice-Warteraum')
              .addChannelTypes(
                ChannelType.GuildVoice,
                ChannelType.GuildStageVoice,
              ),
          )
          .addChannelOption((option) =>
            option
              .setName('notification-channel')
              .setDescription('Neuer Benachrichtigungskanal')
              .addChannelTypes(
                ChannelType.GuildText,
                ChannelType.GuildAnnouncement,
              ),
          )
          .addChannelOption((option) =>
            option
              .setName('discord-category')
              .setDescription('Neue Discord-Kategorie fuer Support-Raeume')
              .addChannelTypes(ChannelType.GuildCategory),
          )
          .addRoleOption((option) =>
            option
              .setName('support-role')
              .setDescription('Neue zustaendige Support-Rolle'),
          )
          .addStringOption((option) =>
            option
              .setName('room-name')
              .setDescription('Neues Raum-Schema')
              .setMaxLength(100),
          )
          .addBooleanOption((option) =>
            option
              .setName('clear-discord-category')
              .setDescription('Eigene Discord-Kategorie entfernen'),
          )
          .addBooleanOption((option) =>
            option
              .setName('clear-notification-channel')
              .setDescription('Eigenen Benachrichtigungskanal entfernen'),
          )
          .addBooleanOption((option) =>
            option
              .setName('clear-support-role')
              .setDescription('Eigene Support-Rolle entfernen'),
          )
          .addBooleanOption((option) =>
            option
              .setName('clear-room-name')
              .setDescription('Eigenes Raum-Schema entfernen'),
          ),
      )
      .addSubcommand((command) =>
        command
          .setName('list')
          .setDescription('Zeigt alle Voice-Support-Kategorien.'),
      )
      .addSubcommand((command) =>
        command
          .setName('delete')
          .setDescription('Loescht eine Voice-Support-Kategorie.')
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
              ? 'Es sind keine Voice-Support-Kategorien konfiguriert.'
              : [
                  '**Voice-Support-Kategorien**',
                  ...categories.map(
                    (category) =>
                      `\`${category.key}\` - **${category.label}** | Warteraum: <#${category.waitingChannelId}> | Benachrichtigung: ${
                        category.notificationChannelId
                          ? `<#${category.notificationChannelId}>`
                          : 'globaler Kanal'
                      }`,
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
          content: `Voice-Support-Kategorie **${removed.label}** wurde geloescht. Bereits aktive Faelle bleiben erhalten.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (action === 'edit') {
        const changes = collectVoiceCategoryChanges(interaction);
        if (Object.keys(changes).length === 0) {
          throw new UserError('Gib mindestens einen neuen Wert an.');
        }
        const category = await service.update(
          interaction.guildId,
          key,
          changes,
        );
        await interaction.reply({
          content: `Voice-Support-Kategorie **${category.label}** wurde aktualisiert.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const waitingChannel = interaction.options.getChannel(
        'waiting-channel',
        true,
      );
      const notificationChannel = interaction.options.getChannel(
        'notification-channel',
        true,
      );
      const parent = interaction.options.getChannel('discord-category');
      const role = interaction.options.getRole('support-role');
      const category = await service.add(interaction.guildId, {
        key,
        label: interaction.options.getString('name', true),
        waitingChannelId: waitingChannel.id,
        parentCategoryId: parent?.id || '',
        notificationChannelId: notificationChannel.id,
        supportRoleIds: role ? [role.id] : [],
        roomName: interaction.options.getString('room-name') || '',
      });
      await interaction.reply({
        content: `Voice-Support-Kategorie **${category.label}** (\`${category.key}\`) wurde erstellt. Nutzer in <#${category.waitingChannelId}> werden jetzt erkannt.`,
        flags: MessageFlags.Ephemeral,
      });
    },
    async autocomplete(interaction) {
      await respondWithCategoryAutocomplete(interaction, service);
    },
  };
}

async function refreshTicketPanels(context, guildId) {
  const ticketService = context.services.tickets;
  if (!ticketService) {
    return { total: 0, updated: 0, removed: 0, failed: 0 };
  }
  return ticketService.refreshPanels(guildId);
}

function formatPanelRefresh(result) {
  if (result.total === 0) {
    return 'Es ist noch kein registriertes Ticket-Panel vorhanden.';
  }
  const parts = [`${result.updated} Panel aktualisiert`];
  if (result.removed > 0) {
    parts.push(`${result.removed} geloeschte Panel-Referenz entfernt`);
  }
  if (result.failed > 0) {
    parts.push(`${result.failed} Aktualisierung fehlgeschlagen`);
  }
  return `${parts.join(', ')}.`;
}

function collectTicketCategoryChanges(interaction) {
  const changes = {};
  const label = interaction.options.getString('name');
  const description = interaction.options.getString('description');
  const emoji = interaction.options.getString('emoji');
  const parent = interaction.options.getChannel('discord-category');
  const role = interaction.options.getRole('support-role');

  if (label !== null) changes.label = label;
  if (description !== null) changes.description = description;
  if (emoji !== null) changes.emoji = emoji;
  if (parent) changes.parentCategoryId = parent.id;
  if (role) changes.supportRoleIds = [role.id];
  if (interaction.options.getBoolean('clear-emoji')) changes.emoji = '';
  if (interaction.options.getBoolean('clear-discord-category')) {
    changes.parentCategoryId = '';
  }
  if (interaction.options.getBoolean('clear-support-role')) {
    changes.supportRoleIds = [];
  }
  return changes;
}

function collectVoiceCategoryChanges(interaction) {
  const changes = {};
  const label = interaction.options.getString('name');
  const waitingChannel = interaction.options.getChannel('waiting-channel');
  const notificationChannel = interaction.options.getChannel(
    'notification-channel',
  );
  const parent = interaction.options.getChannel('discord-category');
  const role = interaction.options.getRole('support-role');
  const roomName = interaction.options.getString('room-name');

  if (label !== null) changes.label = label;
  if (waitingChannel) changes.waitingChannelId = waitingChannel.id;
  if (notificationChannel) {
    changes.notificationChannelId = notificationChannel.id;
  }
  if (parent) changes.parentCategoryId = parent.id;
  if (role) changes.supportRoleIds = [role.id];
  if (roomName !== null) changes.roomName = roomName;
  if (interaction.options.getBoolean('clear-discord-category')) {
    changes.parentCategoryId = '';
  }
  if (interaction.options.getBoolean('clear-notification-channel')) {
    changes.notificationChannelId = '';
  }
  if (interaction.options.getBoolean('clear-support-role')) {
    changes.supportRoleIds = [];
  }
  if (interaction.options.getBoolean('clear-room-name')) {
    changes.roomName = '';
  }
  return changes;
}

async function respondWithCategoryAutocomplete(interaction, service) {
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
}

function summarize(config) {
  return [
    '**Server-Konfiguration**',
    `Willkommen: **${config.welcome.enabled ? 'aktiv' : 'inaktiv'}** | Kanal: ${
      config.welcome.channelId
        ? `<#${config.welcome.channelId}>`
        : 'nicht gesetzt'
    }`,
    `Tickets: **${config.tickets.enabled ? 'aktiv' : 'inaktiv'}** | Kategorien: ${
      config.tickets.categories.length
    } | Archiv: ${
      config.tickets.archiveCategoryId
        ? `<#${config.tickets.archiveCategoryId}>`
        : 'nicht gesetzt'
    }`,
    `Voice-Support: **${
      config.voiceSupport.enabled ? 'aktiv' : 'inaktiv'
    }** | Kategorien: ${config.voiceSupport.categories.length} | Warteraum: ${
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
  if (typeof oldValue === 'number') {
    const value = Number(rawValue);
    if (!Number.isInteger(value)) {
      throw new UserError('Dieser Wert muss eine ganze Zahl sein.');
    }
    return value;
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
