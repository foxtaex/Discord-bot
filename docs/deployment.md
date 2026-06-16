# Deployment und Wartung

## Produktionscheckliste

- Node.js-LTS oder neuer verwenden
- `NODE_ENV=production` setzen
- Bot-Token und API-Keys nur als Secrets bereitstellen
- MySQL/MariaDB fuer mehrere Prozesse oder groessere Installationen verwenden
- `API_HOST=127.0.0.1` hinter einem Reverse Proxy belassen
- TLS am Reverse Proxy terminieren
- Discord-Intents und Bot-Rechte pruefen
- Datenbank und `data/transcripts` sichern
- Logs zentral sammeln

## Docker

```bash
docker build -t discord-support-platform .
docker run --env-file .env -v bot-data:/app/data discord-support-platform
```

Das Beispiel `docker-compose.example.yml` enthaelt Bot und MariaDB. Vor der
Nutzung muessen Token, IDs und Passwoerter ersetzt oder ueber Docker Secrets
eingebunden werden.

## Prozessmanager

Mit PM2:

```bash
npm install -g pm2
pm2 start src/index.js --name discord-support
pm2 save
```

Alternativ sollte ein systemd-Dienst `npm start` als unprivilegierter Nutzer
ausfuehren und `Restart=on-failure` verwenden.

## Reverse Proxy

`/api` und `/panel` muessen weitergeleitet werden. Beispiel fuer Nginx:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:6767;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /panel/ {
    proxy_pass http://127.0.0.1:6767;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Fuer oeffentliche APIs sollten zusaetzliche Netzwerkregeln, TLS, eng begrenzte
API-Keys und ein vorgeschaltetes Rate-Limit verwendet werden.

Bei HTTPS muss `WEB_PANEL_COOKIE_SECURE=true` gesetzt werden.
`WEB_PANEL_PUBLIC_URL` muss auf die erreichbare `/panel`-URL zeigen, damit
`/webkey erstellen` den richtigen Link ausgibt.

## Updates

```bash
git pull
npm ci
npm run validate
npm run db:migrate
npm run deploy:commands
```

Danach den Prozess kontrolliert neu starten. Vor Migrationen ist ein Backup
empfohlen.

## Wartung

- `GET /api/health` fuer Readiness-Monitoring verwenden.
- Veraltete oder kompromittierte API-Keys in `api_keys.revoked` sperren.
- `bot_instances.heartbeat_at` auf ausgefallene Prozesse ueberwachen.
- Speicherverbrauch von Transkripten regelmaessig pruefen.
- Archivierte Tickets nach internen Aufbewahrungsregeln endgueltig loeschen.
- Discord-Rollen- und Kanal-IDs nach Serverumbauten kontrollieren.

## Skalierung

SQLite ist fuer eine einzelne Primary-Instanz gedacht. Fuer mehrere Instanzen:

1. MySQL/MariaDB aktivieren.
2. Genau eine Primary-Instanz fuer Gateway und API betreiben.
3. Weitere Prozesse mit `INSTANCE_ROLE=worker` starten.
4. Vor echter Aufgabenverteilung eine zentrale Queue implementieren.
5. Bei vielen Guilds Discord-Sharding ergaenzen.

Der vorhandene Worker-Modus fuehrt noch keine Jobs aus. Er schafft
Instanzidentitaet und Heartbeats, ersetzt aber keine Queue oder
Shard-Koordination.
