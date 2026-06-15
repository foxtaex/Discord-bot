# Discord Support Platform

Ein modularer Discord-Bot auf Basis von Node.js und `discord.js` v14. Das
Projekt kombiniert Willkommensnachrichten, archivierende Tickets,
Voice-Support, eine API-Key-geschuetzte REST-API und eine austauschbare
SQLite-/MySQL-Datenhaltung.

## Funktionen

- Dynamische Willkommens-Embeds mit individuell erzeugtem PNG
- Ticket-Erstellung per Dropdown mit frei definierbaren Kategorien
- Zufällige sechsstellige Ticketnummern wie `ticket-583742-username`
- Private Ticket-Kanaele, Support-Rollen, Uebernahme und Aktionsprotokoll
- Archivierung statt automatischer Loeschung
- Wiedereroeffnung, endgueltige Loeschung und HTML-Transkripte
- Voice-Warteraum mit manuell uebernehmbaren Supportfaellen
- REST-API fuer Nachrichten, Embeds, Nutzer, Tickets, Logs und Konfiguration
- API-Keys mit Berechtigungen und optionaler Guild-Einschraenkung
- SQLite als Standard, MySQL/MariaDB fuer produktive und verteilte Setups
- Automatische Modul-Erkennung und klare Service-/Repository-Grenzen
- Pino-Logging, Zod-Validierung, Rate-Limiting und Helmet

## Schnellstart

Voraussetzungen:

- Node.js 20 oder neuer
- Ein Discord-Bot-Token und die Application ID
- Fuer Willkommensnachrichten optional: aktivierter **Server Members Intent**
- Fuer vollstaendige Transkripte optional: aktivierter **Message Content Intent**

```bash
npm install
copy .env.example .env
npm run db:migrate
npm run deploy:commands
npm start
```

Unter PowerShell kann `.env` auch so kopiert werden:

```powershell
Copy-Item .env.example .env
```

Mindestens diese Werte muessen in `.env` gesetzt werden:

```dotenv
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
```

Privilegierte Intents werden standardmaessig nicht angefordert. Fuer das
Willkommenssystem beziehungsweise vollstaendige Nachrichteninhalte muessen sie
zuerst im Discord Developer Portal unter **Bot > Privileged Gateway Intents**
aktiviert und danach in `.env` eingeschaltet werden:

```dotenv
DISCORD_GUILD_MEMBERS_INTENT=true
DISCORD_MESSAGE_CONTENT_INTENT=true
```

Ist ein `.env`-Schalter aktiv, aber der zugehoerige Portal-Schalter noch aus,
ueberspringt der Bot den nicht erlaubten Intent und bleibt online. Die
betroffene Funktion bleibt bis zur Portal-Aktivierung deaktiviert.

Fuer schnelle Command-Updates waehrend der Entwicklung sollte zusaetzlich
`DISCORD_GUILD_ID` gesetzt werden. Globale Discord-Commands koennen bis zu
einer Stunde fuer die Verteilung benoetigen.

Mit `DISCORD_AUTO_DEPLOY_COMMANDS=true` werden die Slash-Commands bei jedem
Bot-Start automatisch registriert. Der manuelle Befehl
`npm run deploy:commands` bleibt fuer Deployments ohne Bot-Start verfuegbar.

## Discord-Einladung

Der Bot benoetigt die Scopes `bot` und `applications.commands`. Empfohlene
Bot-Rechte:

- Kanaele ansehen und verwalten
- Nachrichten senden, verwalten und Verlauf lesen
- Dateien anhaengen und Links einbetten
- Mitglieder verschieben
- Voice-Kanaele verbinden und sprechen

Administratoren koennen die Rechte enger gestalten, solange der Bot in den
konfigurierten Kategorien und Kanaelen die genannten Aktionen ausfuehren darf.

## Erste Einrichtung

1. IDs fuer Kanaele, Rollen und Kategorien in Discords Entwicklermodus kopieren.
2. [`config/defaults.json`](config/defaults.json) anpassen.
3. Slash-Commands mit `npm run deploy:commands` registrieren.
4. Optional mit `/bot-config set` serverbezogene Werte ueberschreiben.
5. Mit `/ticket-panel` das Ticket-Dropdown senden.
6. Fuer externe Anwendungen einen API-Key erzeugen:

```bash
npm run api:key -- --name dashboard --permissions messages:write,users:read,tickets:read,tickets:write,logs:write --guilds SERVER_ID
```

Der ausgegebene Key wird nur einmal angezeigt. In der Datenbank liegt
ausschliesslich sein SHA-256-Hash.

## Befehle

| Command | Zweck |
| --- | --- |
| `/ping` | Gateway-Latenz pruefen |
| `/help` | Funktionsuebersicht |
| `/ticket-panel` | Ticket-Dropdown senden |
| `/ticket-category add` | Neue Ticket-Kategorie erstellen |
| `/ticket-category list` | Ticket-Kategorien anzeigen |
| `/ticket-category delete` | Ticket-Kategorie loeschen |
| `/ticket close` | Aktuelles Ticket archivieren |
| `/ticket reopen` | Archiviertes Ticket wieder oeffnen |
| `/ticket transcript` | HTML-Transkript erzeugen |
| `/ticket delete` | Ticket-Kanal endgueltig loeschen |
| `/voice-support status` | Aktiven Voice-Fall anzeigen |
| `/voice-support move` | Wartenden Nutzer manuell verschieben |
| `/voice-support close` | Voice-Fall schliessen |
| `/bot-config show` | Guild-Konfiguration zusammenfassen |
| `/bot-config set` | Ausgewaehlte Guild-Werte setzen |

## Dokumentation

- [Installation und Konfiguration](docs/configuration.md)
- [Architektur und Projektstruktur](docs/architecture.md)
- [REST-API](docs/api.md)
- [Datenbankaufbau](docs/database.md)
- [Module und Ablaeufe](docs/modules.md)
- [Entwicklerhandbuch](docs/development.md)
- [Deployment und Wartung](docs/deployment.md)
- [Praxisbeispiele](docs/examples.md)

## Qualitaet

```bash
npm run validate
```

Der Befehl fuehrt ESLint und die Tests mit dem integrierten Node-Test-Runner
aus. Laufzeitdaten, SQLite-Dateien und Transkripte liegen unter `data/` und
werden nicht versioniert.
