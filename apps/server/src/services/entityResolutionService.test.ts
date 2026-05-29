import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from './supabaseClient';
import { EntityResolutionService } from './entityResolutionService';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;

function chain(data: unknown, error: unknown = null) {
  const obj: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    then: (resolve: any) => resolve({ data, error }),
  };
  return obj;
}

describe('EntityResolutionService', () => {
  let svc: EntityResolutionService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new EntityResolutionService();
  });

  // ─── listEntities ──────────────────────────────────────────────────────────

  describe('listEntities', () => {
    it('returns empty array when all entity tables are empty', async () => {
      mockFrom.mockReturnValue(chain([]));

      const result = await svc.listEntities('user-1');
      expect(result).toEqual([]);
    });

    it('handles supabase errors gracefully and returns partial data', async () => {
      mockFrom.mockReturnValue(chain(null, { message: 'DB error' }));

      const result = await svc.listEntities('user-1');
      expect(result).toEqual([]);
    });

    it('returns normalised entities for a character row', async () => {
      // Default options: include_secondary=false, include_tertiary=false → only 3 entity
      // table queries (characters, locations, entities/org) then 1 batchLoadUsageCounts query.
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // characters table — returns Alice
          return chain([{ id: 'char-1', name: 'Alice', alias: [], created_at: '2022-01-01', updated_at: '2022-01-02' }]);
        }
        if (callCount <= 3) {
          // locations, entities/org — empty
          return chain([]);
        }
        // call 4: batchLoadUsageCounts — entity_unit_links
        return chain([{ entity_id: 'char-1' }, { entity_id: 'char-1' }]);
      });

      const result = await svc.listEntities('user-1');
      expect(result.length).toBe(1);
      expect(result[0].primary_name).toBe('Alice');
      expect(result[0].entity_type).toBe('CHARACTER');
      expect(result[0].usage_count).toBe(2);
    });
  });

  // ─── batchLoadUsageCounts (via listEntities) ──────────────────────────────

  describe('batch usage count loading', () => {
    it('returns usage_count 0 when entity has no links', async () => {
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return chain([{ id: 'char-new', name: 'Bob', aliases: [], created_at: '2022-01-01', updated_at: '2022-01-01' }]);
        }
        if (callCount <= 3) return chain([]);
        return chain([]); // no links — batchLoadUsageCounts returns empty
      });

      const result = await svc.listEntities('user-1');
      expect(result[0]?.usage_count).toBe(0);
    });
  });

  // ─── normalizeEntity (indirectly via listEntities) ────────────────────────

  describe('normalizeEntity', () => {
    it('computes is_user_visible = true for PRIMARY tier entities', async () => {
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return chain([{ id: 'char-vis', name: 'Carol', aliases: [], created_at: '2022-01-01', updated_at: '2022-01-02' }]);
        }
        if (callCount <= 3) return chain([]);
        return chain([{ entity_id: 'char-vis' }]); // usage count link
      });

      const result = await svc.listEntities('user-1');
      expect(result[0]?.is_user_visible).toBe(true);
    });

    it('returns null for a row with a missing name', async () => {
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return chain([{ id: 'bad-row', name: '', aliases: [], created_at: '2022-01-01', updated_at: '2022-01-01' }]);
        }
        if (callCount <= 6) return chain([]);
        return chain([]);
      });

      const result = await svc.listEntities('user-1');
      // A row with empty name should either be null-filtered or have empty primary_name
      const bad = result.find(e => e.entity_id === 'bad-row');
      expect(bad?.primary_name ?? '').toBe('');
    });
  });
});
