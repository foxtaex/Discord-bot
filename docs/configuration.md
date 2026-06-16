# Installation und Konfiguration

## Discord-Anwendung

1. Im Discord Developer Portal eine Application und einen Bot erstellen.
2. Token in `DISCORD_TOKEN` eintragen.
3. Application ID als `DISCORD_CLIENT_ID` eintragen.
4. Unter **Bot > Privileged Gateway Intents** aktivieren:
   - Server Members Intent, wenn Willkommensnachrichten verwendet werden
   - Message Content Intent, wenn Transkripte vollstaendige Inhalte benoetigen
5. Die zugehoerigen `.env`-Schalter auf `true` setzen.
6. Den Bot mit `bot` und `applications.commands` einladen.

## Umgebungsvariablen

| Variable | Standard | Beschreibung |
| --- | --- | --- |
| `DISCORD_TOKEN` | erforderlich | Bot-Token |
| `DISCORD_CLIENT_ID` | erforderlich | Application ID |
| `DISCORD_GUILD_ID` | leer | Schnelle Guild-Command-Registrierung |
| `DISCORD_GUILD_MEMBERS_INTENT` | `false` | Privilegierten Mitglieder-Intent anfordern |
| `DISCORD_MESSAGE_CONTENT_INTENT` | `false` | Privilegierten Nachrichteninhalt-Intent anfordern |
| `DISCORD_AUTO_DEPLOY_COMMANDS` | `true` | Slash-Commands beim Start registrieren |
| `DB_CLIENT` | `sqlite` | `sqlite` oder `mysql2` |
| `DB_FILENAME` | `./data/bot.sqlite` | SQLite-Datei |
| `DB_HOST` | `127.0.0.1` | MySQL-/MariaDB-Host |
| `DB_PORT` | `3306` | Datenbankport |
| `DB_NAME` | `discord_bot` | Datenbankname |
| `DB_USER` | `discord_bot` | Datenbanknutzer |
| `DB_PASSWORD` | leer | Datenbankpasswort |
| `API_ENABLED` | `true` | REST-API aktivieren |
| `API_HOST` | `127.0.0.1` | Bind-Adresse |
| `API_PORT` | `6767` | API- und Webpanel-Port |
| `API_MASTER_KEY` | leer | Optionaler uneingeschraenkter Key |
| `API_CORS_ORIGINS` | leer | Kommagetrennte erlaubte Browser-Origins |
| `API_RATE_LIMIT` | `120` | Anfragen pro Minute und IP |
| `WEB_PANEL_PUBLIC_URL` | `http://127.0.0.1:6767/panel` | Link fuer `/webkey erstellen` |
| `WEB_PANEL_COOKIE_SECURE` | `false` | Sichere Cookies bei HTTPS |
| `LOG_LEVEL` | `info` | Pino-Level |
| `AUTO_MIGRATE` | `true` | Migrationen beim Start |
| `INSTANCE_ID` | automatisch | Stabile Instanz-ID |
| `INSTANCE_ROLE` | `primary` | `primary` oder `worker` |
| `CONFIG_FILE` | `./config/defaults.json` | Standardkonfiguration |

## Standardkonfiguration

Die Datei `config/defaults.json` ist die Quelle fuer alle Guilds. Leere IDs
deaktivieren keine Funktion automatisch; das jeweilige `enabled`-Feld ist
entscheidend. Aktivierte Systeme benoetigen gueltige Ziel-IDs.

Platzhalter im Willkommenstext:

- `{user}`: Discord-Erwaehnung
- `{username}`: Nutzername
- `{displayName}`: Server-Anzeigename
- `{server}`: Servername
- `{memberCount}`: aktuelle Mitgliederzahl

Platzhalter fuer `voiceSupport.roomName`:

- `{username}`
- `{displayName}`
- `{userId}`

Standardformat fuer private Voice-Raeume:

```text
・Support | username
```

Ticket-Kategorien enthalten:

```json
{
  "key": "billing",
  "label": "Abrechnung",
  "description": "Fragen zu Zahlungen",
  "emoji": "💳",
  "parentCategoryId": "OPTIONALE_KATEGORIE_ID",
  "supportRoleIds": ["ROLLEN_ID"]
}
```

Discord erlaubt maximal 25 Optionen pro Select-Menue. Der Bot verwendet daher
die ersten 25 konfigurierten Kategorien fuer das private Dropdown.

## Guild-spezifische Werte

`/bot-config set` speichert einfache Werte in der Datenbank.
Ticket-Kategorien werden mit `/ticket-category` oder ueber die REST-API
verwaltet.

Neue Kategorie erstellen:

```text
/ticket-category add key:billing name:Billing description:Fragen zu Zahlungen emoji:💳
```

Optional koennen beim Anlegen eine Discord-Kategorie und eine Support-Rolle
ausgewaehlt werden. Der Bot speichert mit `/ticket-panel` gesendete
Panel-Nachrichten und aktualisiert den Open-Ticket-Button nach `add`, `edit` und
`delete` automatisch. Das gilt auch fuer Aenderungen ueber die REST-API.

Panels, die bereits vor Einfuehrung dieser Funktion gesendet wurden, werden
beim naechsten Benutzen automatisch registriert. Alternativ kann einmalig ein
neues Panel mit `/ticket-panel` gesendet werden.

Das Spam-Limit wird mit `tickets.maxActivePerCategory` gesteuert und steht
standardmaessig auf `3`. Es kann mit `/bot-config set` geaendert werden.
Archivierte Tickets werden nicht mitgezaehlt.

Vorhandene Kategorien koennen ohne Loeschen bearbeitet werden:

```text
/ticket-category edit key:billing name:Zahlungen support-role:@Billing
```

Mit `clear-emoji`, `clear-discord-category` und `clear-support-role` lassen
sich optionale Werte wieder entfernen.

## Voice-Support-Kategorien

Mehrere Voice-Warteraeume werden mit `/voice-category` verwaltet. Jede
Kategorie kann einen eigenen Warteraum, Benachrichtigungskanal, Zielbereich,
eine Support-Rolle und ein Raum-Namensschema besitzen.

```text
/voice-category add key:technical name:Technischer-Support waiting-channel:#warte-tech notification-channel:#support-log discord-category:Voice-Support support-role:@Tech-Support
```

Bearbeiten, anzeigen und loeschen:

```text
/voice-category edit key:technical name:Tech-Support
/voice-category list
/voice-category delete key:technical
```

Globale Werte unter `voiceSupport` bleiben als Fallback aktiv. Globale und
kategoriespezifische Support-Rollen werden kombiniert. `voiceSupport.enabled`
muss auf `true` stehen, damit Warteraeume verarbeitet werden.

Konfigurationsrangfolge:

1. `config/defaults.json`
2. Guild-Patch aus `guild_configs`
3. Ticket-Kategorien aus `ticket_categories`
4. Voice-Support-Kategorien aus `voice_support_categories`

## Datenbankwechsel

SQLite:

```dotenv
DB_CLIENT=sqlite
DB_FILENAME=./data/bot.sqlite
```

MySQL oder MariaDB:

```dotenv
DB_CLIENT=mysql2
DB_HOST=db
DB_PORT=3306
DB_NAME=discord_bot
DB_USER=discord_bot
DB_PASSWORD=strong-password
```

Danach:

```bash
npm run db:migrate
```
