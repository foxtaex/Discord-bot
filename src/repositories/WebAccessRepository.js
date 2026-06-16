import { fromJson, toJson } from '../database/json.js';

export class WebAccessRepository {
  constructor(database) {
    this.database = database;
  }

  async createKey(record) {
    const [id] = await this.database('web_access_keys').insert({
      guild_id: record.guildId,
      key_prefix: record.prefix,
      key_hash: record.keyHash,
      created_by: record.createdBy,
      permission_level: record.permissionLevel,
      permissions_json: toJson(record.permissions),
      expires_at: record.expiresAt,
    });
    return this.findKeyById(typeof id === 'object' ? id.id : id);
  }

  async findKeyById(id) {
    const row = await this.database('web_access_keys').where({ id }).first();
    return mapKey(row);
  }

  async findKeyByHash(keyHash) {
    const row = await this.database('web_access_keys')
      .where({ key_hash: keyHash })
      .first();
    return mapKey(row);
  }

  async listKeys(guildId, limit = 100) {
    const rows = await this.database('web_access_keys')
      .where({ guild_id: guildId })
      .orderBy('id', 'desc')
      .limit(limit);
    return rows.map(mapKey);
  }

  async consumeKey(id, usedAt) {
    return this.database('web_access_keys')
      .where({ id })
      .whereNull('used_at')
      .whereNull('revoked_at')
      .where('expires_at', '>', usedAt)
      .update({
        used_at: usedAt,
        last_used_at: usedAt,
        updated_at: this.database.fn.now(),
      });
  }

  async revokeKey(id, revokedAt) {
    await this.database.transaction(async (trx) => {
      await trx('web_access_keys')
        .where({ id })
        .update({
          revoked_at: revokedAt,
          updated_at: trx.fn.now(),
        });
      await trx('web_sessions')
        .where({ web_key_id: id })
        .whereNull('revoked_at')
        .update({ revoked_at: revokedAt, updated_at: trx.fn.now() });
    });
    return this.findKeyById(id);
  }

  async createSession(record) {
    const [id] = await this.database('web_sessions').insert({
      web_key_id: record.webKeyId,
      guild_id: record.guildId,
      user_id: record.userId,
      permission_level: record.permissionLevel,
      permissions_json: toJson(record.permissions),
      session_hash: record.sessionHash,
      csrf_hash: record.csrfHash,
      expires_at: record.expiresAt,
      last_seen_at: record.createdAt,
    });
    return this.findSessionById(typeof id === 'object' ? id.id : id);
  }

  async findSessionById(id) {
    const row = await this.database('web_sessions').where({ id }).first();
    return mapSession(row);
  }

  async findSessionByHash(sessionHash) {
    const row = await this.database('web_sessions')
      .where({ session_hash: sessionHash })
      .first();
    return mapSession(row);
  }

  async touchSession(id, timestamp) {
    await this.database('web_sessions')
      .where({ id })
      .update({
        last_seen_at: timestamp,
        updated_at: this.database.fn.now(),
      });
  }

  async revokeSession(id, timestamp) {
    await this.database('web_sessions')
      .where({ id })
      .update({
        revoked_at: timestamp,
        updated_at: this.database.fn.now(),
      });
  }
}

function mapKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    guildId: row.guild_id,
    prefix: row.key_prefix,
    createdBy: row.created_by,
    permissionLevel: row.permission_level,
    permissions: fromJson(row.permissions_json, []),
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    webKeyId: row.web_key_id,
    guildId: row.guild_id,
    userId: row.user_id,
    permissionLevel: row.permission_level,
    permissions: fromJson(row.permissions_json, []),
    sessionHash: row.session_hash,
    csrfHash: row.csrf_hash,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}
