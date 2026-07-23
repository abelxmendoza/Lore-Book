import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isFamilyRelationshipRow } from '../../../src/services/kinship/familyGraphService';

// ─── isFamilyRelationshipRow (pure) ─────────────────────────────────────────

describe('isFamilyRelationshipRow', () => {
  it('is true when relationship_category is family', () => {
    expect(isFamilyRelationshipRow({ relationship_category: 'family' })).toBe(true);
  });

  it('is true when relationship_type is family (chat-created kinship edges)', () => {
    expect(isFamilyRelationshipRow({ relationship_type: 'family' })).toBe(true);
  });

  it('is true when metadata.kinship or relationship_role is set', () => {
    expect(isFamilyRelationshipRow({ metadata: { kinship: 'aunt' } })).toBe(true);
    expect(isFamilyRelationshipRow({ relationship_role: 'cousin' })).toBe(true);
  });

  it('is false for a non-family edge', () => {
    expect(isFamilyRelationshipRow({ relationship_type: 'friend' })).toBe(false);
  });
});

// ─── familySurnameSuggestionService (mocked Supabase) ───────────────────────

type Row = Record<string, unknown>;

function parseOrClause(clause: string): (row: Row) => boolean {
  const groups: Array<Array<(row: Row) => boolean>> = [];
  let depth = 0;
  let cur = '';
  for (const ch of clause) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      groups.push(parseGroup(cur));
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) groups.push(parseGroup(cur));
  return (row) => groups.some((preds) => preds.every((p) => p(row)));
}

function parseGroup(part: string): Array<(row: Row) => boolean> {
  const andMatch = part.match(/^and\((.*)\)$/);
  const conds = andMatch ? andMatch[1].split(',') : [part];
  return conds.map((cond) => {
    const [col, , val] = cond.trim().split('.');
    return (row: Row) => String(row[col]) === val;
  });
}

const { fromMock, tables } = vi.hoisted(() => {
  const tables: Record<string, Row[]> = { characters: [], character_relationships: [] };
  let nextId = 1;

  const fromMock = vi.fn((table: string) => {
    let rows = [...(tables[table] ?? [])];
    let mode: 'select' | 'insert' | 'update' = 'select';
    let payload: Row = {};
    let updateFilters: Array<(row: Row) => boolean> = [];

    const q: Record<string, unknown> = {
      select: () => q,
      insert: (p: Row) => { mode = 'insert'; payload = p; return q; },
      update: (p: Row) => { mode = 'update'; payload = p; return q; },
      eq: (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        updateFilters.push((r) => r[col] === val);
        return q;
      },
      neq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] !== val); return q; },
      not: (col: string, _op: string, val: unknown) => {
        rows = rows.filter((r) => (val === null ? r[col] != null : r[col] !== val));
        return q;
      },
      in: (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col])); return q; },
      or: (clause: string) => { const pred = parseOrClause(clause); rows = rows.filter(pred); return q; },
      limit: () => q,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        if (mode === 'insert') {
          const row = { id: `gen-${nextId++}`, ...payload };
          tables[table] = [...(tables[table] ?? []), row];
          return resolve({ data: [row], error: null });
        }
        if (mode === 'update') {
          tables[table] = (tables[table] ?? []).map((r) =>
            updateFilters.every((f) => f(r)) ? { ...r, ...payload } : r,
          );
          return resolve({ data: null, error: null });
        }
        return resolve({ data: rows, error: null });
      },
    };
    return q;
  });

  return { fromMock, tables };
});

vi.mock('../../../src/services/supabaseClient', () => ({ supabaseAdmin: { from: fromMock } }));
vi.mock('../../../src/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { familySurnameSuggestionService } from '../../../src/services/kinship/familySurnameSuggestionService';

const USER = 'u1';

function seedCharacters(rows: Row[]) {
  tables.characters = rows;
}

describe('familySurnameSuggestionService.checkForSurnameMatches', () => {
  beforeEach(() => {
    fromMock.mockClear();
    tables.characters = [];
    tables.character_relationships = [];
  });

  it('suggests a match between two family-role characters sharing a last name', async () => {
    seedCharacters([
      { id: 'jerry', user_id: USER, name: 'Cousin Jerry', last_name: 'Smith' },
      { id: 'james', user_id: USER, name: 'Cousin James', last_name: 'Smith' },
    ]);

    await familySurnameSuggestionService.checkForSurnameMatches(USER, 'jerry');

    expect(tables.character_relationships).toHaveLength(1);
    const row = tables.character_relationships[0];
    expect(row.relationship_type).toBe('possible_family');
    expect(row.status).toBe('pending');
    expect(row.inference_status).toBe('inferred');
    expect(row.relationship_category).toBeUndefined();
    expect((row.metadata as Row).inference_source).toBe('surname_match');
  });

  it('does not suggest a match when the other character is not family-role', async () => {
    seedCharacters([
      { id: 'jerry', user_id: USER, name: 'Cousin Jerry', last_name: 'Smith' },
      { id: 'coworker', user_id: USER, name: 'Bob Smith', last_name: 'Smith' },
    ]);

    await familySurnameSuggestionService.checkForSurnameMatches(USER, 'jerry');

    expect(tables.character_relationships).toHaveLength(0);
  });

  it('does not suggest a match when the triggering character is not family-role', async () => {
    seedCharacters([
      { id: 'coworker', user_id: USER, name: 'Bob Smith', last_name: 'Smith' },
      { id: 'james', user_id: USER, name: 'Cousin James', last_name: 'Smith' },
    ]);

    await familySurnameSuggestionService.checkForSurnameMatches(USER, 'coworker');

    expect(tables.character_relationships).toHaveLength(0);
  });

  it('skips a pair that already has any relationship edge (confirmed or dismissed)', async () => {
    seedCharacters([
      { id: 'jerry', user_id: USER, name: 'Cousin Jerry', last_name: 'Smith' },
      { id: 'james', user_id: USER, name: 'Cousin James', last_name: 'Smith' },
    ]);
    tables.character_relationships = [
      { id: 'existing-1', user_id: USER, source_character_id: 'jerry', target_character_id: 'james', relationship_type: 'family', status: 'active' },
    ];

    await familySurnameSuggestionService.checkForSurnameMatches(USER, 'jerry');

    expect(tables.character_relationships).toHaveLength(1); // unchanged, no new suggestion
  });

  it('matches last names regardless of case and diacritics', async () => {
    seedCharacters([
      { id: 'dana', user_id: USER, name: 'Cousin Dana', last_name: 'Muñoz' },
      { id: 'elena', user_id: USER, name: 'Cousin Elena', last_name: 'munoz' },
    ]);

    await familySurnameSuggestionService.checkForSurnameMatches(USER, 'dana');

    expect(tables.character_relationships).toHaveLength(1);
  });

  it('does not compare a character against itself or characters with no last name', async () => {
    seedCharacters([
      { id: 'jerry', user_id: USER, name: 'Cousin Jerry', last_name: 'Smith' },
      { id: 'noname', user_id: USER, name: 'Cousin Noname', last_name: null },
    ]);

    await familySurnameSuggestionService.checkForSurnameMatches(USER, 'jerry');

    expect(tables.character_relationships).toHaveLength(0);
  });

  it('no-ops when the character has no last name at all', async () => {
    seedCharacters([{ id: 'jerry', user_id: USER, name: 'Cousin Jerry', last_name: null }]);

    await familySurnameSuggestionService.checkForSurnameMatches(USER, 'jerry');

    expect(tables.character_relationships).toHaveLength(0);
  });
});

describe('familySurnameSuggestionService.listPendingSuggestions', () => {
  beforeEach(() => {
    fromMock.mockClear();
    tables.characters = [
      { id: 'jerry', user_id: USER, name: 'Cousin Jerry' },
      { id: 'james', user_id: USER, name: 'Cousin James' },
    ];
    tables.character_relationships = [
      {
        id: 'sug-1', user_id: USER, source_character_id: 'jerry', target_character_id: 'james',
        relationship_type: 'possible_family', status: 'pending',
        metadata: { shared_last_name: 'Smith' },
      },
      {
        id: 'sug-2', user_id: USER, source_character_id: 'jerry', target_character_id: 'james',
        relationship_type: 'family', status: 'active', metadata: {},
      },
    ];
  });

  it('returns only pending possible_family rows, with resolved names', async () => {
    const result = await familySurnameSuggestionService.listPendingSuggestions(USER);
    expect(result).toEqual([
      {
        id: 'sug-1',
        characterAId: 'jerry',
        characterAName: 'Cousin Jerry',
        characterBId: 'james',
        characterBName: 'Cousin James',
        sharedLastName: 'Smith',
      },
    ]);
  });
});
