import { fromJson, toJson } from '../database/json.js';

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

  async list({ guildId, limit = 100 }) {
    const rows = await this.database('application_logs')
      .where({ guild_id: guildId })
      .orderBy('id', 'desc')
      .limit(Math.min(limit, 500));
    return rows.map((row) => ({
      id: row.id,
      guildId: row.guild_id,
      level: row.level,
      source: row.source,
      message: row.message,
      context: fromJson(row.context_json, {}),
      createdAt: row.created_at,
    }));
  }
}
