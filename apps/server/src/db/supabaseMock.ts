/**
 * Layer 2 — Supabase Mock
 * Deterministic, chainable mock for tests. No DB/network access.
 */

const defaultData = { id: 'mock-id' };
const defaultRows: unknown[] = [];
const defaultSingle = null;

/** Chainable query builder that resolves to { data, error } when awaited. */
class QueryChain implements PromiseLike<{ data: unknown; error: null }> {
  private result: { data: unknown; error: null } = { data: defaultRows, error: null };

  constructor(private tableName?: string) {}

  select(_fields?: string) {
    this.result = { data: defaultRows, error: null };
    return this;
  }

  insert(_payload: unknown) {
    this.result = { data: defaultData, error: null };
    return this;
  }

  update(_payload: unknown) {
    this.result = { data: defaultData, error: null };
    return this;
  }

  upsert(_payload: unknown) {
    this.result = { data: defaultData, error: null };
    return this;
  }

  delete() {
    this.result = { data: null, error: null };
    return this;
  }

  eq(_column: string, _value: unknown) {
    return this;
  }

  not(_column: string, _op: string, _value: unknown) {
    return this;
  }

  is(_column: string, _value: unknown) {
    return this;
  }

  ilike(_column: string, _pattern: string) {
    return this;
  }

  contains(_column: string, _value: unknown) {
    return this;
  }

  gte(_column: string, _value: unknown) {
    return this;
  }

  lte(_column: string, _value: unknown) {
    return this;
  }

  order(_column: string, _opts?: { ascending?: boolean }) {
    return this;
  }

  limit(_n: number) {
    return this;
  }

  maybeSingle() {
    this.result = { data: defaultSingle, error: null };
    return this;
  }

  single() {
    this.result = { data: defaultSingle, error: null };
    return this;
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: (value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

/** Supabase-style mock client: from(table) returns a chainable QueryChain. */
export function createSupabaseMock() {
  return {
    from(tableName: string) {
      return new QueryChain(tableName);
    },
    rpc(_fnName: string, _args?: unknown) {
      return Promise.resolve({ data: null, error: null });
    },
    channel(_name: string) {
      return {
        on: () => ({ subscribe: () => ({}) }),
        subscribe: () => ({}),
        send: () => Promise.resolve({ status: 'ok' }),
        unsubscribe: () => {}
      };
    }
  };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;
