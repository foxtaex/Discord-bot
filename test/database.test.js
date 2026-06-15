import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDatabase, migrateDatabase } from '../src/database/index.js';
import { ApiKeyService } from '../src/services/ApiKeyService.js';
import { GuildConfigRepository } from '../src/repositories/GuildConfigRepository.js';
import { GuildConfigService } from '../src/services/GuildConfigService.js';
import { TicketRepository } from '../src/repositories/TicketRepository.js';

const logger = {
  info() {},
  error() {},
};

test('SQLite repositories persist config, API keys and ticket history', async () => {
  const database = await createDatabase(
    {
      client: 'sqlite',
      filename: ':memory:',
    },
    logger,
  );

  try {
    await migrateDatabase(database, logger);
    const configRepository = new GuildConfigRepository(database);
    const defaults = JSON.parse(
      await readFile(new URL('../config/defaults.json', import.meta.url), 'utf8'),
    );
    const configService = new GuildConfigService(configRepository, defaults);
    await configService.update('guild-1', {
      welcome: { enabled: true },
    });
    const guildConfig = await configService.get('guild-1');
    assert.equal(guildConfig.welcome.enabled, true);
    assert.equal(guildConfig.welcome.channelId, '');
    assert.equal(guildConfig.welcome.color, '#57F287');

    const apiKeys = new ApiKeyService(database);
    const created = await apiKeys.create({
      name: 'test',
      permissions: ['tickets:read'],
      allowedGuildIds: ['guild-1'],
    });
    const principal = await apiKeys.authenticate(created.apiKey);
    assert.equal(principal.name, 'test');
    assert.deepEqual(principal.permissions, ['tickets:read']);
    assert.equal(await apiKeys.authenticate('invalid'), null);

    const tickets = new TicketRepository(database);
    const ticket = await tickets.create({
      guildId: 'guild-1',
      userId: 'user-1',
      categoryKey: 'general',
    });
    assert.match(ticket.ticketNumber, /^\d{6}$/);
    assert.equal(
      (await tickets.findByTicketNumber(ticket.ticketNumber)).id,
      ticket.id,
    );
    await tickets.update(ticket.id, {
      status: 'archived',
      active_key: null,
    });
    await tickets.addAction(ticket.id, 'archived', 'supporter-1');
    assert.equal((await tickets.findById(ticket.id)).status, 'archived');
    assert.equal((await tickets.listActions(ticket.id))[0].action, 'archived');
  } finally {
    await database.destroy();
  }
});
