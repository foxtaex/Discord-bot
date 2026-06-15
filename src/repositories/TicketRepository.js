import { randomInt, randomUUID } from 'node:crypto';
import { fromJson, toJson } from '../database/json.js';

export class TicketRepository {
  constructor(database) {
    this.database = database;
  }

  async create({ guildId, userId, categoryKey, metadata = {} }) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const record = {
        public_id: randomUUID(),
        ticket_number: generateTicketNumber(),
        guild_id: guildId,
        user_id: userId,
        category_key: categoryKey,
        status: 'creating',
        active_key: `${guildId}:${userId}:${categoryKey}`,
        metadata_json: toJson(metadata),
      };

      try {
        const [id] = await this.database('tickets').insert(record);
        return this.findById(typeof id === 'object' ? id.id : id);
      } catch (error) {
        if (!isUniqueConstraintError(error, 'ticket_number') || attempt === 9) {
          throw error;
        }
      }
    }

    throw new Error('Could not allocate a unique ticket number.');
  }

  async findById(id) {
    const row = await this.database('tickets').where({ id }).first();
    return mapTicket(row);
  }

  async findByPublicId(publicId) {
    const row = await this.database('tickets')
      .where({ public_id: publicId })
      .first();
    return mapTicket(row);
  }

  async findByTicketNumber(ticketNumber) {
    const row = await this.database('tickets')
      .where({ ticket_number: ticketNumber })
      .first();
    return mapTicket(row);
  }

  async findByChannelId(channelId) {
    const row = await this.database('tickets')
      .where({ channel_id: channelId })
      .first();
    return mapTicket(row);
  }

  async findActive(guildId, userId, categoryKey) {
    const row = await this.database('tickets')
      .where({
        active_key: `${guildId}:${userId}:${categoryKey}`,
      })
      .first();
    return mapTicket(row);
  }

  async list({ guildId, status, userId, limit = 100 }) {
    const query = this.database('tickets')
      .where({ guild_id: guildId })
      .orderBy('id', 'desc')
      .limit(limit);

    if (status) query.andWhere({ status });
    if (userId) query.andWhere({ user_id: userId });

    return (await query).map(mapTicket);
  }

  async update(id, changes) {
    const mapped = { ...changes, updated_at: this.database.fn.now() };
    if ('metadata' in mapped) {
      mapped.metadata_json = toJson(mapped.metadata);
      delete mapped.metadata;
    }

    await this.database('tickets').where({ id }).update(mapped);
    return this.findById(id);
  }

  async addAction(ticketId, action, actorId = null, details = {}) {
    await this.database('ticket_actions').insert({
      ticket_id: ticketId,
      action,
      actor_id: actorId,
      details_json: toJson(details),
    });
  }

  async listActions(ticketId) {
    const rows = await this.database('ticket_actions')
      .where({ ticket_id: ticketId })
      .orderBy('id', 'asc');

    return rows.map((row) => ({
      ...row,
      details: fromJson(row.details_json, {}),
    }));
  }
}

function mapTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    publicId: row.public_id,
    ticketNumber: row.ticket_number,
    guildId: row.guild_id,
    channelId: row.channel_id,
    userId: row.user_id,
    categoryKey: row.category_key,
    status: row.status,
    activeKey: row.active_key,
    claimedBy: row.claimed_by,
    closedBy: row.closed_by,
    deletedBy: row.deleted_by,
    transcriptPath: row.transcript_path,
    metadata: fromJson(row.metadata_json, {}),
    closedAt: row.closed_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function generateTicketNumber() {
  return String(randomInt(100000, 1000000));
}

function isUniqueConstraintError(error, column) {
  const message = String(error?.message || '').toLowerCase();
  return (
    (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      error?.code === 'ER_DUP_ENTRY' ||
      message.includes('unique constraint')) &&
    message.includes(column)
  );
}
