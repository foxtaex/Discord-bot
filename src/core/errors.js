export class UserError extends Error {
  constructor(message, code = 'USER_ERROR', status = 400) {
    super(message);
    this.name = 'UserError';
    this.code = code;
    this.status = status;
  }
}

export class NotFoundError extends UserError {
  constructor(message = 'Ressource nicht gefunden.') {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class PermissionError extends UserError {
  constructor(message = 'Dafuer fehlen dir die erforderlichen Rechte.') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'PermissionError';
  }
}
