import { REST, Routes } from 'discord.js';

export class CommandDeploymentService {
  constructor({ token, clientId, guildId, logger }) {
    this.rest = new REST({ version: '10' }).setToken(token);
    this.clientId = clientId;
    this.guildId = guildId;
    this.logger = logger;
  }

  async deploy(commands) {
    const route = this.guildId
      ? Routes.applicationGuildCommands(this.clientId, this.guildId)
      : Routes.applicationCommands(this.clientId);
    const deployed = await this.rest.put(route, { body: commands });

    this.logger.info(
      {
        commandCount: deployed.length,
        commands: deployed.map((command) => command.name),
        scope: this.guildId || 'global',
      },
      'Application commands deployed',
    );
    return deployed;
  }
}
