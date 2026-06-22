import { describe, it, expect } from 'vitest';

import { summaryHasProvenance } from '../../../src/services/consolidation/consolidationProvenanceService';
import { consolidateMemories } from '../../../src/services/consolidation/memoryConsolidationService';
import type { ConsolidationEvidenceFragment } from '../../../src/services/consolidation/consolidationTypes';
import { normalizeClaimKey } from '../../../src/services/consolidation/consolidationTypes';
import { timelineOrderPreserved } from '../../../src/services/consolidation/timelineSummaryConsolidator';

function frag(
  partial: Partial<ConsolidationEvidenceFragment> & Pick<ConsolidationEvidenceFragment, 'id' | 'text'>,
): ConsolidationEvidenceFragment {
  const claimKey = partial.claimKey ?? normalizeClaimKey(partial.text);
  return {
    claimKey,
    entityIds: [],
    entityNames: [],
    anchorIds: [],
    anchorTitles: [],
    eraLabels: [],
    relationshipLabels: [],
    sourceQuote: partial.text,
    truthState: 'candidate',
    confidence: 0.85,
    sensitiveCategories: [],
    kind: 'general',
    ...partial,
  };
}

describe('memory consolidation rules', () => {
  const bryanClaim = normalizeClaimKey('Bryan Oconner is my best friend');

  it('repeated Bryan facts consolidate', () => {
    const fragments = Array.from({ length: 5 }, (_, i) =>
      frag({
        id: `bryan-${i}`,
        text: 'Bryan Oconner is my best friend',
        claimKey: bryanClaim,
        entityNames: ['Bryan Oconner'],
        relationshipLabels: ['best friend'],
        sourceMessageId: `msg-${i}`,
        kind: 'relationship',
      }),
    );

    const result = consolidateMemories({ fragments });
    const bryanSummary = result.summaries.find((s) => s.summaryText.includes('Bryan'));
    expect(bryanSummary).toBeDefined();
    expect(bryanSummary!.mentionCount).toBe(5);
    expect(bryanSummary!.summaryText).toMatch(/closest middle-school friends/i);
    expect(result.fragmentsPreserved).toBe(5);
  });

  it('provenance preserved', () => {
    const fragments = [
      frag({
        id: 'f1',
        text: 'Bryan Oconner is my best friend',
        claimKey: bryanClaim,
        entityNames: ['Bryan Oconner'],
        sourceMessageId: 'msg-a',
        sourceQuote: 'Bryan Oconner is my best friend.',
      }),
      frag({
        id: 'f2',
        text: 'Bryan Oconner is my best friend',
        claimKey: bryanClaim,
        entityNames: ['Bryan Oconner'],
        sourceMessageId: 'msg-b',
        sourceQuote: 'Still best friends with Bryan.',
      }),
    ];

    const result = consolidateMemories({ fragments });
    const summary = result.summaries.find((s) => s.summaryText.includes('Bryan'));
    expect(summary).toBeDefined();
    expect(summaryHasProvenance(summary!)).toBe(true);
    expect(summary!.sourceMessageIds).toContain('msg-a');
    expect(summary!.sourceMessageIds).toContain('msg-b');
    expect(summary!.sourceFragmentIds).toEqual(expect.arrayContaining(['f1', 'f2']));
  });

  it('contradictions not merged', () => {
    const fragments = [
      frag({
        id: 'f-good',
        text: 'Bryan Oconner is my best friend',
        claimKey: bryanClaim,
        entityNames: ['Bryan Oconner'],
        relationshipLabels: ['best friend'],
        sourceMessageId: 'msg-1',
      }),
      frag({
        id: 'f-bad',
        text: 'Bryan was my enemy in middle school',
        claimKey: normalizeClaimKey('Bryan enemy'),
        entityNames: ['Bryan Oconner'],
        relationshipLabels: ['enemy'],
        sourceMessageId: 'msg-2',
      }),
    ];

    const result = consolidateMemories({ fragments });
    expect(result.contradictions.length).toBeGreaterThan(0);
    expect(result.contradictions[0].requiresReview).toBe(true);
    const mergedEnemy = result.summaries.some((s) => s.summaryText.includes('enemy'));
    expect(mergedEnemy).toBe(false);
  });

  it('timeline order respected', () => {
    const fragments = [
      frag({
        id: 't1',
        text: 'Started at Northwind Middle School',
        eraLabels: ['middle school'],
        eventAt: '2008-09-01',
        kind: 'timeline',
        sourceMessageId: 'msg-t1',
      }),
      frag({
        id: 't2',
        text: 'Joined school band',
        eraLabels: ['middle school'],
        eventAt: '2009-01-15',
        kind: 'timeline',
        sourceMessageId: 'msg-t2',
      }),
      frag({
        id: 't3',
        text: 'Graduated middle school',
        eraLabels: ['middle school'],
        eventAt: '2011-06-01',
        kind: 'timeline',
        sourceMessageId: 'msg-t3',
      }),
    ];

    expect(timelineOrderPreserved(fragments)).toBe(true);
    const result = consolidateMemories({ fragments });
    const timeline = result.summaries.find(
      (s) => s.kind === 'timeline' && s.summaryText.includes('→'),
    );
    expect(timeline).toBeDefined();
    expect(timeline!.timelineOrdered).toBe(true);
    const idxStart = timeline!.summaryText.indexOf('Started');
    const idxBand = timeline!.summaryText.indexOf('band');
    const idxGrad = timeline!.summaryText.indexOf('Graduated');
    expect(idxStart).toBeLessThan(idxBand);
    expect(idxBand).toBeLessThan(idxGrad);
  });

  it('sensitive summary review-first', () => {
    const fragments = [
      frag({
        id: 'sens-1',
        text: 'Jamie and I had a huge fight about money',
        entityNames: ['Jamie'],
        relationshipLabels: ['partner'],
        sensitiveCategories: ['romantic', 'conflict', 'finance'],
        kind: 'relationship',
        sourceMessageId: 'msg-sens',
        truthState: 'review_required',
      }),
    ];

    const result = consolidateMemories({ fragments });
    const summary = result.summaries.find((s) => s.summaryText.includes('Jamie'));
    expect(summary).toBeDefined();
    expect(summary!.reviewRequired).toBe(true);
  });

  it('rejected evidence excluded', () => {
    const fragments = [
      frag({
        id: 'rej-1',
        text: 'Bryan was my enemy',
        entityNames: ['Bryan Oconner'],
        truthState: 'rejected',
        sourceMessageId: 'msg-rej',
      }),
      frag({
        id: 'ok-1',
        text: 'Bryan Oconner is my best friend',
        claimKey: bryanClaim,
        entityNames: ['Bryan Oconner'],
        sourceMessageId: 'msg-ok',
      }),
    ];

    const result = consolidateMemories({ fragments });
    expect(result.rejectedExcluded).toBe(1);
    expect(result.summaries.every((s) => !s.summaryText.includes('enemy'))).toBe(true);
  });

  it('corrected evidence wins', () => {
    const fragments = [
      frag({
        id: 'old-name',
        text: 'Person name is Bryan Oconner',
        entityNames: ['Bryan Oconner'],
        supersededById: 'new-name',
        sourceMessageId: 'msg-old',
      }),
      frag({
        id: 'new-name',
        text: "Person name is Bryan O'Connor",
        entityNames: ["Bryan O'Connor"],
        correctedFromId: 'old-name',
        truthState: 'user_confirmed',
        sourceMessageId: 'msg-correct',
      }),
    ];

    const result = consolidateMemories({ fragments });
    expect(result.supersededExcluded).toBe(1);
    expect(result.summaries.some((s) => s.summaryText.includes("O'Connor"))).toBe(true);
    expect(result.summaries.some((s) => s.summaryText.includes('Oconner'))).toBe(false);
  });
});
