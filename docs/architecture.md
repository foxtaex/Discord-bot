# Architektur

## Projektstruktur

```text
.
|-- config/
|   `-- defaults.json
|-- docs/
|-- scripts/
|   |-- create-api-key.js
|   |-- deploy-commands.js
|   `-- migrate.js
|-- src/
|   |-- api/
|   |-- config/
|   |-- core/
|   |-- database/
|   |   `-- migrations/
|   |-- modules/
|   |   |-- configuration/
|   |   |-- general/
|   |   |-- tickets/
|   |   |-- voice-support/
|   |   `-- welcome/
|   |-- repositories/
|   |-- services/
|   |-- utils/
|   `-- index.js
`-- test/
```

## Startablauf

1. `src/index.js` laedt und validiert Umgebung sowie Standardkonfiguration.
2. Knex erstellt die SQLite- oder MySQL-Verbindung.
3. Offene Migrationen werden bei `AUTO_MIGRATE=true` ausgefuehrt.
4. Repositories und gemeinsame Services werden erzeugt.
5. `src/core/loadModules.js` entdeckt jedes Unterverzeichnis in `src/modules`.
6. Module registrieren Commands, Buttons, Select-Menues und Events.
7. Die Primary-Instanz verbindet sich mit Discord und startet die REST-API.
8. Die Instanz schreibt alle 30 Sekunden einen Heartbeat in `bot_instances`.

## Schichten

**Module** enthalten den Discord-spezifischen Einstiegspunkt. Sie definieren
Slash-Commands und ordnen Interactions oder Events einem Service zu.

**Services** enthalten die Anwendungslogik. `TicketService` wird beispielsweise
sowohl von Discord-Interactions als auch von der REST-API verwendet.

**Repositories** kapseln Datenbankzugriffe und bilden DB-Spalten auf
JavaScript-Objekte ab.

**Core** enthaelt Registry, Modul-Loader, Logging, Bootstrap und
Instanzkoordination.

**API** enthaelt Express-Middleware, Authentifizierung, Routen und
Fehlerausgabe.

## Konfigurationsfluss

`config/defaults.json` bildet die vollstaendige Grundkonfiguration. Ein
Guild-Datensatz in `guild_configs` wird rekursiv daruebergelegt. Kategorien
aus `ticket_categories` ersetzen die Kategorien aus der Datei fuer die
jeweilige Guild.

Das Ergebnis wird bei jedem Laden mit Zod validiert und 60 Sekunden im Speicher
gecached. Updates leeren den Cache sofort.

## Fehlerbehandlung

- Erwartbare Bedienfehler verwenden `UserError`, `NotFoundError` oder
  `PermissionError`.
- Discord-Interactions erhalten eine kurze ephemere Fehlermeldung.
- Unerwartete Fehler werden inklusive Interaction- oder Event-Kontext geloggt.
- API-Fehler haben ein stabiles JSON-Format mit `code`, `message` und optionalen
  Validierungsdetails.
- Fehlgeschlagene Ticket- und Voice-Erstellungen werden als `failed`
  gespeichert und blockieren keine neuen Faelle.

## Mehrere Instanzen

`INSTANCE_ROLE=primary` startet Discord-Gateway und REST-API.
`INSTANCE_ROLE=worker` registriert aktuell nur Heartbeats und ist als Basis fuer
spaetere Job-Worker vorgesehen. Fuer produktive Mehrinstanz- oder
Shard-Architekturen sollte MySQL/MariaDB verwendet und eine Queue wie Redis,
RabbitMQ oder NATS ergaenzt werden. Discord-mutierende Aufgaben muessen dann
zentral an die Primary-Instanz beziehungsweise den zustaendigen Shard geroutet
werden.

Mehrere Prozesse duerfen nicht unkoordiniert mit demselben Token als
ungeplante Primary-Instanzen laufen. Fuer echtes Discord-Sharding ist der
`ShardingManager` oder eine externe Orchestrierung als naechster Ausbaupunkt
vorgesehen.
