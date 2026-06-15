import { EmbedBuilder } from 'discord.js';
import { parseColor } from '../utils/discord.js';

export class AuditService {
  constructor({ client, configService, logRepository, logger }) {
    this.client = client;
    this.configService = configService;
    this.logRepository = logRepository;
    this.logger = logger;
  }

  async write({
    guildId = null,
    level = 'info',
    source,
    message,
    context = {},
    discord = false,
  }) {
    await this.logRepository
      .write({ guildId, level, source, message, context })
      .catch((error) =>
        this.logger.error({ error }, 'Could not persist audit log'),
      );

    this.logger[level]?.({ guildId, source, ...context }, message);

    if (!discord || !guildId) return;
    const config = await this.configService.get(guildId);
    const channelId = config.tickets.logChannelId;
    if (!channelId) return;

    const guild = this.client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;

    const fields = Object.entries(context)
      .slice(0, 10)
      .map(([name, value]) => ({
        name,
        value: String(value ?? '-').slice(0, 1024),
        inline: true,
      }));

    await channel
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(parseColor(config.branding.color))
            .setTitle(source)
            .setDescription(message)
            .addFields(fields)
            .setTimestamp(),
        ],
      })
      .catch((error) =>
        this.logger.warn(
          { error, guildId, channelId },
          'Could not send Discord audit log',
        ),
      );
  }
}
