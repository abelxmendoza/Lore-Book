import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { supabaseAdmin } from './supabaseClient';
import { entityContinuityVerifier } from './entityContinuityVerifier';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChain(resolvedWith: { data: unknown[] | null; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'gte', 'order', 'limit', 'in'];
  methods.forEach(m => { chain[m] = vi.fn(() => chain); });
  // terminal call returns resolved promise
  (chain['limit'] as ReturnType<typeof vi.fn>).mockResolvedValue(resolvedWith);
  (chain['in']    as ReturnType<typeof vi.fn>).mockResolvedValue(resolvedWith);
  return chain;
}

const USER_ID = 'user-abc';
const ENTRY_1 = 'entry-001';
const ENTRY_2 = 'entry-002';

const ENTRY_3 = 'entry-003';
const ENTRIES_ROWS = [
  { id: ENTRY_1, created_at: new Date().toISOString() },
  { id: ENTRY_2, created_at: new Date().toISOString() },
  { id: ENTRY_3, created_at: new Date().toISOString() },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EntityContinuityVerifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns healthy when all pipeline stages are present', async () => {
    let callCount = 0;
    vi.mocked(supabaseAdmin.from).mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: // journal_entries — all 3 entries
          return makeChain({ data: ENTRIES_ROWS, error: null }) as never;
        case 2: // omega_claims — all 3 entries have claims
          return makeChain({
            data: [
              { id: 'c1', source_entry_id: ENTRY_1, entity_id: 'ent-1' },
              { id: 'c2', source_entry_id: ENTRY_2, entity_id: 'ent-2' },
              { id: 'c3', source_entry_id: ENTRY_3, entity_id: 'ent-3' },
            ],
            error: null,
          }) as never;
        case 3: // entity_mentions — empty
          return makeChain({ data: [], error: null }) as never;
        case 4: // provenance_edges — all 3 entries have edges
          return makeChain({
            data: [
              { id: 'e1', source_id: ENTRY_1, target_id: 'ent-1', relation: 'MENTIONED_ENTITY' },
              { id: 'e2', source_id: ENTRY_2, target_id: 'ent-2', relation: 'MENTIONED_ENTITY' },
              { id: 'e3', source_id: ENTRY_3, target_id: 'ent-3', relation: 'MENTIONED_ENTITY' },
            ],
            error: null,
          }) as never;
        default:
          return makeChain({ data: [], error: null }) as never;
      }
    });

    const result = await entityContinuityVerifier.verify(USER_ID, 24);

    expect(result.overallHealth).toBe('healthy');
    expect(result.entriesChecked).toBe(3);
    expect(result.entriesFullyPropagated).toBe(3);
    expect(result.entriesWithGaps).toBe(0);
    expect(result.gapBreakdown.stuckAtExtraction).toBe(0);
    expect(result.gapBreakdown.stuckAtProvenance).toBe(0);
  });

  it('reports degraded when extraction is missing for a minority of entries', async () => {
    // 3 entries: 2 fully propagated, 1 stuck at extraction → gap ratio 0.33 → degraded
    let callCount = 0;
    vi.mocked(supabaseAdmin.from).mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: // journal_entries — three entries
          return makeChain({ data: ENTRIES_ROWS, error: null }) as never;
        case 2: // omega_claims — entry1 and entry2 have claims, entry3 does not
          return makeChain({
            data: [
              { id: 'c1', source_entry_id: ENTRY_1, entity_id: 'ent-1' },
              { id: 'c2', source_entry_id: ENTRY_2, entity_id: 'ent-2' },
            ],
            error: null,
          }) as never;
        case 3: // entity_mentions — empty
          return makeChain({ data: [], error: null }) as never;
        case 4: // provenance_edges — entry1 and entry2 have edges
          return makeChain({
            data: [
              { id: 'e1', source_id: ENTRY_1, target_id: 'ent-1', relation: 'MENTIONED_ENTITY' },
              { id: 'e2', source_id: ENTRY_2, target_id: 'ent-2', relation: 'MENTIONED_ENTITY' },
            ],
            error: null,
          }) as never;
        default:
          return makeChain({ data: [], error: null }) as never;
      }
    });

    const result = await entityContinuityVerifier.verify(USER_ID, 24);

    expect(result.overallHealth).toBe('degraded');
    expect(result.entriesWithGaps).toBe(1);
    expect(result.gapBreakdown.stuckAtExtraction).toBe(1);
  });

  it('reports broken when majority of entries have no extraction', async () => {
    let callCount = 0;
    vi.mocked(supabaseAdmin.from).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // 4 entries, all missing extraction
        return makeChain({
          data: [
            { id: 'e1', created_at: new Date().toISOString() },
            { id: 'e2', created_at: new Date().toISOString() },
            { id: 'e3', created_at: new Date().toISOString() },
          ],
          error: null,
        }) as never;
      }
      // All subsequent: empty data
      return makeChain({ data: [], error: null }) as never;
    });

    const result = await entityContinuityVerifier.verify(USER_ID, 24);

    expect(result.overallHealth).toBe('broken');
    expect(result.gapBreakdown.stuckAtExtraction).toBe(3);
  });

  it('returns healthy with no entries in window', async () => {
    vi.mocked(supabaseAdmin.from).mockImplementation(() =>
      makeChain({ data: [], error: null }) as never
    );

    const result = await entityContinuityVerifier.verify(USER_ID, 24);

    expect(result.overallHealth).toBe('healthy');
    expect(result.entriesChecked).toBe(0);
    expect(result.summary).toContain('No entries');
  });

  it('returns broken result when DB query fails', async () => {
    vi.mocked(supabaseAdmin.from).mockImplementation(() =>
      makeChain({ data: null, error: { message: 'DB error' } }) as never
    );

    const result = await entityContinuityVerifier.verify(USER_ID, 24);

    expect(result.overallHealth).toBe('broken');
    expect(result.summary).toContain('Verification failed');
  });

  it('correctly attributes gapAt=provenance when extraction succeeds but no edges', async () => {
    let callCount = 0;
    vi.mocked(supabaseAdmin.from).mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: // journal_entries
          return makeChain({ data: [{ id: ENTRY_1, created_at: new Date().toISOString() }], error: null }) as never;
        case 2: // omega_claims — has claim with entity
          return makeChain({
            data: [{ id: 'c1', source_entry_id: ENTRY_1, entity_id: 'ent-1' }],
            error: null,
          }) as never;
        case 3: // entity_mentions — empty
          return makeChain({ data: [], error: null }) as never;
        case 4: // provenance_edges — empty (provenance never written)
          return makeChain({ data: [], error: null }) as never;
        default:
          return makeChain({ data: [], error: null }) as never;
      }
    });

    const result = await entityContinuityVerifier.verify(USER_ID, 24);

    expect(result.entries[0].gapAt).toBe('provenance');
    expect(result.gapBreakdown.stuckAtProvenance).toBe(1);
  });
});
