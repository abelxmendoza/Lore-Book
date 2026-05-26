/**
 * Layer 2 — Supabase Mock
 * Deterministic, chainable mock for tests. No DB/network access.
 *
 * TYPE CONTRACT: QueryChain resolves to { data: any; error: null; count: null }
 * which is consistent with the real SupabaseClient's untyped behavior
 * (createClient without a Database generic returns data: any).
 * Using `any` here is intentional — it makes the mock type-compatible with
 * production query result handling and eliminates the `{}` type collapse
 * that occurred when `unknown` was used.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockResult = { data: any; error: null; count: null };

const defaultRows: unknown[] = [];
const defaultSingle = null;

/** Chainable query builder that resolves to { data, error, count } when awaited. */
class QueryChain implements PromiseLike<MockResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private result: MockResult = { data: defaultRows as any, error: null, count: null };

  constructor(_tableName?: string) {}

  // --- SELECT / MUTATION ---

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  select(_fields?: string, _opts?: { count?: string; head?: boolean }) {
    this.result = { data: defaultRows, error: null, count: null };
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  insert(_payload: unknown, _opts?: unknown) {
    this.result = { data: [{ id: 'mock-id' }], error: null, count: null };
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  update(_payload: unknown, _opts?: unknown) {
    this.result = { data: [{ id: 'mock-id' }], error: null, count: null };
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  upsert(_payload: unknown, _opts?: unknown) {
    this.result = { data: [{ id: 'mock-id' }], error: null, count: null };
    return this;
  }

  delete() {
    this.result = { data: null, error: null, count: null };
    return this;
  }

  // --- FILTER METHODS ---

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  eq(_column: string, _value: unknown) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  neq(_column: string, _value: unknown) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  not(_column: string, _op: string, _value: unknown) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  is(_column: string, _value: unknown) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ilike(_column: string, _pattern: string) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  like(_column: string, _pattern: string) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  contains(_column: string, _value: unknown) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  containedBy(_column: string, _value: unknown) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  overlaps(_column: string, _value: unknown) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  in(_column: string, _values: unknown[]) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  gte(_column: string, _value: unknown) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  gt(_column: string, _value: unknown) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  lte(_column: string, _value: unknown) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  lt(_column: string, _value: unknown) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  or(_filter: string, _opts?: unknown) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  filter(_column: string, _op: string, _value: unknown) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  match(_query: Record<string, unknown>) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  textSearch(_column: string, _query: string, _opts?: unknown) { return this; }

  // --- MODIFIERS ---

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  order(_column: string, _opts?: { ascending?: boolean; nullsFirst?: boolean }) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  limit(_n: number, _opts?: unknown) { return this; }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  range(_from: number, _to: number) { return this; }
  returns() { return this; }
  throwOnError() { return this; }

  // --- TERMINATORS ---

  maybeSingle() {
    this.result = { data: defaultSingle, error: null, count: null };
    return this;
  }

  single() {
    this.result = { data: defaultSingle, error: null, count: null };
    return this;
  }

  // PromiseLike implementation
  then<TResult1 = MockResult, TResult2 = never>(
    onfulfilled?: ((value: MockResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

/** Auth stub — satisfies .auth.listUsers() calls in admin code. */
const authStub = {
  listUsers: () => Promise.resolve({ data: { users: [] }, error: null }),
  getUser: () => Promise.resolve({ data: { user: null }, error: null }),
  admin: {
    listUsers: () => Promise.resolve({ data: { users: [] }, error: null }),
    getUserById: () => Promise.resolve({ data: { user: null }, error: null }),
  },
};

/** Supabase-style mock client: from(table) returns a chainable QueryChain. */
export function createSupabaseMock() {
  return {
    from(_tableName: string) {
      return new QueryChain(_tableName);
    },
    rpc(_fnName: string, _args?: unknown) {
      return Promise.resolve({ data: null, error: null, count: null });
    },
    channel(_name: string) {
      return {
        on: () => ({ subscribe: () => ({}) }),
        subscribe: () => ({}),
        send: () => Promise.resolve({ status: 'ok' }),
        unsubscribe: () => {},
      };
    },
    auth: authStub,
    storage: {
      from: (_bucket: string) => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        download: () => Promise.resolve({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
        remove: () => Promise.resolve({ data: null, error: null }),
        list: () => Promise.resolve({ data: [], error: null }),
      }),
    },
  };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;
