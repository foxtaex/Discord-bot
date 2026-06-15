import { fromJson, toJson } from '../database/json.js';

export class GuildConfigRepository {
  constructor(database) {
    this.database = database;
  }

  async find(guildId) {
    const row = await this.database('guild_configs')
      .where({ guild_id: guildId })
      .first();
    return row ? fromJson(row.config_json, {}) : null;
  }

  async upsert(guildId, config) {
    const payload = {
      guild_id: guildId,
      config_json: toJson(config),
      updated_at: this.database.fn.now(),
    };

    await this.database('guild_configs')
      .insert(payload)
      .onConflict('guild_id')
      .merge(payload);
  }

  async listCategories(guildId) {
    const rows = await this.database('ticket_categories')
      .where({ guild_id: guildId, enabled: true })
      .orderBy('sort_order', 'asc')
      .orderBy('id', 'asc');

    return rows.map((row) => ({
      key: row.category_key,
      label: row.label,
      description: row.description,
      emoji: row.emoji,
      parentCategoryId: row.parent_category_id || '',
      supportRoleIds: fromJson(row.support_role_ids, []),
    }));
  }

  async replaceCategories(guildId, categories) {
    await this.database.transaction(async (trx) => {
      await trx('ticket_categories').where({ guild_id: guildId }).delete();
      if (categories.length === 0) return;

      await trx('ticket_categories').insert(
        categories.map((category, index) => ({
          guild_id: guildId,
          category_key: category.key,
          label: category.label,
          description: category.description || '',
          emoji: category.emoji || '',
          parent_category_id: category.parentCategoryId || null,
          support_role_ids: toJson(category.supportRoleIds || []),
          sort_order: index,
          enabled: true,
        })),
      );
    });
  }
}
