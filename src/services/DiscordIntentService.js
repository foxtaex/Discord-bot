import {
  ApplicationFlagsBitField,
  REST,
  Routes,
} from 'discord.js';

export async function resolveDiscordIntents(discordConfig, logger) {
  const requested = {
    guildMembersIntent: discordConfig.guildMembersIntent,
    messageContentIntent: discordConfig.messageContentIntent,
  };
  if (!requested.guildMembersIntent && !requested.messageContentIntent) {
    return discordConfig;
  }

  const rest = new REST({ version: '10' }).setToken(discordConfig.token);
  const application = await rest.get(Routes.currentApplication());
  const flags = new ApplicationFlagsBitField(application.flags || 0);
  const available = {
    guildMembersIntent:
      flags.has('GatewayGuildMembers') ||
      flags.has('GatewayGuildMembersLimited'),
    messageContentIntent:
      flags.has('GatewayMessageContent') ||
      flags.has('GatewayMessageContentLimited'),
  };

  for (const intent of Object.keys(requested)) {
    if (requested[intent] && !available[intent]) {
      logger.warn(
        {
          intent,
          applicationId: application.id,
          portalUrl: `https://discord.com/developers/applications/${application.id}/bot`,
        },
        'Requested privileged intent is not enabled in the Discord Developer Portal and will be skipped',
      );
    }
  }

  return {
    ...discordConfig,
    requestedGuildMembersIntent: requested.guildMembersIntent,
    requestedMessageContentIntent: requested.messageContentIntent,
    guildMembersIntent:
      requested.guildMembersIntent && available.guildMembersIntent,
    messageContentIntent:
      requested.messageContentIntent && available.messageContentIntent,
  };
}
