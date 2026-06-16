import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

export async function createModule(context) {
  return {
    name: 'web-access',
    async register(registry) {
      registry.registerCommand(createWebKeyCommand(context));
    },
  };
}

function createWebKeyCommand(context) {
  return {
    data: new SlashCommandBuilder()
      .setName('webkey')
      .setDescription('Verwaltet temporaere Webpanel-Zugriffsschluessel.')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((command) =>
        command
          .setName('erstellen')
          .setDescription('Erstellt einen einmal verwendbaren Webkey.')
          .addStringOption((option) =>
            option
              .setName('stufe')
              .setDescription('Berechtigungsstufe')
              .addChoices(
                { name: 'Lesen', value: 'viewer' },
                { name: 'Bearbeiten', value: 'editor' },
                { name: 'Administrator', value: 'admin' },
              ),
          )
          .addIntegerOption((option) =>
            option
              .setName('stunden')
              .setDescription('Gueltigkeit in Stunden, Standard: 2')
              .setMinValue(1)
              .setMaxValue(24),
          ),
      )
      .addSubcommand((command) =>
        command
          .setName('liste')
          .setDescription('Zeigt temporaere Webkeys.'),
      )
      .addSubcommand((command) =>
        command
          .setName('widerrufen')
          .setDescription('Widerruft einen Webkey und seine Sitzung.')
          .addIntegerOption((option) =>
            option
              .setName('id')
              .setDescription('Key-ID')
              .setRequired(true)
              .setAutocomplete(true),
          ),
      ),
    async execute(interaction) {
      const action = interaction.options.getSubcommand();
      if (action === 'erstellen') {
        const created = await context.webAccessService.create({
          guildId: interaction.guildId,
          createdBy: interaction.user.id,
          permissionLevel:
            interaction.options.getString('stufe') || 'editor',
          durationHours: interaction.options.getInteger('stunden') || 2,
        });
        await interaction.reply({
          content: [
            '**Temporaerer Webpanel-Zugriff**',
            `URL: ${context.config.api.webPanelPublicUrl}`,
            `Key: \`${created.accessKey}\``,
            `Gueltig bis: <t:${Math.floor(
              new Date(created.expiresAt).getTime() / 1000,
            )}:F>`,
            `Stufe: **${created.permissionLevel}**`,
            'Der Key kann nur einmal zum Anmelden verwendet werden. Danach laeuft die Sitzung bis zum Ablauf weiter.',
          ].join('\n'),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (action === 'liste') {
        const keys = await context.webAccessService.list(interaction.guildId);
        await interaction.reply({
          content:
            keys.length === 0
              ? 'Es wurden noch keine Webkeys erstellt.'
              : keys
                  .slice(0, 25)
                  .map(
                    (key) =>
                      `#${key.id} \`${key.shortKey}\` | ${key.permissionLevel} | **${key.status}** | <t:${Math.floor(
                        new Date(key.expiresAt).getTime() / 1000,
                      )}:R> | von <@${key.createdBy}>`,
                  )
                  .join('\n'),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const key = await context.webAccessService.revoke(
        interaction.guildId,
        interaction.options.getInteger('id', true),
        interaction.user.id,
      );
      await interaction.reply({
        content: `Webkey #${key.id} wurde widerrufen.`,
        flags: MessageFlags.Ephemeral,
      });
    },
    async autocomplete(interaction) {
      const keys = await context.webAccessService.list(interaction.guildId);
      const focused = String(interaction.options.getFocused());
      await interaction.respond(
        keys
          .filter(
            (key) =>
              key.status === 'active' &&
              (`${key.id}`.includes(focused) ||
                key.prefix.includes(focused.toLowerCase())),
          )
          .slice(0, 25)
          .map((key) => ({
            name: `#${key.id} ${key.shortKey} (${key.permissionLevel})`,
            value: key.id,
          })),
      );
    },
  };
}
