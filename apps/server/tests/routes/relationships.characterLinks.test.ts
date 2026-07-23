import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import relationshipsRouter from '../../src/routes/relationships';
import { requireAuth } from '../../src/middleware/auth';

vi.mock('../../src/middleware/auth');

type Row = Record<string, unknown>;

// Generic in-memory Supabase double covering the query shapes the
// character-links PATCH route (and its loadOwnedCharacters /
// syncRomanticRelationshipForCharacterLink helpers) actually issues.
const { fromMock, tables } = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {
    characters: [],
    character_relationships: [],
    romantic_relationships: [],
  };

  const fromMock = vi.fn((table: string) => {
    let rows = [...(tables[table] ?? [])];
    let mode: 'select' | 'update' = 'select';
    let payload: Row = {};
    let updateFilters: Array<(row: Row) => boolean> = [];

    const q: Record<string, unknown> = {
      select: () => q,
      update: (p: Row) => { mode = 'update'; payload = p; return q; },
      eq: (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        updateFilters.push((r) => r[col] === val);
        return q;
      },
      in: (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col])); return q; },
      order: () => q,
      limit: () => q,
      maybeSingle: async () => {
        if (mode === 'update') {
          tables[table] = (tables[table] ?? []).map((r) =>
            updateFilters.every((f) => f(r)) ? { ...r, ...payload } : r,
          );
          const updated = tables[table].find((r) => updateFilters.every((f) => f(r)));
          return { data: updated ?? null, error: null };
        }
        return { data: rows[0] ?? null, error: null };
      },
      single: async () => {
        if (mode === 'update') {
          tables[table] = (tables[table] ?? []).map((r) =>
            updateFilters.every((f) => f(r)) ? { ...r, ...payload } : r,
          );
          const updated = tables[table].find((r) => updateFilters.every((f) => f(r)));
          return { data: updated ?? null, error: updated ? null : { message: 'not found' } };
        }
        return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } };
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data: rows, error: null }),
    };
    return q;
  });

  return { fromMock, tables };
});

vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: { from: fromMock } }));
vi.mock('../../src/services/relationships/relationshipRoleInferenceService', () => ({
  inferRolesFromText: vi.fn(),
  inferRoleForPerson: vi.fn(),
  inferRoleFromEntries: vi.fn(),
  hierarchyLabel: vi.fn(),
  hierarchyIcon: vi.fn(),
  domainLabel: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/relationships', relationshipsRouter);

const USER = 'user-123';
const REL_ID = '11111111-1111-4111-8111-111111111111';
const JERRY = '22222222-2222-4222-8222-222222222222';
const JAMES = '33333333-3333-4333-8333-333333333333';

describe('PATCH /api/relationships/character-links/:id — possible_family confirm/dismiss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation(async (req: any, _res, next) => {
      req.user = { id: USER, email: 'test@example.com' };
      next();
    });
    tables.characters = [
      { id: JERRY, user_id: USER, name: 'Cousin Jerry' },
      { id: JAMES, user_id: USER, name: 'Cousin James' },
    ];
    tables.character_relationships = [
      {
        id: REL_ID, user_id: USER, source_character_id: JERRY, target_character_id: JAMES,
        relationship_type: 'possible_family', status: 'pending', inference_status: 'inferred',
        metadata: { inference_source: 'surname_match', shared_last_name: 'Smith' },
      },
    ];
    tables.romantic_relationships = [];
  });

  it('confirms a possible_family suggestion into a real family edge', async () => {
    const res = await request(app)
      .patch(`/api/relationships/character-links/${REL_ID}`)
      .send({ relationship_type: 'family', status: 'active' })
      .expect(200);

    expect(res.body.success).toBe(true);
    const row = tables.character_relationships.find((r) => r.id === REL_ID);
    expect(row?.relationship_type).toBe('family');
    expect(row?.status).toBe('active');
  });

  it('dismisses a possible_family suggestion by updating status, not deleting the row', async () => {
    const res = await request(app)
      .patch(`/api/relationships/character-links/${REL_ID}`)
      .send({ status: 'dismissed' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(tables.character_relationships).toHaveLength(1);
    const row = tables.character_relationships.find((r) => r.id === REL_ID);
    expect(row?.status).toBe('dismissed');
    expect(row?.relationship_type).toBe('possible_family'); // untouched
  });
});
