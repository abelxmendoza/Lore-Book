import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../config', () => ({ config: { defaultModel: 'gpt-4o-mini' } }));
vi.mock('../config/aiThresholds', () => ({
  AI_THRESHOLDS: {
    JW_ENTITY_MATCH: 0.88,
    SEMANTIC_ENTITY_MATCH: 0.7,
    CLAIM_CONFIDENCE_FLOOR: 0.5,
    UPDATE_SUGGESTION_MIN: 0.7,
  },
}));
vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../lib/openai', () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));
vi.mock('../utils/jaroWinkler', () => ({
  jaroWinkler: vi.fn().mockReturnValue(0),
}));
vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('./continuityService', () => ({
  continuityService: {
    recordEntityResolved: vi.fn().mockResolvedValue(undefined),
    emitEvent: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('./embeddingService', () => ({
  embeddingService: { embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]) },
}));
vi.mock('./memoryReviewQueueService', () => ({
  memoryReviewQueueService: { enqueue: vi.fn() },
}));
vi.mock('./perspectiveService', () => ({
  perspectiveService: { analyze: vi.fn() },
}));
vi.mock('./provenance/provenanceEdgeService', () => ({
  provenanceEdgeService: { createEdge: vi.fn() },
}));

import { supabaseAdmin } from './supabaseClient';
import { jaroWinkler } from '../utils/jaroWinkler';
import { OmegaMemoryService } from './omegaMemoryService';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;
const mockRpc = supabaseAdmin.rpc as ReturnType<typeof vi.fn>;
const mockJW = jaroWinkler as ReturnType<typeof vi.fn>;

/**
 * Build a fluent Supabase chain mock.
 * `awaitResult` – value returned when the chain itself is awaited (batch load path).
 * `singleResult` – value returned by `.single()` (exact-match lookup path).
 */
function makeChain(
  awaitResult: { data: unknown; error?: unknown },
  singleResult?: { data: unknown; error?: unknown }
) {
  const single = singleResult ?? { data: null, error: { code: 'PGRST116' } };
  const obj: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: single.data, error: single.error ?? null }),
    // thenable so `await chain` works
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: awaitResult.data, error: awaitResult.error ?? null }),
  };
  return obj;
}

describe('OmegaMemoryService', () => {
  let svc: OmegaMemoryService;

  beforeEach(() => {
    // These tests exercise the legacy resolver (they mock jaroWinkler/pool
    // matching). The EntityResolutionCore is authoritative by default ('on'),
    // which ignores those mocks — pin legacy mode for deterministic coverage.
    vi.stubEnv('ENTITY_RESOLUTION_CORE', 'off');
    vi.clearAllMocks();
    // clearAllMocks does NOT drain the mockReturnValueOnce queue — reset fully so
    // unconsumed once-values can't leak between tests.
    mockFrom.mockReset();
    mockRpc.mockReset();
    mockJW.mockReturnValue(0);
    svc = new OmegaMemoryService();
    mockRpc.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ─── resolveEntities ──────────────────────────────────────────────────────

  describe('resolveEntities', () => {
    it('returns empty array for empty candidates', async () => {
      const result = await svc.resolveEntities('user-1', []);
      expect(result).toEqual([]);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('finds an existing entity by exact name match (in-memory)', async () => {
      const existingEntity = {
        id: 'ent-1',
        user_id: 'user-1',
        primary_name: 'Alice',
        aliases: [],
        type: 'CHARACTER',
      };

      // batch load returns the entity pool
      mockFrom.mockReturnValue(makeChain({ data: [existingEntity] }));

      const result = await svc.resolveEntities('user-1', [{ name: 'Alice', type: 'CHARACTER' }]);
      expect(result).toHaveLength(1);
      expect(result[0].primary_name).toBe('Alice');
    });

    it('finds an entity via JW fuzzy match above threshold', async () => {
      const existingEntity = {
        id: 'ent-2',
        user_id: 'user-1',
        primary_name: 'Sarah',
        aliases: [],
        type: 'CHARACTER',
      };

      mockFrom.mockReturnValue(makeChain({ data: [existingEntity] }));
      mockJW.mockReturnValue(0.92); // above 0.88 threshold

      const result = await svc.resolveEntities('user-1', [{ name: 'Sara', type: 'CHARACTER' }]);
      expect(result).toHaveLength(1);
      expect(result[0].primary_name).toBe('Sarah');
    });

    it('creates a new entity when no match is found in any path', async () => {
      const newEntity = {
        id: 'new-1',
        user_id: 'user-1',
        primary_name: 'NewPerson',
        aliases: [],
        type: 'CHARACTER',
      };

      mockFrom
        // 1. batch load — empty pool, no in-memory match
        .mockReturnValueOnce(makeChain({ data: [] }))
        // 2. findEntityByNameOrAlias — exact match: not found
        .mockReturnValueOnce(makeChain({ data: null }, { data: null, error: { code: 'PGRST116' } }))
        // 3. findEntityByNameOrAlias — fuzzy scan: empty
        .mockReturnValueOnce(makeChain({ data: [] }))
        // 4. createEntity — race-condition pre-check: no existing entity
        .mockReturnValueOnce(makeChain({ data: null }, { data: null, error: { code: 'PGRST116' } }))
        // 5. createEntity — insert returns new entity
        .mockReturnValueOnce(makeChain({ data: newEntity }, { data: newEntity, error: null }));

      mockJW.mockReturnValue(0); // no fuzzy match

      const result = await svc.resolveEntities('user-1', [{ name: 'NewPerson', type: 'CHARACTER' }]);
      expect(result).toHaveLength(1);
      expect(result[0].primary_name).toBe('NewPerson');
    });

    it('handles multiple candidates of different types in one batch', async () => {
      const charEntity = { id: 'c1', primary_name: 'Alice', aliases: [], type: 'CHARACTER', user_id: 'u1' };
      const locEntity  = { id: 'l1', primary_name: 'Paris', aliases: [], type: 'LOCATION',  user_id: 'u1' };

      // A single chain for every call: both type batches return the (type-
      // filtered downstream) pool, and the per-match promote .update() calls get
      // a valid chain too. In-memory matching picks the right entity by name.
      mockFrom.mockReturnValue(makeChain({ data: [charEntity, locEntity] }));

      const result = await svc.resolveEntities('user-1', [
        { name: 'Alice', type: 'CHARACTER' },
        { name: 'Paris', type: 'LOCATION' },
      ]);

      expect(result).toHaveLength(2);
      expect(result.map(r => r.primary_name)).toEqual(['Alice', 'Paris']);
    });
  });

  // ─── findEntityByNameOrAlias ──────────────────────────────────────────────

  describe('findEntityByNameOrAlias', () => {
    it('returns null when no exact, fuzzy, or semantic match exists', async () => {
      mockFrom
        // exact match — not found
        .mockReturnValueOnce(makeChain({ data: null }, { data: null, error: { code: 'PGRST116' } }))
        // fuzzy scan — empty pool
        .mockReturnValueOnce(makeChain({ data: [] }));

      mockRpc.mockResolvedValue({ data: [] });
      mockJW.mockReturnValue(0);

      const result = await svc.findEntityByNameOrAlias('user-1', 'Unknown', 'CHARACTER');
      expect(result).toBeNull();
    });

    it('returns the entity on exact DB match', async () => {
      const entity = {
        id: 'ent-exact',
        primary_name: 'Bob',
        aliases: [],
        type: 'CHARACTER',
        user_id: 'u1',
      };

      mockFrom.mockReturnValueOnce(
        makeChain({ data: entity }, { data: entity, error: null })
      );

      const result = await svc.findEntityByNameOrAlias('user-1', 'Bob', 'CHARACTER');
      expect(result?.primary_name).toBe('Bob');
    });
  });

  // ─── createEntity ─────────────────────────────────────────────────────────

  describe('createEntity', () => {
    it('inserts a new entity and returns it', async () => {
      const created = {
        id: 'new-ent',
        primary_name: 'Dave',
        aliases: [],
        type: 'CHARACTER',
        user_id: 'u1',
      };
      mockFrom
        // race-condition pre-check: no existing entity
        .mockReturnValueOnce(makeChain({ data: null }, { data: null, error: { code: 'PGRST116' } }))
        // insert returns the created entity
        .mockReturnValueOnce(makeChain({ data: created }, { data: created, error: null }));

      const result = await svc.createEntity('u1', 'Dave', 'CHARACTER');
      expect(result.id).toBe('new-ent');
      expect(result.primary_name).toBe('Dave');
    });

    it('throws when insert fails', async () => {
      mockFrom.mockReturnValue(
        makeChain({ data: null }, { data: null, error: { message: 'insert failed' } })
      );

      await expect(svc.createEntity('u1', 'Broken', 'CHARACTER')).rejects.toBeTruthy();
    });
  });
});
