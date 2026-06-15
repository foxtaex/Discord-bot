import test from 'node:test';
import assert from 'node:assert/strict';
import { ApplicationFlagsBitField } from 'discord.js';

test('Discord application intent flags expose privileged intent availability', () => {
  const disabled = new ApplicationFlagsBitField(0);
  assert.equal(disabled.has('GatewayGuildMembers'), false);
  assert.equal(disabled.has('GatewayMessageContent'), false);

  const enabled = new ApplicationFlagsBitField([
    'GatewayGuildMembers',
    'GatewayMessageContent',
  ]);
  assert.equal(enabled.has('GatewayGuildMembers'), true);
  assert.equal(enabled.has('GatewayMessageContent'), true);
});
