import test from 'node:test';
import assert from 'node:assert/strict';
import { deepMerge } from '../src/utils/object.js';
import {
  parseColor,
  renderTemplate,
  sanitizeChannelName,
  sanitizeVoiceChannelName,
} from '../src/utils/discord.js';
import { escapeHtml } from '../src/services/TranscriptService.js';

test('deepMerge combines nested configuration without losing defaults', () => {
  assert.deepEqual(
    deepMerge(
      { welcome: { enabled: false, channelId: '' }, roles: ['a'] },
      { welcome: { enabled: true } },
    ),
    {
      welcome: { enabled: true, channelId: '' },
      roles: ['a'],
    },
  );
});

test('Discord utility helpers normalize values', () => {
  assert.equal(sanitizeChannelName('Hilfe für Jörg!'), 'hilfe-fur-jorg');
  assert.equal(
    sanitizeVoiceChannelName('\u30fbSupport | John'),
    '\u30fbSupport | John',
  );
  assert.equal(parseColor('#5865F2'), 0x5865f2);
  assert.equal(
    renderTemplate('Hallo {user} auf {server}', {
      user: 'Ada',
      server: 'Dev',
    }),
    'Hallo Ada auf Dev',
  );
});

test('transcript output escapes untrusted message content', () => {
  assert.equal(
    escapeHtml('<script>alert("x")</script>'),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
  );
});
