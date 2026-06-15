import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandDeploymentService } from '../src/services/CommandDeploymentService.js';

test('command deployment selects guild or global scope', () => {
  const logger = { info() {} };
  const guildService = new CommandDeploymentService({
    token: 'token',
    clientId: 'client',
    guildId: 'guild',
    logger,
  });
  const globalService = new CommandDeploymentService({
    token: 'token',
    clientId: 'client',
    guildId: null,
    logger,
  });

  assert.equal(guildService.guildId, 'guild');
  assert.equal(globalService.guildId, null);
});
