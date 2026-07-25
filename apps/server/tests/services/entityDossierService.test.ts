import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildEntityDossierBlock } from '../../src/services/chat/entityDossierService';
import { supabaseAdmin } from '../../src/services/supabaseClient';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../src/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const FACT_ROWS = [
  { fact: 'Works at SpaceX', category: 'work', confidence: 0.9, status: 'active' },
];
const MOMENT_ROWS = [
  {
    canonical_title: 'Sunday hikes',
    recurring_activities: ['hiking'],
    occurrence_count: 4,
    continuity_strength: 0.8,
    last_seen_at: '2026-01-01',
  },
];

/** Chainable query builder mock: every method returns `this`, and it's awaitable. */
function makeChain(data: unknown) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    ilike: () => chain,
    gte: () => chain,
    filter: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve: (v: { data: unknown }) => unknown) => Promise.resolve(resolve({ data })),
  };
  return chain;
}

describe('entityDossierService', () => {
  const character = { id: 'char-1', name: 'Derrik', alias: [] };

  beforeEach(() => {
    vi.clearAllMocks();
    (supabaseAdmin as any).from = vi.fn((table: string) => {
      if (table === 'entity_facts') return makeChain(FACT_ROWS);
      if (table === 'entities') return makeChain([{ id: 'legacy-entity-1' }]);
      if (table === 'event_candidates') return makeChain(MOMENT_ROWS);
      return makeChain([]);
    });
  });

  it('includes both facts and moments when nothing is skipped', async () => {
    const block = await buildEntityDossierBlock('user-1', 'Tell me about Derrik', [character], []);

    expect(block).toContain('Works at SpaceX');
    expect(block).toContain('Sunday hikes');
  });

  it('skips facts but keeps moments for an entity in skipFactsForEntityIds', async () => {
    const block = await buildEntityDossierBlock('user-1', 'Tell me about Derrik', [character], [], ['char-1']);

    expect(block).not.toContain('Works at SpaceX');
    expect(block).toContain('Sunday hikes');
  });

  it('returns null when the mentioned entity has no facts or moments', async () => {
    (supabaseAdmin as any).from = vi.fn(() => makeChain([]));

    const block = await buildEntityDossierBlock('user-1', 'Tell me about Derrik', [character], []);

    expect(block).toBeNull();
  });

  it('returns null when no known entity is mentioned', async () => {
    const block = await buildEntityDossierBlock('user-1', 'How is the weather?', [character], []);

    expect(block).toBeNull();
  });
});
