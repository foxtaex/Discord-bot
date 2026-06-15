import { toJson } from '../database/json.js';

export class LogRepository {
  constructor(database) {
    this.database = database;
  }

  async write({ guildId = null, level = 'info', source, message, context = {} }) {
    await this.database('application_logs').insert({
      guild_id: guildId,
      level,
      source,
      message,
      context_json: toJson(context),
    });
  }
}
