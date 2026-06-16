import {
  Events,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

export async function createModule(context) {
  return {
    name: 'general',
    async register(registry) {
      registry.registerEvent(
        Events.ClientReady,
        (client) => {
          client.user.setActivity('Support & Tickets');
          context.logger.info(
            {
              user: client.user.tag,
              guilds: client.guilds.cache.size,
            },
            'Discord client ready',
          );
        },
        { once: true },
      );

      registry.registerCommand({
        data: new SlashCommandBuilder()
          .setName('ping')
          .setDescription('Prueft die Erreichbarkeit des Bots.'),
        async execute(interaction) {
          await interaction.reply({
            content: `Pong: ${interaction.client.ws.ping} ms`,
            flags: MessageFlags.Ephemeral,
          });
        },
      });

      registry.registerCommand({
        data: new SlashCommandBuilder()
          .setName('help')
          .setDescription('Zeigt die wichtigsten Bot-Funktionen.'),
        async execute(interaction) {
          await interaction.reply({
            content: [
              '**Support Bot**',
              '`/ticket-panel` erstellt ein Ticket-Menue.',
              '`/ticket close|reopen|transcript|delete` verwaltet Tickets.',
              '`/ticket-category add|edit|list|delete` verwaltet Ticket-Kategorien.',
              '`/voice-support status|move|close` verwaltet Voice-Faelle.',
              '`/voice-category add|edit|list|delete` verwaltet Voice-Warteraeume.',
              '`/fraktion` verwaltet und zeigt die Fraktionsliste.',
              '`/webkey erstellen|liste|widerrufen` verwaltet Webpanel-Zugriffe.',
              '`/bot-config show|set` verwaltet Server-Einstellungen.',
            ].join('\n'),
            flags: MessageFlags.Ephemeral,
          });
        },
      });
    },
  };
}
