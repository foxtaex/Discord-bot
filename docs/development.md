# Entwicklerhandbuch

## Neues Modul

Jedes Verzeichnis unter `src/modules` benoetigt eine `index.js` mit
`createModule(context)`. Der Loader erkennt das Modul beim naechsten Start.

```js
import { Events, MessageFlags, SlashCommandBuilder } from 'discord.js';

export async function createModule(context) {
  return {
    name: 'example',
    async register(registry) {
      registry.registerCommand({
        data: new SlashCommandBuilder()
          .setName('example')
          .setDescription('Beispielbefehl'),
        async execute(interaction) {
          await interaction.reply('OK');
        },
      });

      registry.registerEvent(Events.MessageCreate, async (message) => {
        context.logger.debug({ messageId: message.id }, 'Message received');
      });

      registry.registerButton('example:', async (interaction) => {
        await interaction.reply({
          content: 'Button',
          flags: MessageFlags.Ephemeral,
        });
      });
    },
  };
}
```

Fuer dynamische IDs wird ein eindeutiger Prefix registriert. Der
Interaction-Router nimmt den ersten passenden Prefix.

## Context

Wichtige Werte:

- `context.client`
- `context.config`
- `context.database`
- `context.logger`
- `context.configService`
- `context.permissionService`
- `context.auditService`
- `context.ticketRepository`
- `context.voiceCaseRepository`
- `context.services`

Ein Modul kann seinen Service unter `context.services.<name>` bereitstellen.
Dadurch kann die API dieselbe Logik verwenden.

## Neue Datenbankfunktion

1. Migration in `src/database/migrations` anlegen.
2. Zugriff in einem Repository kapseln.
3. Fachlogik in einem Service implementieren.
4. Discord- und API-Adapter nur zur Eingabevalidierung und Ausgabe verwenden.
5. SQLite und MySQL-spezifische SQL-Konstrukte vermeiden.

## Tests

Tests liegen unter `test/` und verwenden `node:test`.

```bash
npm test
npm run lint
npm run validate
```

Repository-Tests koennen SQLite mit `filename: ':memory:'` verwenden. Discord
sollte fuer Unit-Tests ueber kleine Fakes oder injizierte Services isoliert
werden.

## Codekonventionen

- ESM und moderne `async`-/`await`-Syntax
- Fachliche Fehler als Klassen aus `src/core/errors.js`
- Keine Discord-Antworten direkt aus Repositories
- Keine Datenbankabfragen direkt in Commands
- IDs als Strings behandeln
- Externe Texte und API-Daten validieren
- Neue Aktionen ueber `AuditService` und bei Tickets zusaetzlich ueber
  `ticket_actions` protokollieren

## Neue API-Route

1. Request-Body mit Zod definieren.
2. Route in `ApiServer.registerRoutes()` hinzufuegen.
3. Eine minimale Permission mit `requirePermission()` erzwingen.
4. Guild-ID immer gegen `allowedGuildIds` pruefen lassen.
5. Vorhandenen Service verwenden.
6. `docs/api.md` und `src/api/openapi.js` aktualisieren.
