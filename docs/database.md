# Datenbankaufbau

Knex verwaltet dasselbe logische Schema fuer SQLite und MySQL/MariaDB.
Migrationen liegen in `src/database/migrations`.

## Tabellen

### `guild_configs`

Speichert einen JSON-Patch pro Guild. Die Standardwerte bleiben in
`config/defaults.json`.

### `ticket_categories`

Guild-spezifische Select-Menue-Kategorien mit Label, Beschreibung, Emoji,
Elternkategorie, Support-Rollen und Sortierung.

### `ticket_panels`

Registry aller mit `/ticket-panel` gesendeten Nachrichten. Kanal- und
Nachrichten-ID ermoeglichen automatische Panel-Aktualisierungen nach
Kategorieaenderungen. Nicht mehr vorhandene Nachrichten werden beim naechsten
Update aus der Registry entfernt.

### `voice_support_categories`

Guild-spezifische Voice-Support-Konfigurationen mit Key, Anzeigename,
Warteraum, Zielkategorie, Benachrichtigungskanal, Support-Rollen,
Raum-Namensschema und Sortierung. Warteraeume sind innerhalb eines Servers
eindeutig.

### `tickets`

Zentrale Ticket-Historie:

- numerische `id` fuer kurze Discord-Custom-IDs
- stabile `public_id` fuer externe Anwendungen
- zufaellige sechsstellige `ticket_number` fuer sichtbare Ticket-Referenzen
- Guild, Nutzer, Kanal und Kategorie
- Status `creating`, `open`, `claimed`, `archived`, `reopening`, `failed`,
  `deleted`
- Bearbeiter sowie Schliess- und Loeschzeitpunkte
- lokaler Transkriptpfad
- `active_key` mit nummeriertem Slot als Limit pro Guild, Nutzer und Kategorie

Standardmaessig stehen pro Nutzer und Kategorie drei aktive Slots zur
Verfuegung. Beim Archivieren wird `active_key` auf `NULL` gesetzt. So kann ein
Nutzer sofort ein neues Ticket erstellen, waehrend die alte Historie erhalten
bleibt.

Die interne `id` bleibt fuer Fremdschluessel und unsichtbare
Discord-Custom-IDs reserviert. Kanalnamen, Embeds, Logs und Transkripte nutzen
die zufaellige `ticket_number`, zum Beispiel `ticket-583742-username`.

### `ticket_actions`

Unveraenderliche Aktionshistorie je Ticket, zum Beispiel Erstellung,
Uebernahme, Archivierung, Wiedereroeffnung, Transkript oder Loeschung.

### `voice_cases`

Voice-Supportfaelle mit Kategorie-Key, Warteraum, privatem Raum,
Benachrichtigungskanal, Bearbeiter, temporaerem Invite-Code und Zeitpunkten.
`active_key` verhindert doppelte aktive Faelle je Guild und Nutzer.
`claimed_by` und `claimed_at` bleiben nach Abschluss fuer die Support-Historie
erhalten.

### `api_keys`

Name, kurzer Prefix, SHA-256-Hash, Berechtigungen, Guild-Einschraenkungen,
Widerrufsstatus und letzter Zugriff. Der Klartext-Key wird nie gespeichert.

### `application_logs`

Persistente fachliche Logs mit Level, Quelle, Nachricht und JSON-Kontext.

### `bot_instances`

Instanz-ID, Rolle, Hostname, Metadaten, Startzeit und letzter Heartbeat.

### `factions` und `faction_members`

Fraktionsstammdaten sowie separate Mitgliedseintraege mit Position und
Notizen. Fraktionen besitzen eine stabile `public_id`.

### `web_access_keys`

Temporaere Einmal-Keys mit Prefix, SHA-256-Hash, Ersteller,
Berechtigungsstufe, Ablauf, Verbrauchs- und Widerrufszeitpunkt.

### `web_sessions`

Gehashte Webpanel-Sitzungen und CSRF-Hashes. Sitzungen sind an Guild, Nutzer,
Key und Ablaufzeit gebunden und koennen zentral widerrufen werden.

### `webpanel_settings`

Reserviert guild-spezifische Webpanel-Einstellungen fuer weitere
Darstellungs- und Zugriffsoptionen.

### `user_permissions`

Vorbereitete persistente Benutzerrechte fuer spaetere direkte Web-Logins.
Aktuell werden effektive Rechte ueber den temporaeren Key und die Sitzung
gespeichert.

## Migrationen

```bash
npm run db:migrate
```

Neue Migrationen werden nummeriert, exportieren `up(knex)` und `down(knex)` und
muessen sowohl unter SQLite als auch MySQL getestet werden.

## Backups

SQLite sollte bei laufendem Bot ueber das SQLite-Backup-Verfahren oder nach
einem kontrollierten Stop kopiert werden. Wegen WAL-Modus duerfen
`bot.sqlite-wal` und `bot.sqlite-shm` nicht blind ignoriert werden.

MySQL/MariaDB:

```bash
mysqldump --single-transaction discord_bot > discord_bot.sql
```

Transkripte unter `data/transcripts` sind separate Dateien und muessen
zusaetzlich gesichert werden.
