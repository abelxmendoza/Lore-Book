import { describe, it, expect, vi, beforeEach } from 'vitest';
import { socialStandingService } from './socialStandingService';
import { supabaseAdmin } from './supabaseClient';

vi.mock('./supabaseClient', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('../logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

type CharFixture = Record<string, unknown>;

// Awaitable query chain: every method returns the chain, awaiting resolves to
// the given result. characters updates are captured for assertions.
function makeChain(result: unknown, onUpdate?: (payload: unknown) => void) {
  const c: any = {};
  for (const m of ['select', 'eq', 'limit', 'update', 'contains', 'in']) {
    c[m] = vi.fn((...args: unknown[]) => {
      if (m === 'update' && onUpdate) onUpdate(args[0]);
      return c;
    });
  }
  c.then = (resolve: (v: unknown) => void) => resolve(result);
  return c;
}

function setupDb(chars: CharFixture[]) {
  const updates: Array<Record<string, any>> = [];
  vi.mocked(supabaseAdmin.from).mockImplementation(((table: string) => {
    if (table === 'characters') return makeChain({ data: chars }, p => updates.push(p as Record<string, any>));
    if (table === 'entity_facts') return makeChain({ data: [] });
    if (table === 'resolved_events') return makeChain({ data: [] });
    return makeChain({ data: [] });
  }) as any);
  return updates;
}

const baseChar = (overrides: CharFixture = {}): CharFixture => ({
  id: 'c1',
  name: 'Grandma Rose',
  relationship_depth: null,
  importance_level: null,
  has_met: true,
  updated_at: new Date().toISOString(),
  metadata: {},
  ...overrides,
});

describe('socialStandingService.recompute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('floors depth for family the user has met (kinship floor)', async () => {
    const updates = setupDb([baseChar({ metadata: { relationship_type: 'family' } })]);
    await socialStandingService.recompute('u1');

    const standing = updates[0].metadata.social_standing;
    // 0.20 depth floor + 0.15 fresh recency = 0.35 → regular, not peripheral
    expect(standing.score).toBeCloseTo(0.35, 2);
    expect(standing.tier).toBe('regular');
  });

  it('does not floor depth for family never met', async () => {
    const updates = setupDb([baseChar({ metadata: { relationship_type: 'family' }, has_met: false })]);
    await socialStandingService.recompute('u1');

    const standing = updates[0].metadata.social_standing;
    expect(standing.score).toBeCloseTo(0.15, 2);
    expect(standing.tier).toBe('peripheral');
  });

  it('applies a user standing override while keeping the computed score', async () => {
    const updates = setupDb([baseChar({
      metadata: { standing_override: { tier: 'inner_circle', set_at: '2026-06-12T00:00:00Z' } },
    })]);
    await socialStandingService.recompute('u1');

    const standing = updates[0].metadata.social_standing;
    expect(standing.tier).toBe('inner_circle');
    expect(standing.overridden).toBe(true);
    expect(standing.score).toBeLessThan(0.6); // computed signal preserved
    // The override itself must survive the metadata rewrite
    expect(updates[0].metadata.standing_override.tier).toBe('inner_circle');
  });

  it('ignores an invalid override tier', async () => {
    const updates = setupDb([baseChar({ metadata: { standing_override: { tier: 'bestie' } } })]);
    await socialStandingService.recompute('u1');

    const standing = updates[0].metadata.social_standing;
    expect(standing.tier).toBe('peripheral');
    expect(standing.overridden).toBeUndefined();
  });
});
