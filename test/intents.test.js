import test from 'node:test';
import assert from 'node:assert/strict';
import { GatewayIntentBits } from 'discord.js';
import { createGatewayIntents } from '../src/core/createRuntime.js';

test('privileged gateway intents are opt-in', () => {
  const defaults = createGatewayIntents({
    guildMembersIntent: false,
    messageContentIntent: false,
  });

  assert.equal(defaults.includes(GatewayIntentBits.GuildMembers), false);
  assert.equal(defaults.includes(GatewayIntentBits.MessageContent), false);
  assert.equal(defaults.includes(GatewayIntentBits.GuildVoiceStates), true);

  const enabled = createGatewayIntents({
    guildMembersIntent: true,
    messageContentIntent: true,
  });
  assert.equal(enabled.includes(GatewayIntentBits.GuildMembers), true);
  assert.equal(enabled.includes(GatewayIntentBits.MessageContent), true);
});
