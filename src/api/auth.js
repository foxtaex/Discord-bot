export function createAuthMiddleware(apiKeyService) {
  return async function authenticate(req, res, next) {
    const authorization = req.get('authorization') || '';
    const apiKey =
      req.get('x-api-key') ||
      (authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
    const principal = await apiKeyService.authenticate(apiKey);

    if (!principal) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Ungueltiger API-Key.' },
      });
      return;
    }

    req.principal = principal;
    next();
  };
}

export function requirePermission(permission) {
  return function authorize(req, res, next) {
    const permissions = req.principal.permissions;
    if (!permissions.includes('*') && !permissions.includes(permission)) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `API-Berechtigung "${permission}" fehlt.`,
        },
      });
      return;
    }

    const guildId = req.params.guildId;
    const allowedGuildIds = req.principal.allowedGuildIds;
    if (
      guildId &&
      allowedGuildIds.length > 0 &&
      !allowedGuildIds.includes(guildId)
    ) {
      res.status(403).json({
        error: {
          code: 'GUILD_FORBIDDEN',
          message: 'Dieser API-Key darf nicht auf den Server zugreifen.',
        },
      });
      return;
    }

    next();
  };
}
