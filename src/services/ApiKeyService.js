import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { fromJson, toJson } from '../database/json.js';

export class ApiKeyService {
  constructor(database, masterKey = '') {
    this.database = database;
    this.masterKey = masterKey;
  }

  async create({ name, permissions = [], allowedGuildIds = [] }) {
    const secret = randomBytes(32).toString('base64url');
    const prefix = randomBytes(5).toString('hex');
    const apiKey = `dbot_${prefix}_${secret}`;
    const [id] = await this.database('api_keys').insert({
      name,
      key_prefix: prefix,
      key_hash: hashKey(apiKey),
      permissions_json: toJson(permissions),
      allowed_guild_ids: toJson(allowedGuildIds),
      revoked: false,
    });

    return {
      id: typeof id === 'object' ? id.id : id,
      apiKey,
      prefix,
      name,
      permissions,
      allowedGuildIds,
    };
  }

  async authenticate(apiKey) {
    if (!apiKey) return null;
    if (this.masterKey && safeEqual(apiKey, this.masterKey)) {
      return {
        id: 'master',
        name: 'master',
        permissions: ['*'],
        allowedGuildIds: [],
      };
    }

    const keyHash = hashKey(apiKey);
    const row = await this.database('api_keys')
      .where({ key_hash: keyHash, revoked: false })
      .first();
    if (!row || !safeEqual(row.key_hash, keyHash)) return null;

    await this.database('api_keys')
      .where({ id: row.id })
      .update({ last_used_at: this.database.fn.now() });

    return {
      id: row.id,
      name: row.name,
      permissions: fromJson(row.permissions_json, []),
      allowedGuildIds: fromJson(row.allowed_guild_ids, []),
    };
  }

  async list() {
    const rows = await this.database('api_keys').orderBy('id', 'desc');
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      prefix: row.key_prefix,
      shortKey: `dbot_${row.key_prefix}_...`,
      permissions: fromJson(row.permissions_json, []),
      allowedGuildIds: fromJson(row.allowed_guild_ids, []),
      revoked: Boolean(row.revoked),
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
    }));
  }

  async revoke(id) {
    await this.database('api_keys')
      .where({ id })
      .update({
        revoked: true,
        updated_at: this.database.fn.now(),
      });
    return this.database('api_keys').where({ id }).first();
  }

  async find(id) {
    const row = await this.database('api_keys').where({ id }).first();
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      prefix: row.key_prefix,
      permissions: fromJson(row.permissions_json, []),
      allowedGuildIds: fromJson(row.allowed_guild_ids, []),
      revoked: Boolean(row.revoked),
    };
  }
}

export function hashKey(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
