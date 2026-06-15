export function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }

  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] =
      isPlainObject(value) && isPlainObject(base[key])
        ? deepMerge(base[key], value)
        : value;
  }
  return result;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
