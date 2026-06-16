import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, migrateDatabase } from '../src/database/index.js';
import { WebAccessRepository } from '../src/repositories/WebAccessRepository.js';
import { WebAccessService } from '../src/services/WebAccessService.js';

const logger = { info() {}, error() {} };
const auditService = { async write() {} };

test('temporary web keys are single-use and create hashed sessions', async () => {
  const database = await createDatabase(
    { client: 'sqlite', filename: ':memory:' },
    logger,
  );
  try {
    await migrateDatabase(database, logger);
    const repository = new WebAccessRepository(database);
    const service = new WebAccessService({
      webAccessRepository: repository,
      auditService,
    });

    const created = await service.create({
      guildId: 'guild',
      createdBy: 'admin',
      permissionLevel: 'editor',
      durationHours: 2,
    });
    assert.match(created.accessKey, /^web_[a-f0-9]{10}_/);
    const row = await database('web_access_keys').where({ id: created.id }).first();
    assert.notEqual(row.key_hash, created.accessKey);

    const exchanged = await service.exchange(created.accessKey);
    assert.equal(exchanged.session.guildId, 'guild');
    assert.equal(
      service.verifyCsrf(exchanged.session, exchanged.csrfToken),
      true,
    );
    assert.equal(
      (await service.authenticateSession(exchanged.sessionToken)).userId,
      'admin',
    );
    await assert.rejects(
      service.exchange(created.accessKey),
      /verbraucht|verwendet/,
    );
  } finally {
    await database.destroy();
  }
});

test('revoking a web key also revokes its active session', async () => {
  const database = await createDatabase(
    { client: 'sqlite', filename: ':memory:' },
    logger,
  );
  try {
    await migrateDatabase(database, logger);
    const repository = new WebAccessRepository(database);
    const service = new WebAccessService({
      webAccessRepository: repository,
      auditService,
    });
    const created = await service.create({
      guildId: 'guild',
      createdBy: 'admin',
      permissionLevel: 'admin',
    });
    const exchanged = await service.exchange(created.accessKey);
    await service.revoke('guild', created.id, 'admin');
    assert.equal(
      await service.authenticateSession(exchanged.sessionToken),
      null,
    );
  } finally {
    await database.destroy();
  }
});
