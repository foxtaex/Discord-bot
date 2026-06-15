export function createOpenApiDocument(port) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Discord Support Platform API',
      version: '1.0.0',
    },
    servers: [{ url: `http://localhost:${port}/api` }],
    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
    paths: {
      '/health': { get: { security: [], summary: 'Health-Status' } },
      '/v1/guilds/{guildId}/messages': {
        post: { summary: 'Nachricht oder Embed senden' },
      },
      '/v1/guilds/{guildId}/users/{userId}': {
        get: { summary: 'Discord-Nutzer abrufen' },
      },
      '/v1/guilds/{guildId}/tickets': {
        get: { summary: 'Tickets auflisten' },
        post: { summary: 'Ticket erstellen' },
      },
      '/v1/guilds/{guildId}/tickets/{ticketId}': {
        get: { summary: 'Ticket und Aktionshistorie lesen' },
        delete: { summary: 'Ticket endgueltig loeschen' },
      },
      '/v1/guilds/{guildId}/tickets/{ticketId}/close': {
        post: { summary: 'Ticket archivieren' },
      },
      '/v1/guilds/{guildId}/tickets/{ticketId}/reopen': {
        post: { summary: 'Ticket wieder oeffnen' },
      },
      '/v1/guilds/{guildId}/config': {
        get: { summary: 'Guild-Konfiguration lesen' },
        patch: { summary: 'Guild-Konfiguration aktualisieren' },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
        apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
    },
  };
}
