import { randomUUID } from 'node:crypto';

export class FactionRepository {
  constructor(database) {
    this.database = database;
  }

  async create(guildId, faction, actorId) {
    const [id] = await this.database('factions').insert({
      public_id: randomUUID(),
      guild_id: guildId,
      name: faction.name,
      status: faction.status,
      type: faction.type,
      leader_id: faction.leaderId || null,
      deputy_id: faction.deputyId || null,
      discord_role_id: faction.discordRoleId || null,
      channel_id: faction.channelId || null,
      description: faction.description || null,
      notes: faction.notes || null,
      created_by: actorId,
      updated_by: actorId,
    });
    return this.findById(typeof id === 'object' ? id.id : id);
  }

  async findById(id) {
    const row = await this.database('factions').where({ id }).first();
    return this.mapWithMembers(row);
  }

  async findByPublicId(publicId) {
    const row = await this.database('factions')
      .where({ public_id: publicId })
      .first();
    return this.mapWithMembers(row);
  }

  async findByName(guildId, name) {
    const row = await this.database('factions')
      .where({ guild_id: guildId })
      .whereRaw('LOWER(name) = LOWER(?)', [name])
      .first();
    return this.mapWithMembers(row);
  }

  async list(guildId) {
    const rows = await this.database('factions')
      .where({ guild_id: guildId })
      .orderBy('name', 'asc');
    return Promise.all(rows.map((row) => this.mapWithMembers(row)));
  }

  async update(id, changes, actorId) {
    const mapped = mapFactionChanges(changes);
    await this.database('factions')
      .where({ id })
      .update({
        ...mapped,
        updated_by: actorId,
        updated_at: this.database.fn.now(),
      });
    return this.findById(id);
  }

  async delete(id) {
    return this.database('factions').where({ id }).delete();
  }

  async addMember(factionId, member, actorId) {
    const payload = {
      faction_id: factionId,
      user_id: member.userId,
      display_name: member.displayName || null,
      position: member.position || null,
      notes: member.notes || null,
      added_by: actorId,
      updated_at: this.database.fn.now(),
    };
    await this.database('faction_members')
      .insert(payload)
      .onConflict(['faction_id', 'user_id'])
      .merge(payload);
    return this.findById(factionId);
  }

  async removeMember(factionId, userId) {
    await this.database('faction_members')
      .where({ faction_id: factionId, user_id: userId })
      .delete();
    return this.findById(factionId);
  }

  async listMembers(factionId) {
    const rows = await this.database('faction_members')
      .where({ faction_id: factionId })
      .orderBy('id', 'asc');
    return rows.map(mapMember);
  }

  async mapWithMembers(row) {
    if (!row) return null;
    return {
      ...mapFaction(row),
      members: await this.listMembers(row.id),
    };
  }
}

function mapFaction(row) {
  return {
    id: row.id,
    publicId: row.public_id,
    guildId: row.guild_id,
    name: row.name,
    status: row.status,
    type: row.type,
    leaderId: row.leader_id,
    deputyId: row.deputy_id,
    discordRoleId: row.discord_role_id,
    channelId: row.channel_id,
    description: row.description || '',
    notes: row.notes || '',
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMember(row) {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    position: row.position,
    notes: row.notes,
    addedBy: row.added_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFactionChanges(changes) {
  const result = {};
  const mapping = {
    name: 'name',
    status: 'status',
    type: 'type',
    leaderId: 'leader_id',
    deputyId: 'deputy_id',
    discordRoleId: 'discord_role_id',
    channelId: 'channel_id',
    description: 'description',
    notes: 'notes',
  };
  for (const [key, column] of Object.entries(mapping)) {
    if (key in changes) result[column] = changes[key] || null;
  }
  return result;
}
