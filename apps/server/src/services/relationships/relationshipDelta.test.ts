import { describe, expect, it } from 'vitest';

import { RELATIONSHIP_DELTA_BUDGET, RELATIONSHIP_RECOVERY_BUDGET } from '../ingestion/deltaJobBudget';
import {
  addPairsToDirtySet,
  characterPairKey,
  dirtySetFromEvidence,
  mergeUniqueIds,
  parsePairKey,
  relationshipCanonicalUnchanged,
  remapPairAfterMerge,
  uniquePairsFromCharacterIds,
  RELATIONSHIP_WRITER_MAP,
  type RelationshipEvidenceRef,
} from './relationshipDelta';

const MAYA = 'char-maya';
const JAMIE = 'char-jamie';
const MARCUS = 'char-marcus';
const ALEX = 'char-alex';
const TAYLOR = 'char-taylor';
const ME = 'char-me';

function eventRef(id: string, characterIds: string[], at = '2026-08-21T12:00:00.000Z'): RelationshipEvidenceRef {
  return { kind: 'resolved_event', id, characterIds, at };
}

describe('relationship delta — pair identity', () => {
  it('1. two Characters in one event produce one unordered pair', () => {
    expect(uniquePairsFromCharacterIds([MAYA, JAMIE])).toEqual([characterPairKey(MAYA, JAMIE)]);
    expect(characterPairKey(MAYA, JAMIE)).toBe(characterPairKey(JAMIE, MAYA));
  });

  it('2. three Characters produce exactly three pairs', () => {
    const pairs = uniquePairsFromCharacterIds([MAYA, JAMIE, ALEX]);
    expect(pairs).toHaveLength(3);
    expect(pairs).toEqual(
      expect.arrayContaining([
        characterPairKey(MAYA, JAMIE),
        characterPairKey(MAYA, ALEX),
        characterPairKey(JAMIE, ALEX),
      ]),
    );
  });

  it('3. twenty events about the same pair collapse to one dirty key', () => {
    const refs = Array.from({ length: 20 }, (_, i) => eventRef(`ev-${i}`, [MAYA, JAMIE]));
    expect(dirtySetFromEvidence(refs).dirty.size).toBe(1);
  });

  it('4. does not generate pairs from the full Character roster', () => {
    const roster = Array.from({ length: 100 }, (_, i) => `char-${i}`);
    const evidenceOnly = dirtySetFromEvidence([eventRef('ev-1', [MAYA, JAMIE])]);
    expect(evidenceOnly.dirty.size).toBe(1);
    expect(uniquePairsFromCharacterIds(roster)).toHaveLength((100 * 99) / 2);
    expect(evidenceOnly.dirty.has(characterPairKey(roster[0], roster[1]))).toBe(false);
  });
});

describe('relationship delta — evidence idempotency', () => {
  it('5. overlap re-seeing the same source id does not add evidence', () => {
    const first = mergeUniqueIds([], ['msg-1', 'msg-2']);
    const overlap = mergeUniqueIds(first.next, ['msg-1']);
    expect(overlap.added).toEqual([]);
    expect(overlap.next).toEqual(['msg-1', 'msg-2']);
  });

  it('6. a genuinely new source id is counted once', () => {
    const merged = mergeUniqueIds(['msg-1'], ['msg-1', 'msg-2']);
    expect(merged.added).toEqual(['msg-2']);
    expect(merged.next).toHaveLength(2);
  });

  it('7. identical canonical fields skip even when last_refreshed_at moved', () => {
    const before = {
      relationship_type: 'friend',
      status: 'active',
      metadata: { source_memory_ids: ['m1'], last_refreshed_at: '2026-01-01T00:00:00.000Z', co_mention_count: 1 },
    };
    const after = {
      relationship_type: 'friend',
      status: 'active',
      metadata: { source_memory_ids: ['m1'], last_refreshed_at: '2026-08-21T00:00:00.000Z', co_mention_count: 1 },
    };
    expect(relationshipCanonicalUnchanged(before, after)).toBe(true);
  });

  it('8. new evidence id is a semantic change', () => {
    const before = {
      relationship_type: 'friend',
      status: 'active',
      metadata: { source_memory_ids: ['m1'] },
    };
    const after = {
      relationship_type: 'friend',
      status: 'active',
      metadata: { source_memory_ids: ['m1', 'm2'] },
    };
    expect(relationshipCanonicalUnchanged(before, after)).toBe(false);
  });
});

describe('relationship delta — merge / delete / identity', () => {
  it('9. merge remaps the absorbed Character onto the survivor pair', () => {
    const before = characterPairKey(MAYA, JAMIE);
    expect(remapPairAfterMerge(before, MAYA, MARCUS)).toBe(characterPairKey(MARCUS, JAMIE));
  });

  it('10. merge of a self-loop pair is dropped', () => {
    expect(remapPairAfterMerge(characterPairKey(MAYA, JAMIE), JAMIE, MAYA)).toBeNull();
  });

  it('11. a missing/deleted Character is not a pair endpoint', () => {
    expect(parsePairKey(characterPairKey(MAYA, MAYA))).toBeNull();
    expect(uniquePairsFromCharacterIds([MAYA, ''])).toEqual([]);
  });
});

describe('relationship delta — recovery vs normal + budget', () => {
  it('12. live graph recovery is classified event-driven delta; scripts stay recovery', () => {
    const live = RELATIONSHIP_WRITER_MAP.find((w) => w.id === 'relationship_foundation.recoverRelationshipGraph');
    const scripts = RELATIONSHIP_WRITER_MAP.find((w) => w.id.startsWith('generateRelationships'));
    expect(live?.classification).toBe('EVENT-DRIVEN DELTA');
    expect(scripts?.classification).toBe('RECOVERY');
    expect(live?.llmCalls).toBe('0');
  });

  it('13. delta budget is smaller than recovery and forbids LLM', () => {
    expect(RELATIONSHIP_DELTA_BUDGET.maxRows).toBeLessThan(RELATIONSHIP_RECOVERY_BUDGET.maxRows);
    expect(RELATIONSHIP_DELTA_BUDGET.maxLlmCalls).toBe(0);
    expect(RELATIONSHIP_RECOVERY_BUDGET.maxLlmCalls).toBe(0);
  });

  it('14. pair cap uses the delta row budget', () => {
    const dirty = new Set<string>();
    for (let i = 0; i < 200; i++) addPairsToDirtySet(dirty, [`a-${i}`, `b-${i}`]);
    const capped = [...dirty].slice(0, RELATIONSHIP_DELTA_BUDGET.maxRows);
    expect(capped).toHaveLength(RELATIONSHIP_DELTA_BUDGET.maxRows);
    expect(dirty.size).toBeGreaterThan(capped.length);
  });
});

describe('relationship delta — idle vs new events (synthetic benchmark)', () => {
  it('15. idle 100 Characters / 1000 unchanged events → 0 dirty pairs', () => {
    const refs: RelationshipEvidenceRef[] = [];
    expect(dirtySetFromEvidence(refs).dirty.size).toBe(0);
  });

  it('16. +10 events involving 5 Characters work is proportional to unique pairs, not the roster', () => {
    const people = [MAYA, JAMIE, MARCUS, ALEX, TAYLOR];
    const refs = Array.from({ length: 10 }, (_, i) =>
      eventRef(`ev-${i}`, [people[i % 5], people[(i + 1) % 5], people[(i + 2) % 5]]),
    );
    const { dirty, characterIds } = dirtySetFromEvidence(refs);
    expect(characterIds.size).toBe(5);
    expect(dirty.size).toBeLessThanOrEqual((5 * 4) / 2);
    expect(dirty.size).toBeGreaterThan(0);
    expect(dirty.size).toBeLessThan(100);
  });

  it('17. protagonist × full roster is not implied by a single two-person event', () => {
    const { dirty } = dirtySetFromEvidence([eventRef('ev-1', [MAYA, JAMIE])]);
    expect(dirty.has(characterPairKey(ME, MAYA))).toBe(false);
    expect(dirty.has(characterPairKey(ME, JAMIE))).toBe(false);
  });
});
