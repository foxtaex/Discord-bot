import {
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { UserError } from '../core/errors.js';
import { hashKey } from './ApiKeyService.js';

const LEVEL_PERMISSIONS = {
  viewer: ['panel:read', 'factions:read', 'logs:read'],
  editor: [
    'panel:read',
    'config:write',
    'factions:read',
    'factions:write',
    'logs:read',
  ],
  admin: ['*'],
};

export class WebAccessService {
  constructor({ webAccessRepository, auditService }) {
    this.webAccessRepository = webAccessRepository;
    this.auditService = auditService;
  }

  async create({
    guildId,
    createdBy,
    permissionLevel = 'editor',
    durationHours = 2,
  }) {
    if (!LEVEL_PERMISSIONS[permissionLevel]) {
      throw new UserError('Ungueltige Berechtigungsstufe.');
    }
    const hours = Math.min(Math.max(Number(durationHours) || 2, 1), 24);
    const prefix = randomBytes(5).toString('hex');
    const secret = randomBytes(32).toString('base64url');
    const accessKey = `web_${prefix}_${secret}`;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    const stored = await this.webAccessRepository.createKey({
      guildId,
      prefix,
      keyHash: hashKey(accessKey),
      createdBy,
      permissionLevel,
      permissions: LEVEL_PERMISSIONS[permissionLevel],
      expiresAt,
    });
    await this.auditService.write({
      guildId,
      source: 'web-access',
      message: `Temporaerer Webkey #${stored.id} wurde erstellt.`,
      context: { actorId: createdBy, permissionLevel, expiresAt },
    });
    return { ...stored, accessKey };
  }

  async exchange(accessKey) {
    if (!accessKey) throw new UserError('Zugriffsschluessel fehlt.');
    const keyHash = hashKey(accessKey);
    const key = await this.webAccessRepository.findKeyByHash(keyHash);
    const now = new Date();
    if (
      !key ||
      key.usedAt ||
      key.revokedAt ||
      new Date(key.expiresAt) <= now
    ) {
      throw new UserError(
        'Der Zugriffsschluessel ist ungueltig, verbraucht oder abgelaufen.',
        'UNAUTHORIZED',
        401,
      );
    }

    const consumed = await this.webAccessRepository.consumeKey(key.id, now);
    if (consumed !== 1) {
      throw new UserError(
        'Der Zugriffsschluessel wurde bereits verwendet.',
        'UNAUTHORIZED',
        401,
      );
    }

    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    const session = await this.webAccessRepository.createSession({
      webKeyId: key.id,
      guildId: key.guildId,
      userId: key.createdBy,
      permissionLevel: key.permissionLevel,
      permissions: key.permissions,
      sessionHash: hashKey(sessionToken),
      csrfHash: hashKey(csrfToken),
      expiresAt: key.expiresAt,
      createdAt: now,
    });
    await this.auditService.write({
      guildId: key.guildId,
      source: 'web-access',
      message: `Webkey #${key.id} wurde gegen eine Sitzung eingetauscht.`,
      context: { actorId: key.createdBy, sessionId: session.id },
    });
    return { session, sessionToken, csrfToken };
  }

  async authenticateSession(sessionToken) {
    if (!sessionToken) return null;
    const session = await this.webAccessRepository.findSessionByHash(
      hashKey(sessionToken),
    );
    if (
      !session ||
      session.revokedAt ||
      new Date(session.expiresAt) <= new Date()
    ) {
      return null;
    }
    await this.webAccessRepository.touchSession(session.id, new Date());
    return session;
  }

  verifyCsrf(session, csrfToken) {
    return Boolean(
      csrfToken && safeEqual(session.csrfHash, hashKey(csrfToken)),
    );
  }

  async list(guildId) {
    const keys = await this.webAccessRepository.listKeys(guildId);
    return keys.map(withKeyStatus);
  }

  async revoke(guildId, id, actorId) {
    const key = await this.webAccessRepository.findKeyById(Number(id));
    if (!key || key.guildId !== guildId) {
      throw new UserError('Webkey nicht gefunden.', 'NOT_FOUND', 404);
    }
    const updated = await this.webAccessRepository.revokeKey(
      key.id,
      new Date(),
    );
    await this.auditService.write({
      guildId,
      source: 'web-access',
      message: `Webkey #${key.id} wurde widerrufen.`,
      context: { actorId },
    });
    return withKeyStatus(updated);
  }

  hasPermission(session, permission) {
    return (
      session.permissions.includes('*') ||
      session.permissions.includes(permission)
    );
  }
}

export function withKeyStatus(key) {
  const expiresAt = new Date(key.expiresAt);
  const remainingMs = Math.max(0, expiresAt.getTime() - Date.now());
  const status = key.revokedAt
    ? 'revoked'
    : key.usedAt
      ? 'used'
      : remainingMs === 0
        ? 'expired'
        : 'active';
  return {
    ...key,
    shortKey: `web_${key.prefix}_...`,
    status,
    remainingMs,
  };
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
