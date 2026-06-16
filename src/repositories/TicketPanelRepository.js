export class TicketPanelRepository {
  constructor(database) {
    this.database = database;
  }

  async register({ guildId, channelId, messageId, createdBy = null }) {
    const payload = {
      guild_id: guildId,
      channel_id: channelId,
      message_id: messageId,
      created_by: createdBy,
      updated_at: this.database.fn.now(),
    };
    await this.database('ticket_panels')
      .insert(payload)
      .onConflict('message_id')
      .merge(payload);
    return this.findByMessage(messageId);
  }

  async findByMessage(messageId) {
    const row = await this.database('ticket_panels')
      .where({ message_id: messageId })
      .first();
    return mapTicketPanel(row);
  }

  async listByGuild(guildId) {
    const rows = await this.database('ticket_panels')
      .where({ guild_id: guildId })
      .orderBy('id', 'asc');
    return rows.map(mapTicketPanel);
  }

  async removeByMessage(messageId) {
    return this.database('ticket_panels')
      .where({ message_id: messageId })
      .delete();
  }
}

function mapTicketPanel(row) {
  if (!row) return null;
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
