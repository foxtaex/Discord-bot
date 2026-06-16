# Module

## Willkommen

Event: `GuildMemberAdd`

Der Service laedt die Guild-Konfiguration, ersetzt Textplatzhalter und erzeugt
ein 1100 x 400 Pixel grosses PNG. Bei einem ungueltigen Hintergrund oder
Bildfehler wird weiterhin ein Embed ohne grosses Bild gesendet.

## Tickets

### Erstellung

1. `/ticket-panel` sendet einen `Open Ticket`-Button und speichert dessen
   Nachrichten-ID.
2. Kategorieaenderungen aktualisieren alle registrierten Panels automatisch.
3. Ein Klick zeigt dem Nutzer die aktuellen Kategorien als privates Dropdown.
4. Nach der Auswahl wird die temporaere Dropdown-Nachricht durch den
   erstellten Ticket-Link ersetzt.
5. Einer von drei eindeutigen `active_key`-Slots wird reserviert.
6. Eine zufaellige sechsstellige Ticketnummer wird kollisionssicher vergeben.
7. Discord erstellt einen privaten Textkanal wie `ticket-583742-username`.
8. Nutzer, Bot und Support-Rollen erhalten gezielte Rechte.
9. Der Kanal erhaelt Buttons fuer Uebernahme und Archivierung.

Beim Claim wird der Supporter dauerhaft als `claimed_by` gespeichert. Das
Ticket-Embed zeigt anschliessend `Claimed by @Supporter`, und der Claim-Button
wird deaktiviert, damit kein zweiter Supporter die Zuweisung ueberschreibt.

Pro Nutzer und Kategorie sind standardmaessig drei aktive Tickets erlaubt.
Archivierte, geloeschte oder fehlgeschlagene Tickets belegen keinen Slot.

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
`/ticket-category add|edit|list|delete` verwaltet Ticket-Kategorien direkt in
Discord.

`/voice-category add|edit|list|delete` verwaltet mehrere Voice-Warteraeume.
Jede Voice-Kategorie kann eigene Benachrichtigungs- und Discord-Kategorien,
Support-Rollen sowie ein eigenes Raum-Namensschema verwenden. Der passende
Kategorie-Key wird an neuen Voice-Faellen gespeichert.

Komplexere Integrationen koennen weiterhin Datei oder REST-API nutzen.

## General

Stellt `/ping`, `/help`, die Ready-Protokollierung und den Bot-Status bereit.

## Fraktionen

`/fraktion` verwaltet Fraktionen mit Status, Typ, Leitung, Stellvertretung,
Discord-Rolle, Channel, Beschreibung und internen Notizen. Mitglieder werden
separat mit Position und Notizen gespeichert. `liste` erzeugt bei Bedarf
mehrere Embeds, `anzeigen` zeigt die Detailansicht.

## Webzugriff

`/webkey erstellen` erzeugt einen kryptografisch zufaelligen Einmal-Key. Der
vollstaendige Wert wird nur in der ephemeren Discord-Antwort angezeigt.
Gespeichert wird ausschliesslich SHA-256. Beim Login wird der Key atomar
verbraucht und gegen eine gehashte serverseitige Sitzung mit CSRF-Token
getauscht.

Berechtigungsstufen:

- `viewer`: Dashboard, Fraktionen und Logs lesen
- `editor`: zusaetzlich Konfiguration und Fraktionen bearbeiten
- `admin`: zusaetzlich Webkeys und API-Keys verwalten
