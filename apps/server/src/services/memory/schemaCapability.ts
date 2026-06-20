// =====================================================
// SCHEMA CAPABILITY — Durable Memory Architecture, Slice 5
//
// Cached probe for "does this table have these columns yet?". Lets new write
// paths (e.g. omega_claims.lifecycle_state) no-op cleanly when a migration has
// not been applied, instead of throwing/corrupting an existing UPDATE. Probed
// once per (table, columns) and cached for the process lifetime.
// =====================================================

export interface CapabilityClient {
  from(table: string): {
    select(columns: string): { limit(n: number): Promise<{ error: unknown }> };
  };
}

const cache = new Map<string, boolean>();
const warned = new Set<string>();

/** @internal Test-only: clear the capability cache between cases. */
export function __resetSchemaCapabilityCache(): void {
  cache.clear();
  warned.clear();
}

/**
 * True iff every column exists on the table. Selecting a missing column returns
 * a Postgres error (42703), which we treat as "not capable". Result is cached;
 * a process restart (which a migration entails) re-probes.
 */
export async function columnsExist(
  client: CapabilityClient,
  table: string,
  columns: string[]
): Promise<boolean> {
  const key = `${table}:${[...columns].sort().join(',')}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  try {
    const { error } = await client.from(table).select(columns.join(',')).limit(1);
    const ok = !error;
    cache.set(key, ok);
    if (!ok && !warned.has(key)) {
      warned.add(key);
      console.warn(
        `[schemaCapability] ${table}(${columns.join(',')}) not available — feature disabled until migration + restart.`
      );
    }
    return ok;
  } catch (err) {
    cache.set(key, false);
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[schemaCapability] probe for ${key} threw — treating as unavailable:`, err);
    }
    return false;
  }
}
