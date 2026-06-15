import { randomUUID } from 'node:crypto';

export class VoiceCaseRepository {
  constructor(database) {
    this.database = database;
  }

  async create({ guildId, userId, waitingChannelId }) {
    const row = {
      public_id: randomUUID(),
      guild_id: guildId,
      user_id: userId,
      waiting_channel_id: waitingChannelId,
      status: 'creating',
      active_key: `${guildId}:${userId}`,
    };
    const [id] = await this.database('voice_cases').insert(row);
    return this.findById(typeof id === 'object' ? id.id : id);
  }

  async findById(id) {
    const row = await this.database('voice_cases').where({ id }).first();
    return mapVoiceCase(row);
  }

  async findActive(guildId, userId) {
    const row = await this.database('voice_cases')
      .where({ active_key: `${guildId}:${userId}` })
      .first();
    return mapVoiceCase(row);
  }

  async findBySupportChannel(channelId) {
    const row = await this.database('voice_cases')
      .where({ support_channel_id: channelId })
      .first();
    return mapVoiceCase(row);
  }

  async update(id, changes) {
    await this.database('voice_cases')
      .where({ id })
      .update({ ...changes, updated_at: this.database.fn.now() });
    return this.findById(id);
  }
}

function mapVoiceCase(row) {
  if (!row) return null;
  return {
    id: row.id,
    publicId: row.public_id,
    guildId: row.guild_id,
    userId: row.user_id,
    waitingChannelId: row.waiting_channel_id,
    supportChannelId: row.support_channel_id,
    notificationChannelId: row.notification_channel_id,
    status: row.status,
    activeKey: row.active_key,
    claimedBy: row.claimed_by,
    inviteCode: row.invite_code,
    closedBy: row.closed_by,
    claimedAt: row.claimed_at,
    movedAt: row.moved_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
