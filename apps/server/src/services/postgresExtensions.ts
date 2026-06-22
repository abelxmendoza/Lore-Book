/**
 * Supabase Postgres extension inventory helpers.
 * @see https://supabase.com/docs/guides/database/extensions
 */

export type EnabledExtension = {
  name: string;
  schema: string;
  version: string;
};

/** Extensions deprecated on the Postgres 17 upgrade path (disable via Dashboard → Extensions). */
export const PG17_DEPRECATED_EXTENSIONS = new Set([
  'pgjwt',
  'timescaledb',
  'plv8',
  'plls',
  'plcoffee',
]);

/** Core extensions Lorekeeper migrations rely on — informational only. */
export const LOREKEEPER_EXPECTED_EXTENSIONS = new Set([
  'uuid-ossp',
  'vector',
  'pgvector',
  'pg_trgm',
  'pgcrypto',
  'pg_stat_statements',
  'pg_cron',
]);

/** Supabase recommends installing extensions under the `extensions` schema. */
export const SUPABASE_PREFERRED_EXTENSION_SCHEMA = 'extensions';

export function parseEnabledExtensions(raw: unknown): EnabledExtension[] {
  if (!Array.isArray(raw)) return [];
  const out: EnabledExtension[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.name !== 'string') continue;
    out.push({
      name: rec.name,
      schema: typeof rec.schema === 'string' ? rec.schema : 'unknown',
      version: typeof rec.version === 'string' ? rec.version : 'unknown',
    });
  }
  return out;
}

export function findDeprecatedEnabled(extensions: readonly EnabledExtension[]): string[] {
  const names: string[] = [];
  for (let i = 0; i < extensions.length; i += 1) {
    if (PG17_DEPRECATED_EXTENSIONS.has(extensions[i].name)) {
      names.push(extensions[i].name);
    }
  }
  return names.sort();
}

/** Extensions not in the preferred `extensions` schema (namespace hygiene signal). */
export function findNonStandardSchemaExtensions(
  extensions: readonly EnabledExtension[]
): EnabledExtension[] {
  return extensions.filter(
    (ext) =>
      ext.schema !== SUPABASE_PREFERRED_EXTENSION_SCHEMA &&
      ext.schema !== 'pg_catalog' &&
      ext.name !== 'plpgsql'
  );
}
