import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCategoryKey } from '../src/modules/configuration/index.js';
import { TicketCategoryService } from '../src/services/TicketCategoryService.js';

test('ticket category keys are normalized and validated', () => {
  assert.equal(normalizeCategoryKey(' Billing Help '), 'billing-help');
  assert.throws(() => normalizeCategoryKey('Ungueltig!'));
});

test('ticket categories can be added, edited and removed', async () => {
  let categories = [];
  const configService = {
    async get() {
      return { tickets: { categories } };
    },
    async replaceCategories(_guildId, nextCategories) {
      categories = nextCategories;
    },
  };
  const service = new TicketCategoryService(configService);

  const created = await service.add('guild', {
    key: 'billing',
    label: 'Billing',
    description: 'Payment questions',
  });
  assert.equal(created.key, 'billing');
  assert.equal((await service.list('guild')).length, 1);

  const edited = await service.update('guild', 'billing', {
    label: 'Payments',
    supportRoleIds: ['role-1'],
  });
  assert.equal(edited.label, 'Payments');
  assert.deepEqual(edited.supportRoleIds, ['role-1']);

  await service.remove('guild', 'billing');
  assert.equal((await service.list('guild')).length, 0);
});
