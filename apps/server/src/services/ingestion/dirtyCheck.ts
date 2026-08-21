/**
 * Skip UPDATE when canonical fields are unchanged.
 * Avoids WAL / index / cache invalidation on no-op worker writes.
 */

function stable(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map((item) => (typeof item === 'object' && item !== null ? JSON.parse(stable(item)) : item)),
    );
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const next: Record<string, unknown> = {};
    for (const k of keys) {
      if (k === 'updated_at' || k === 'last_refined_at') continue;
      next[k] = obj[k];
    }
    return JSON.stringify(next, Object.keys(next).sort());
  }
  return JSON.stringify(value);
}

export function canonicalFieldsUnchanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: string[],
): boolean {
  for (const key of keys) {
    if (stable(before[key]) !== stable(after[key])) return false;
  }
  return true;
}
