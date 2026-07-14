import { describe, it, expect } from 'vitest';

import { filterEvidence, classifyItemDomain } from '../../../src/services/responseScope/responseEvidenceFilter';
import { planResponseScope } from '../../../src/services/responseScope/responseScopePlanner';
import type { ScopedEvidenceItem } from '../../../src/services/responseScope/responseScopeTypes';

// Fictional cast only.
const item = (over: Partial<ScopedEvidenceItem>): ScopedEvidenceItem => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  title: 'item',
  content: '',
  domain: 'people',
  ...over,
});

const WORK_PLAN = planResponseScope("Who's on my team at Titanworks?");

describe('evidence filtering for a work question', () => {
  it('accepts work evidence, rejects family/romance/music-scene evidence', () => {
    const { accepted, rejected } = filterEvidence(
      [
        item({ id: 'w1', title: 'Kavi', domain: 'work_relationships', entityNames: ['Kavi'] }),
        item({ id: 'f1', title: 'Grandma Wren Sundays', domain: 'family' }),
        item({ id: 'r1', title: 'Vexadoll crush', domain: 'romance' }),
        item({ id: 'm1', title: 'BassRiot warehouse show', domain: 'music_scene' }),
        item({ id: 'w2', title: 'Diagnostics and Prototypes Team', domain: 'teams' }),
      ],
      WORK_PLAN,
    );
    expect(accepted.map((i) => i.id)).toEqual(['w1', 'w2']);
    expect(rejected.map((i) => i.rejectedReason)).toEqual(
      expect.arrayContaining(['blocked_domain:family', 'blocked_domain:romance', 'blocked_domain:music_scene']),
    );
  });

  it('never passes diagnostics or audit rows', () => {
    const { accepted, rejected } = filterEvidence(
      [
        item({ id: 'd1', title: 'memory layer status', domain: 'diagnostics' }),
        item({ id: 'a1', title: 'all characters', domain: 'character_audit' }),
      ],
      WORK_PLAN,
    );
    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(2);
  });

  it('drops excluded (user-corrected-away) items and duplicates', () => {
    const { accepted, rejected } = filterEvidence(
      [
        item({ id: 'x1', title: 'Kavi', domain: 'work_relationships', excluded: true }),
        item({ id: 'x2', title: 'Wren', domain: 'work_relationships' }),
        item({ id: 'x3', title: 'Wren', domain: 'work_relationships' }),
      ],
      WORK_PLAN,
    );
    expect(accepted.map((i) => i.id)).toEqual(['x2']);
    expect(rejected.find((i) => i.id === 'x1')?.rejectedReason).toBe('truth_state_excluded');
    expect(rejected.find((i) => i.id === 'x3')?.rejectedReason).toBe('duplicate');
  });

  it('enforces the evidence budget', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      item({ id: `w${i}`, title: `Coworker ${i}`, domain: 'work_relationships' }),
    );
    const { accepted, rejected } = filterEvidence(many, WORK_PLAN);
    expect(accepted.length).toBe(WORK_PLAN.maxEvidenceItems);
    expect(rejected.some((r) => r.rejectedReason === 'over_budget')).toBe(true);
  });
});

describe('domain classification of untagged items', () => {
  it('tags romantic, family, work, and diagnostic content correctly', () => {
    expect(classifyItemDomain({ type: 'relationship', content: 'crush, unrequited' })).toBe('romance');
    expect(classifyItemDomain({ type: 'relationship', content: 'her grandmother and cousins' })).toBe('family');
    expect(classifyItemDomain({ type: 'relationship', content: 'coworker on the night shift' })).toBe('work_relationships');
    expect(classifyItemDomain({ type: 'debug', content: 'anything' })).toBe('diagnostics');
    expect(classifyItemDomain({ type: 'episode', content: 'mention_count and pipeline_runs stats' })).toBe('diagnostics');
  });

  it('explicit metadata domain wins over heuristics', () => {
    expect(classifyItemDomain({ type: 'event', content: 'band show', metadata: { domain: 'events' } })).toBe('events');
  });
});
