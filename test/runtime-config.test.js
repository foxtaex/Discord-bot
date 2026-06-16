import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDatabase, migrateDatabase } from '../src/database/index.js';
import { GuildConfigRepository } from '../src/repositories/GuildConfigRepository.js';
import { GuildConfigService } from '../src/services/GuildConfigService.js';

const logger = { info() {}, error() {} };

test('guild config keeps defaults when only partial overrides exist', async () => {
  const database = await createDatabase(
    { client: 'sqlite', filename: ':memory:' },
    logger,
  );
  try {
    await migrateDatabase(database, logger);
    const repository = new GuildConfigRepository(database);
    const defaults = JSON.parse(
      await readFile(new URL('../config/defaults.json', import.meta.url), 'utf8'),
    );
    await repository.upsert('guild', {
      welcome: { enabled: true, channelId: 'welcome' },
    });
    const service = new GuildConfigService(repository, defaults);
    const config = await service.get('guild');

    assert.equal(config.welcome.enabled, true);
    assert.equal(config.branding.name, 'Support Bot');
    assert.equal(config.tickets.enabled, true);
    assert.equal(config.voiceSupport.deleteRoomOnClose, true);
  } finally {
    await database.destroy();
  }
});
