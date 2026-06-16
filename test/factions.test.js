import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, migrateDatabase } from '../src/database/index.js';
import { FactionRepository } from '../src/repositories/FactionRepository.js';
import { FactionService } from '../src/services/FactionService.js';

const logger = { info() {}, error() {} };
const auditService = { async write() {} };

test('factions and members are persisted and editable', async () => {
  const database = await createDatabase(
    { client: 'sqlite', filename: ':memory:' },
    logger,
  );
  try {
    await migrateDatabase(database, logger);
    const repository = new FactionRepository(database);
    const service = new FactionService({ factionRepository: repository, auditService });

    const created = await service.create(
      'guild',
      {
        name: 'Police',
        type: 'state',
        status: 'active',
        leaderId: 'leader',
      },
      'admin',
    );
    assert.equal(created.type, 'state');

    const withMember = await service.addMember(
      'guild',
      created.publicId,
      {
        userId: 'member',
        displayName: 'John',
        position: 'Officer',
      },
      'admin',
    );
    assert.equal(withMember.members[0].position, 'Officer');

    const updated = await service.update(
      'guild',
      created.publicId,
      { status: 'recruiting', deputyId: 'deputy' },
      'admin',
    );
    assert.equal(updated.status, 'recruiting');
    assert.equal(updated.deputyId, 'deputy');

    const listed = await service.list('guild');
    assert.equal(listed.length, 1);
    await service.remove('guild', created.publicId, 'admin');
    assert.deepEqual(await service.list('guild'), []);
  } finally {
    await database.destroy();
  }
});
