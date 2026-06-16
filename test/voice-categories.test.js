import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceCategoryService } from '../src/services/VoiceCategoryService.js';

test('voice categories can be added, edited and removed', async () => {
  let categories = [];
  const configService = {
    async get() {
      return { voiceSupport: { categories } };
    },
    async replaceVoiceCategories(_guildId, nextCategories) {
      categories = nextCategories;
    },
  };
  const service = new VoiceCategoryService(configService);

  const created = await service.add('guild', {
    key: 'technical',
    label: 'Technical Support',
    waitingChannelId: 'waiting-1',
    notificationChannelId: 'notifications-1',
  });
  assert.equal(created.waitingChannelId, 'waiting-1');

  const edited = await service.update('guild', 'technical', {
    label: 'Tech Support',
    supportRoleIds: ['role-1'],
  });
  assert.equal(edited.label, 'Tech Support');
  assert.deepEqual(edited.supportRoleIds, ['role-1']);

  await service.remove('guild', 'technical');
  assert.deepEqual(await service.list('guild'), []);
});

test('voice categories reject duplicate waiting channels', async () => {
  let categories = [];
  const configService = {
    async get() {
      return { voiceSupport: { categories } };
    },
    async replaceVoiceCategories(_guildId, nextCategories) {
      categories = nextCategories;
    },
  };
  const service = new VoiceCategoryService(configService);
  await service.add('guild', {
    key: 'general',
    label: 'General',
    waitingChannelId: 'waiting',
  });

  await assert.rejects(
    service.add('guild', {
      key: 'billing',
      label: 'Billing',
      waitingChannelId: 'waiting',
    }),
    /bereits/,
  );
});
