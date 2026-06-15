import test from 'node:test';
import assert from 'node:assert/strict';
import { TicketService } from '../src/services/TicketService.js';

test('ticket claim stores the supporter', async () => {
  const updates = [];
  const service = new TicketService({
    client: {},
    configService: {
      get: async () => ({
        tickets: { supportRoleIds: [], categories: [] },
      }),
    },
    ticketRepository: {
      update: async (_id, changes) => {
        updates.push(changes);
        return { id: 1, ...changes };
      },
      addAction: async () => {},
    },
    transcriptService: {},
    permissionService: { canTicketSupport: () => true },
    auditService: { write: async () => {} },
    logger: {},
  });

  const claimed = await service.claim(
    {
      id: 1,
      guildId: 'guild',
      ticketNumber: '123456',
      status: 'open',
      claimedBy: null,
      categoryKey: 'general',
    },
    { id: 'supporter' },
  );

  assert.equal(claimed.claimed_by, 'supporter');
  assert.equal(updates[0].status, 'claimed');
});

test('ticket cannot be overwritten by another supporter', async () => {
  const service = new TicketService({
    client: {},
    configService: {
      get: async () => ({
        tickets: { supportRoleIds: [], categories: [] },
      }),
    },
    ticketRepository: {},
    transcriptService: {},
    permissionService: { canTicketSupport: () => true },
    auditService: {},
    logger: {},
  });

  await assert.rejects(
    service.claim(
      {
        id: 1,
        guildId: 'guild',
        ticketNumber: '123456',
        status: 'claimed',
        claimedBy: 'first-supporter',
        categoryKey: 'general',
      },
      { id: 'second-supporter' },
    ),
    /bereits von/,
  );
});
