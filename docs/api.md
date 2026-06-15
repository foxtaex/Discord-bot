# REST-API

Basis-URL: `http://127.0.0.1:3000/api`

Der aktuelle OpenAPI-Ueberblick steht ohne Authentifizierung unter
`GET /api/openapi.json`. Der Health-Check ist `GET /api/health`.

## Authentifizierung

Ein API-Key wird als Bearer-Token oder `X-API-Key` gesendet:

```http
Authorization: Bearer dbot_prefix_secret
```

```http
X-API-Key: dbot_prefix_secret
```

Key erzeugen:

```bash
npm run api:key -- --name webapp --permissions messages:write,users:read,tickets:read,tickets:write,tickets:delete,logs:write,config:read,config:write --guilds 123456789
```

Verfuegbare Berechtigungen:

| Permission | Zugriff |
| --- | --- |
| `messages:write` | Nachrichten und Embeds senden |
| `users:read` | Guild-Mitglieder lesen |
| `tickets:read` | Tickets und Transkripte lesen |
| `tickets:write` | Tickets erstellen, archivieren, wieder oeffnen |
| `tickets:delete` | Ticket-Kanaele endgueltig loeschen |
| `logs:write` | Anwendungslogs schreiben |
| `config:read` | Guild-Konfiguration lesen |
| `config:write` | Guild-Konfiguration und Kategorien aendern |
| `*` | alle Aktionen |

`--guilds` ist optional. Ohne Guild-Liste gilt der Key fuer jede Guild, auf die
der Bot Zugriff hat.

## Endpunkte

| Methode | Pfad | Permission |
| --- | --- | --- |
| `GET` | `/health` | keine |
| `GET` | `/openapi.json` | keine |
| `GET` | `/v1/guilds/:guildId/config` | `config:read` |
| `PATCH` | `/v1/guilds/:guildId/config` | `config:write` |
| `PUT` | `/v1/guilds/:guildId/ticket-categories` | `config:write` |
| `POST` | `/v1/guilds/:guildId/messages` | `messages:write` |
| `GET` | `/v1/guilds/:guildId/users/:userId` | `users:read` |
| `GET` | `/v1/guilds/:guildId/tickets` | `tickets:read` |
| `POST` | `/v1/guilds/:guildId/tickets` | `tickets:write` |
| `GET` | `/v1/guilds/:guildId/tickets/:id` | `tickets:read` |
| `POST` | `/v1/guilds/:guildId/tickets/:id/close` | `tickets:write` |
| `POST` | `/v1/guilds/:guildId/tickets/:id/reopen` | `tickets:write` |
| `POST` | `/v1/guilds/:guildId/tickets/:id/transcript` | `tickets:read` |
| `DELETE` | `/v1/guilds/:guildId/tickets/:id` | `tickets:delete` |
| `POST` | `/v1/guilds/:guildId/logs` | `logs:write` |

Ticket-IDs duerfen die sichtbare sechsstellige `ticketNumber`, die UUID
`publicId` oder fuer Abwaertskompatibilitaet die interne numerische ID sein.

## Nachricht und Embed

```bash
curl -X POST http://127.0.0.1:3000/api/v1/guilds/GUILD_ID/messages \
  -H "Authorization: Bearer API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "CHANNEL_ID",
    "content": "Status aktualisiert",
    "embeds": [{
      "title": "Deployment",
      "description": "Version 1.4 ist online.",
      "color": 5793266
    }]
  }'
```

Erwaehnungen werden bei API-Nachrichten standardmaessig nicht ausgewertet.

## Ticket erstellen

```json
POST /api/v1/guilds/GUILD_ID/tickets
{
  "userId": "USER_ID",
  "categoryKey": "technical"
}
```

## Tickets filtern

```http
GET /api/v1/guilds/GUILD_ID/tickets?status=archived&userId=USER_ID&limit=50
```

## Fehlerformat

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": []
  }
}
```

Statuscodes: `400` fuer Validierung, `401` fuer fehlende Authentifizierung,
`403` fuer fehlende Rechte, `404` fuer unbekannte Ressourcen und `500` fuer
unerwartete Serverfehler.
