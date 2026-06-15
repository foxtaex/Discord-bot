import { Events } from 'discord.js';
import { WelcomeService } from '../../services/WelcomeService.js';

export async function createModule(context) {
  const service = new WelcomeService(context);
  context.services.welcome = service;

  return {
    name: 'welcome',
    async register(registry) {
      if (!context.config.discord.guildMembersIntent) {
        registry.registerEvent(
          Events.ClientReady,
          async (client) => {
            for (const guild of client.guilds.cache.values()) {
              const config = await context.configService.get(guild.id);
              if (config.welcome.enabled) {
                context.logger.warn(
                  {
                    guildId: guild.id,
                    portalUrl: `https://discord.com/developers/applications/${context.config.discord.clientId}/bot`,
                  },
                  'Welcome is enabled but cannot receive member events. Enable Server Members Intent in the Discord Developer Portal.',
                );
              }
            }
          },
          { once: true },
        );
        return;
      }
      registry.registerEvent(Events.GuildMemberAdd, (member) =>
        service.welcome(member),
      );
    },
  };
}
