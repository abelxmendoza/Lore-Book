import { describe, expect, it } from 'vitest';
import {
  applyTemporalConfidenceCeiling,
  detectTemporalContradiction,
  evaluateArcEligibility,
  evaluateTimelineEligibility,
  guardTrackFromText,
  projectCanonicalTimeline,
  suggestedOccurrenceIso,
} from './index';
import type { TemporalEvidence } from '../temporal/temporalEvidence';

describe('chronologyAuthority', () => {
  it('never keeps exact+high confidence for recording_fallback', () => {
    const e: TemporalEvidence = {
      start: '2023-01-01T00:00:00.000Z',
      end: null,
      timezone: null,
      precision: 'exact',
      source: 'recording_fallback',
      status: 'anchored',
      confidence: 1,
      expression: null,
    };
    const capped = applyTemporalConfidenceCeiling(e);
    expect(capped.precision).not.toBe('exact');
    expect(capped.confidence).toBeLessThanOrEqual(0.2);
  });

  it('detects January 1 fallback vs July body text', () => {
    const c = detectTemporalContradiction({
      recordId: 'e1',
      storedOccurrence: '2026-01-01T00:00:00.000Z',
      title: 'Catch One after Anime Expo',
      summary: 'User went to Catch One after Anime Expo on July 4, 2026',
    });
    expect(c?.contradictionType).toBe('JANUARY_FIRST_FALLBACK');
    expect(suggestedOccurrenceIso(c!)).toContain('2026-07-04');
  });

  it('detects year mismatch', () => {
    const c = detectTemporalContradiction({
      recordId: 'e2',
      storedOccurrence: '2023-01-01T00:00:00.000Z',
      title: 'Started at Northwind Labs',
      summary: 'Started working at Northwind Labs in June 2026',
    });
    expect(c?.contradictionType).toMatch(/YEAR_MISMATCH|JANUARY_FIRST_FALLBACK/);
  });

  it('excludes recap and correction speech acts from Omni', () => {
    const recap = evaluateTimelineEligibility({
      text: 'Recap everything we discussed in this thread',
      title: 'Recap Everything We Discussed In This Thread',
    });
    expect(recap.eligible).toBe(false);
    expect(recap.speechAct).toBe('RECAP_REQUEST');

    const correction = evaluateTimelineEligibility({
      text: 'You have Goth Tio in Love and Relationships. He is more like a friend. Please change his status.',
      title: 'Relationship correction',
    });
    expect(correction.eligible).toBe(false);
    expect(correction.speechAct).toBe('CORRECTION');
  });

  it('demotes zero-day occasions from arc bars', () => {
    const gate = evaluateArcEligibility({
      arcType: 'occasion',
      startDate: '2026-07-03',
      endDate: '2026-07-03',
      title: 'Testing chat',
    });
    expect(gate.eligible).toBe(false);
    expect(gate.renderAs).toBe('event');
  });

  it('routes nightlife away from career and band away from romance', () => {
    expect(
      guardTrackFromText(
        'career',
        'A Night at First Street Pool and Billiards and Neon Harbor Club',
        null,
      ),
    ).not.toBe('career');
    expect(
      guardTrackFromText('romance', 'Went to see Ex Lover perform at the club', null),
    ).not.toBe('romance');
  });

  it('collapses journal evidence under resolved events and marks recovered unresolved', () => {
    const result = projectCanonicalTimeline([
      {
        id: 'ev1',
        kind: 'event',
        sourceId: 're-1',
        sortTime: '2026-06-04T12:00:00.000Z',
        title: 'Shopping Trip to Costco with Marcus',
        body: 'I went to Costco with Marcus',
        sourceKind: 'resolved_event',
        sourceIds: ['re-1'],
        sourceType: 'resolved_event',
        timePrecision: 'date',
        timeConfidence: 0.9,
        temporalSource: 'user_stated',
      },
      {
        id: 'j1',
        kind: 'moment',
        sourceId: 'je-1',
        sortTime: '2026-06-04T12:00:00.000Z',
        title: 'I went to Costco with Marcus',
        body: 'I went to Costco with Marcus today',
        sourceKind: 'journal_entry',
        sourceIds: ['je-1'],
        sourceType: 'journal',
        timePrecision: 'exact',
        timeConfidence: 1,
      },
      {
        id: 'rec1',
        kind: 'event',
        sourceId: 're-2',
        sortTime: '2026-06-16T04:15:39.000Z',
        title: 'Recovered memory batch',
        body: 'Imported blob',
        sourceKind: 'resolved_event',
        sourceIds: ['re-2'],
        sourceType: 'resolved_event',
        tags: ['recovered'],
        timePrecision: 'exact',
        timeConfidence: 1,
        temporalSource: 'recording_fallback',
      },
      {
        id: 'recap',
        kind: 'event',
        sourceId: 're-3',
        sortTime: '2026-07-03T12:00:00.000Z',
        title: 'Recap Everything We Discussed In This Thread',
        body: 'Recap everything we discussed',
        sourceKind: 'resolved_event',
        sourceIds: ['re-3'],
        sourceType: 'resolved_event',
      },
    ]);

    expect(result.evidenceHidden).toBeGreaterThanOrEqual(1);
    expect(result.canonical.some((i) => i.id === 'ev1')).toBe(true);
    expect(result.canonical.some((i) => i.id === 'j1')).toBe(false);
    expect(result.unresolved.some((i) => i.id === 'rec1')).toBe(true);
    expect(result.excluded.some((i) => i.id === 'recap')).toBe(true);
    expect(result.unresolved.find((i) => i.id === 'rec1')?.timeConfidence).toBeLessThanOrEqual(0.2);
  });
});
