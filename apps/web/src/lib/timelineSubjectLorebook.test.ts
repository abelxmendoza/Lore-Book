import { describe, expect, it } from 'vitest';
import {
  evaluateArcLorebookOffer,
  evaluateTimelineSubjectLorebookOffer,
  inferSubjectDomain,
} from './timelineSubjectLorebook';
import type { LoreReadinessSummary } from './loreReadiness';
import { computeLoreReadiness, EMPTY_CONTENT_STATS } from './loreReadiness';

function makeEvents(count: number, seed = 'career work project') {
  return Array.from({ length: count }, (_, i) => ({
    id: `e-${i}`,
    user_id: 'u1',
    journal_entry_id: `j-${i}`,
    start_time: `2026-0${(i % 9) + 1}-0${(i % 8) + 1}T12:00:00.000Z`,
    time_precision: 'day' as const,
    time_confidence: 1,
    content: `${seed} moment number ${i} with enough words to count toward the volume threshold for lorebook readiness.`,
    timeline_memberships: [],
    title: `Moment ${i}`,
    tags: ['project'],
  }));
}

describe('timelineSubjectLorebook', () => {
  it('infers domain from subject keywords', () => {
    expect(inferSubjectDomain('dating Jamie').domain).toBe('relationships');
    expect(inferSubjectDomain('gym recovery').topicId).toBe('health');
    expect(inferSubjectDomain('MemoVault shipping').scope).toBe('thematic');
  });

  it('enables Create LoreBook when a searched timeline has enough moments', () => {
    const offer = evaluateTimelineSubjectLorebookOffer({
      subject: 'career at Vanguard',
      events: makeEvents(6),
    });
    expect(offer.canCreate).toBe(true);
    expect(offer.prefill.lorebookName).toContain('career at Vanguard');
    expect(offer.reason).toMatch(/Enough/i);
  });

  it('blocks Create LoreBook when the subject is too thin', () => {
    const offer = evaluateTimelineSubjectLorebookOffer({
      subject: 'random topic',
      events: makeEvents(2, 'hello'),
    });
    expect(offer.canCreate).toBe(false);
    expect(offer.reason).toMatch(/Need/i);
  });

  it('allows domain-boosted creation when biography readiness already covers that domain', () => {
    const readiness: LoreReadinessSummary = computeLoreReadiness({
      ...EMPTY_CONTENT_STATS,
      totalNarrativeAtoms: 40,
      totalJournalEntries: 20,
      domainCoverage: [{ domain: 'professional', atomCount: 20, entryCount: 10 }],
    });
    const offer = evaluateTimelineSubjectLorebookOffer({
      subject: 'work with Jeff',
      events: makeEvents(3, 'work job career office'),
      readiness,
    });
    expect(offer.canCreate).toBe(true);
    expect(offer.domain.topicId).toBe('professional');
  });

  it('evaluates swimlane arcs against overlapping chronology', () => {
    const offer = evaluateArcLorebookOffer({
      arc: {
        id: 'arc-1',
        title: 'Robotics chapter',
        arc_type: 'work',
        track: 'career',
        dominant_emotion: null,
        emotional_arc: null,
        parent_id: null,
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        is_active: true,
        summary: 'Building robots at work',
        confidence: 0.8,
        source: 'inferred',
        tags: ['career'],
      },
      entries: makeEvents(6, 'work career office'),
    });
    expect(offer.canCreate).toBe(true);
    expect(offer.prefill.scope).toBe('time_range');
  });
});
