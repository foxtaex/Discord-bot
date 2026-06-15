export function sanitizeChannelName(value, fallback = 'ticket') {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return normalized || fallback;
}

export function sanitizeVoiceChannelName(value, fallback = 'Support') {
  const normalized = String(value)
    .normalize('NFKC')
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('')
    .replaceAll('@', '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);

  return normalized || fallback;
}

export function parseColor(value, fallback = 0x5865f2) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return fallback;
  const parsed = Number.parseInt(value.replace(/^#/, ''), 16);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function renderTemplate(template, variables) {
  return Object.entries(variables).reduce(
    (result, [key, value]) =>
      result.replaceAll(`{${key}}`, String(value ?? '')),
    template,
  );
}

export function hasAnyRole(member, roleIds = []) {
  return roleIds.some((roleId) => member.roles.cache.has(roleId));
}
