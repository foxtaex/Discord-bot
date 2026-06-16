import test from 'node:test';
import assert from 'node:assert/strict';
import { TicketService } from '../src/services/TicketService.js';

function createConfig(categories) {
  return {
    branding: {
      color: '#5865F2',
      footer: 'Support',
    },
    tickets: {
      enabled: true,
      categories,
      panel: {
        title: 'Tickets',
        description: 'Choose a category.',
        placeholder: 'Choose',
      },
    },
  };
}

test('registered ticket panels are updated after category changes', async () => {
  const edits = [];
  const service = new TicketService({
    client: {
      guilds: {
        fetch: async () => ({
          channels: {
            fetch: async () => ({
              isTextBased: () => true,
              messages: {
                fetch: async () => ({
                  edit: async (payload) => edits.push(payload),
                }),
              },
            }),
          },
        }),
      },
    },
    configService: {
      get: async () =>
        createConfig([
          {
            key: 'billing',
            label: 'Billing',
            description: 'Payment questions',
            emoji: '',
          },
        ]),
    },
    ticketPanelRepository: {
      listByGuild: async () => [
        {
          guildId: 'guild',
          channelId: 'channel',
          messageId: 'message',
        },
      ],
      removeByMessage: async () => {},
    },
    logger: { warn() {} },
  });

  const result = await service.refreshPanels('guild');
  assert.deepEqual(result, {
    total: 1,
    updated: 1,
    removed: 0,
    failed: 0,
  });
  const button = edits[0].components[0].components[0].toJSON();
  assert.equal(button.label, 'Open Ticket');
  assert.equal(button.custom_id, 'ticket-open');
});

test('ticket panels stay valid when the last category is removed', () => {
  const service = new TicketService({});
  const payload = service.createPanelPayload(createConfig([]));

  const button = payload.components[0].components[0].toJSON();
  assert.equal(button.disabled, true);
  assert.match(
    payload.embeds[0].data.description,
    /keine Ticket-Kategorien/,
  );
});

test('ticket categories are rendered as a temporary dropdown', async () => {
  const service = new TicketService({
    configService: {
      get: async () =>
        createConfig([
          {
            key: 'general',
            label: 'General Support',
            description: 'General questions',
            emoji: '',
          },
          {
            key: 'billing',
            label: 'Billing',
            description: 'Payment questions',
            emoji: '',
          },
        ]),
    },
  });

  const payload = await service.createCategorySelectionPayload('guild');
  const select = payload.components[0].components[0].toJSON();
  assert.deepEqual(
    select.options.map((option) => option.value),
    ['general', 'billing'],
  );
  assert.equal(select.custom_id, 'ticket:create');
});
