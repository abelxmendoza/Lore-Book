import { vi } from 'vitest';

export type QueryResult = { data?: unknown; error?: unknown; count?: number | null };

/** Chainable Supabase query builder that resolves to `result`. */
export function chainableQuery(result: QueryResult = { data: null, error: null }) {
  const builder: Record<string, unknown> = {};
  const methods = [
    'select',
    'insert',
    'update',
    'upsert',
    'delete',
    'eq',
    'neq',
    'is',
    'in',
    'or',
    'filter',
    'contains',
    'order',
    'limit',
    'single',
    'maybeSingle',
  ];
  for (const m of methods) {
    builder[m] = vi.fn(() => builder);
  }
  builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

export type TableHandler = (table: string, builder: ReturnType<typeof chainableQuery>) => void;

/**
 * Routes `supabaseAdmin.from(table)` to per-table handlers.
 * Unregistered tables return empty success by default.
 */
export function createSupabaseRouter(
  handlers: Record<string, (b: ReturnType<typeof chainableQuery>) => ReturnType<typeof chainableQuery>>,
) {
  return vi.fn((table: string) => {
    const base = chainableQuery({ data: null, error: null });
    const handler = handlers[table];
    return handler ? handler(base) : base;
  });
}
