// Test setup file
import { beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.VITEST = 'true'; // Additional flag for test detection
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
// Keep Chat Completions in unit tests — mocks target chat.completions.create.
process.env.OPENAI_USE_RESPONSES = 'false';
process.env.MONTHLY_OPENAI_BUDGET_USD = '0';

const { supabaseFromMock, supabaseRpcMock } = vi.hoisted(() => ({
  supabaseFromMock: vi.fn(),
  supabaseRpcMock: vi.fn(),
}));

export function makeSupabaseChain(result: { data: unknown; error: unknown; count?: number }) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    ilike: () => chain,
    or: () => chain,
    in: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    upsert: () => chain,
    single: () => Promise.resolve(result),
    maybeSingle: () =>
      Promise.resolve({
        ...result,
        data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
      }),
    then: (resolve: (v: typeof result) => void) => resolve(result),
  };
  return chain;
}

vi.mock('../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: supabaseFromMock,
    rpc: supabaseRpcMock,
    auth: {
      getUser: vi.fn(),
      admin: { getUserById: vi.fn() },
    },
  },
  supabase: {
    from: supabaseFromMock,
    auth: { getUser: vi.fn() },
  },
}));

beforeEach(() => {
  supabaseFromMock.mockReset();
  supabaseRpcMock.mockReset();
  supabaseRpcMock.mockResolvedValue({ data: null, error: null });
  supabaseFromMock.mockImplementation(() => makeSupabaseChain({ data: [], error: null }));
});

// FIX 2: Mock entity extraction globally to prevent LLM calls in tests
// This prevents request quota exhaustion and ensures deterministic tests
// Note: The test guard in extractEntities() will throw if this mock isn't set up,
// forcing tests to properly mock the method
vi.mock('../src/services/omegaMemoryService', async () => {
  const actual = await vi.importActual('../src/services/omegaMemoryService');
  const actualInstance = (actual as any).omegaMemoryService;
  
  // Create a mock function for extractEntities
  const mockExtractEntities = vi.fn().mockResolvedValue([]);
  
  // Preserve the actual instance but override extractEntities
  // Use Object.defineProperty to ensure it's configurable
  Object.defineProperty(actualInstance, 'extractEntities', {
    value: mockExtractEntities,
    writable: true,
    configurable: true,
  });
  
  return {
    ...actual,
    omegaMemoryService: actualInstance,
  };
});

beforeAll(() => {
  // Setup before all tests
});

afterAll(() => {
  // Cleanup after all tests
});

