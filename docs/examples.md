# Praxisbeispiele

## Ticket-Panel senden

In Discord:

```text
/ticket-panel kanal:#support
```

## Guild-Konfiguration aendern

```text
/bot-config set schluessel:welcome.enabled wert:true
/bot-config set schluessel:welcome.channelId wert:123456789012345678
/bot-config set schluessel:tickets.archiveCategoryId wert:123456789012345679
```

## Kategorien per API setzen

```js
const response = await fetch(
  'http://127.0.0.1:6767/api/v1/guilds/GUILD_ID/ticket-categories',
  {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${process.env.BOT_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify([
      {
        key: 'technical',
        label: 'Technischer Support',
        description: 'Fehler und technische Fragen',
        emoji: '🛠️',
        parentCategoryId: 'CATEGORY_ID',
        supportRoleIds: ['ROLE_ID'],
      },
    ]),
  },
);

if (!response.ok) throw new Error(await response.text());
```

## Embed aus externer JavaScript-Anwendung

```js
await fetch(
  'http://127.0.0.1:6767/api/v1/guilds/GUILD_ID/messages',
  {
    method: 'POST',
    headers: {
      'x-api-key': process.env.BOT_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      channelId: 'CHANNEL_ID',
      embeds: [
        {
          title: 'Systemstatus',
          description: 'Alle Dienste sind erreichbar.',
          color: 0x57f287,
          fields: [
            { name: 'API', value: 'Online', inline: true },
            { name: 'Worker', value: 'Online', inline: true },
          ],
        },
      ],
    }),
  },
);
```

## Ticket-Lebenszyklus per API

```js
const created = await api('/tickets', {
  method: 'POST',
  body: JSON.stringify({
    userId: 'USER_ID',
    categoryKey: 'technical',
  }),
});

await api(`/tickets/${created.publicId}/close`, { method: 'POST' });
await api(`/tickets/${created.publicId}/reopen`, { method: 'POST' });

async function api(path, options = {}) {
  const response = await fetch(
    `http://127.0.0.1:6767/api/v1/guilds/GUILD_ID${path}`,
    {
      ...options,
      headers: {
        authorization: `Bearer ${process.env.BOT_API_KEY}`,
        'content-type': 'application/json',
        ...options.headers,
      },
    },
  );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message);
  return body;
}
```

## Externes Log schreiben

```bash
curl -X POST http://127.0.0.1:6767/api/v1/guilds/GUILD_ID/logs \
  -H "X-API-Key: API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "level": "info",
    "source": "shop",
    "message": "Bestellung abgeschlossen",
    "context": {"orderId": "A-1042"},
    "discord": true
  }'
```
