import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetWorkerCursorsForTests } from './ingestion/workerHighWaterMark';

const db: Record<string, any[]> = {};
const writes = { inserts: 0, updates: 0 };

function resetDb() {
  writes.inserts = 0;
  writes.updates = 0;
  for (const key of Object.keys(db)) delete db[key];
  db.characters = [];
  db.character_relationships = [];
  db.character_memories = [];
  db.journal_entries = [];
  db.entity_facts = [];
  db.chat_messages = [];
  db.conversation_sessions = [];
  db.organization_members = [];
  db.organizations = [];
  db.resolved_events = [];
  db.pipeline_runs = [];
}

function applyFilters(table: string, state: {
  eqs: Array<{ col: string; val: unknown }>;
  ins: Array<{ col: string; ids: unknown[] }>;
  gte: { col: string; val: string } | null;
  limit: number;
}) {
  let rows = [...(db[table] ?? [])];
  for (const eq of state.eqs) {
    rows = rows.filter((row) => row[eq.col] === eq.val);
  }
  for (const filter of state.ins) {
    rows = rows.filter((row) => filter.ids.includes(row[filter.col]));
  }
  if (state.gte) {
    rows = rows.filter((row) => String(row[state.gte!.col] ?? '') >= state.gte!.val);
  }
  return rows.slice(0, state.limit);
}

function builder(table: string) {
  const state = {
    eqs: [] as Array<{ col: string; val: unknown }>,
    ins: [] as Array<{ col: string; ids: unknown[] }>,
    gte: null as { col: string; val: string } | null,
    limit: 5000,
  };
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.select = () => self();
  api.eq = (col: string, val: unknown) => {
    state.eqs.push({ col, val });
    return self();
  };
  api.in = (col: string, ids: unknown[]) => {
    state.ins.push({ col, ids });
    return self();
  };
  api.or = () => self();
  api.gte = (col: string, val: string) => {
    state.gte = { col, val };
    return self();
  };
  api.order = () => self();
  api.limit = (n: number) => {
    state.limit = n;
    return self();
  };
  api.maybeSingle = async () => {
    const rows = applyFilters(table, state);
    return { data: rows[0] ?? null, error: null };
  };
  api.insert = async (row: unknown) => {
    const rows = Array.isArray(row) ? row : [row];
    db[table] = db[table] ?? [];
    db[table].push(...rows);
    writes.inserts += rows.length;
    return { error: null, data: rows };
  };
  api.update = (patch: Record<string, unknown>) => ({
    eq: async (col: string, val: unknown) => {
      writes.updates += 1;
      for (const row of db[table] ?? []) {
        if (row[col] === val) Object.assign(row, patch);
      }
      return { error: null };
    },
  });
  api.then = (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
    Promise.resolve({ data: applyFilters(table, state), error: null }).then(resolve, reject);
  return api;
}

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: (table: string) => builder(table) },
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { relationshipFoundationService } from './relationshipFoundationService';

const USER = '11111111-1111-4111-8111-111111111111';
const ME = 'char-me';
const MAYA = 'char-maya';
const JAMIE = 'char-jamie';
const MARCUS = 'char-marcus';
const ALEX = 'char-alex';
const TAYLOR = 'char-taylor';

function seedCharacters() {
  db.characters = [
    { id: ME, name: 'Me', metadata: { mention_count: 99 } },
    { id: MAYA, name: 'Maya', metadata: {} },
    { id: JAMIE, name: 'Jamie', metadata: {} },
    { id: MARCUS, name: 'Marcus', metadata: {} },
    { id: ALEX, name: 'Alex', metadata: {} },
    { id: TAYLOR, name: 'Taylor', metadata: {} },
  ];
}

beforeEach(() => {
  resetDb();
  resetWorkerCursorsForTests();
  seedCharacters();
});

describe('relationship foundation — delta recover', () => {
  it('18. second delta run against unchanged events writes nothing', async () => {
    db.resolved_events = [
      {
        id: 'ev-1',
        people: [MAYA, JAMIE],
        title: 'Jamie hung out with Maya',
        summary: 'friends at Northwind Depot',
        created_at: '2026-08-21T12:00:00.000Z',
        updated_at: '2026-08-21T12:00:00.000Z',
        user_id: USER,
      },
    ];

    const first = await relationshipFoundationService.recoverRelationshipGraph(USER, { mode: 'delta' });
    expect(first.report.llmCalls).toBe(0);
    expect(writes.inserts).toBeGreaterThan(0);
    const insertsAfterFirst = writes.inserts;
    const updatesAfterFirst = writes.updates;

    const second = await relationshipFoundationService.recoverRelationshipGraph(USER, { mode: 'delta' });
    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.report.writes).toBe(0);
    expect(writes.inserts).toBe(insertsAfterFirst);
    expect(writes.updates).toBe(updatesAfterFirst);
  });

  it('19. ten events involving five Characters do not touch the rest of a 100-Character roster', async () => {
    const extra = Array.from({ length: 94 }, (_, i) => ({
      id: `char-extra-${i}`,
      name: `Extra${i}`,
      metadata: {},
    }));
    db.characters.push(...extra);

    const people = [MAYA, JAMIE, MARCUS, ALEX, TAYLOR];
    db.resolved_events = Array.from({ length: 10 }, (_, i) => ({
      id: `ev-${i}`,
      people: [people[i % 5], people[(i + 1) % 5]],
      title: 'Jamie met Maya at MemoVault',
      summary: 'friends',
      created_at: `2026-08-21T12:00:${String(i).padStart(2, '0')}.000Z`,
      updated_at: `2026-08-21T12:00:${String(i).padStart(2, '0')}.000Z`,
      user_id: USER,
    }));

    const stats = await relationshipFoundationService.recoverRelationshipGraph(USER, { mode: 'delta' });
    expect(stats.report.affectedCharacters).toBeLessThanOrEqual(6);
    expect(stats.report.uniquePairs).toBeLessThanOrEqual(10);
    expect(stats.report.uniquePairs).toBeGreaterThan(0);
    const writtenIds = new Set(
      db.character_relationships.flatMap((row) => [row.source_character_id, row.target_character_id]),
    );
    expect([...writtenIds].some((id) => String(id).startsWith('char-extra-'))).toBe(false);
  });

  it('20. idle delta with no new sources scans nothing to write', async () => {
    const stats = await relationshipFoundationService.recoverRelationshipGraph(USER, { mode: 'delta' });
    expect(stats.created).toBe(0);
    expect(stats.updated).toBe(0);
    expect(stats.report.writes).toBe(0);
    expect(stats.report.llmCalls).toBe(0);
  });
});
