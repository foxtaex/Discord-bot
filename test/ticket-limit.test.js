import test from 'node:test';
import assert from 'node:assert/strict';
import { TicketService } from '../src/services/TicketService.js';

test('ticket creation is blocked at the category active limit', async () => {
  let createCalled = false;
  const service = new TicketService({
    configService: {
      get: async () => ({
        tickets: {
          enabled: true,
          maxActivePerCategory: 3,
          categories: [
            {
              key: 'general',
              label: 'General',
              description: 'General help',
              supportRoleIds: [],
            },
          ],
        },
      }),
    },
    ticketRepository: {
      countActive: async () => 3,
      create: async () => {
        createCalled = true;
      },
    },
  });

  await assert.rejects(
    service.createTicket(
      { id: 'guild' },
      { id: 'user' },
      'general',
    ),
    /3 aktive Tickets/,
  );
  assert.equal(createCalled, false);
});
