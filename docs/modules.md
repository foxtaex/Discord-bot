# Module

## Willkommen

Event: `GuildMemberAdd`

Der Service laedt die Guild-Konfiguration, ersetzt Textplatzhalter und erzeugt
ein 1100 x 400 Pixel grosses PNG. Bei einem ungueltigen Hintergrund oder
Bildfehler wird weiterhin ein Embed ohne grosses Bild gesendet.

## Tickets

### Erstellung

1. `/ticket-panel` sendet ein Select-Menue.
2. Der Nutzer waehlt eine Kategorie.
3. Ein DB-Datensatz mit eindeutigem `active_key` wird reserviert.
4. Eine zufaellige sechsstellige Ticketnummer wird kollisionssicher vergeben.
5. Discord erstellt einen privaten Textkanal wie `ticket-583742-username`.
6. Nutzer, Bot und Support-Rollen erhalten gezielte Rechte.
7. Der Kanal erhaelt Buttons fuer Uebernahme und Archivierung.

### Archivierung

Beim Schliessen:

1. Optional wird ein HTML-Transkript geschrieben.
2. Der Kanal wird in `archiveCategoryId` verschoben.
3. Der Ticket-Ersteller verliert Sicht- und Schreibrechte.
4. Supporter behalten den vollstaendigen Verlauf.
5. Der Datensatz wechselt zu `archived`.
6. Buttons erlauben Wiedereroeffnung, Transkript und Loeschung.

Beim Wiedereroeffnen wird geprueft, ob bereits ein neues aktives Ticket in
derselben Kategorie existiert. Erst dann werden Kanal und Nutzerrechte
wiederhergestellt.

Die endgueltige Loeschung entfernt nur den Discord-Kanal. Ticket- und
Aktionshistorie bleiben als Datensatz erhalten.

## Voice-Support

Event: `VoiceStateUpdate`

Beim Betreten des konfigurierten Warteraums reserviert der Bot einen aktiven
Fall und erstellt einen privaten Voice-Raum. Der Nutzer bleibt absichtlich im
Warteraum.

Im Text-Benachrichtigungskanal werden Support-Rollen erwaehnt. Die Buttons:

- **Claim** weist den Fall dauerhaft einem Supporter zu, verschiebt den Nutzer
  sofort und sendet dem Supporter einen ephemeren, einmalig nutzbaren Join-Link.
- **Nutzer verschieben** verschiebt den wartenden Nutzer manuell.
- **Schliessen** beendet den Fall und loescht den privaten Raum, sofern
  `deleteRoomOnClose` aktiv ist.

Ein eindeutiger `active_key` verhindert doppelte Faelle bei schnellen oder
wiederholten Voice-Events.

Sobald der betroffene Nutzer den privaten Support-Raum verlaesst, wird der Fall
automatisch geschlossen und der Voice-Channel geloescht. Das Verlassen durch
einen Supporter allein loest keine Loeschung aus.

Der beim Claim erzeugte Invite gilt maximal eine Stunde und wird beim
Fallabschluss explizit widerrufen. `claimed_by` und `claimed_at` bleiben in der
Datenbank erhalten, sodass nachvollziehbar ist, welcher Supporter den Fall
angenommen hat.

## Konfiguration

`/bot-config` zeigt zentrale Werte oder schreibt einfache Guild-Patches.
`/ticket-category add|list|delete` verwaltet Ticket-Kategorien direkt in
Discord. Komplexere Integrationen koennen weiterhin Datei oder REST-API nutzen.

## General

Stellt `/ping`, `/help`, die Ready-Protokollierung und den Bot-Status bereit.
