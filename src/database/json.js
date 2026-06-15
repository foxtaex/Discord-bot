export function toJson(value) {
  return JSON.stringify(value ?? null);
}

export function fromJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
