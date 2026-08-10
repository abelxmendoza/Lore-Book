import { describe, expect, it } from 'vitest';
import {
  applyTemporalConfidenceCeiling,
  detectTemporalContradiction,
  evaluateArcEligibility,
  evaluateTimelineEligibility,
  guardTrackFromText,
  projectCanonicalTimeline,
  canonicalTemporalFromLegacy,
  compareCanonicalTemporal,
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

  it('keeps occurrence, mention, and recording clocks independent', () => {
    const temporal = canonicalTemporalFromLegacy({
      id: 'event-1',
      occurredAt: '2026-07-01T00:00:00.000Z',
      mentionedAt: '2026-08-09T10:00:00.000Z',
      recordedAt: '2026-08-09T10:00:01.000Z',
      precision: 'month',
      source: 'user_stated',
      confidence: 0.9,
      expression: 'July 2026',
    });

    expect(temporal.occurred.start).toContain('2026-07');
    expect(temporal.mentionedAt).toContain('2026-08-09');
    expect(temporal.recordedAt).toContain('2026-08-09');
    expect(temporal.occurred.confidence).toBeLessThanOrEqual(0.55);
    expect(temporal.provenance.map((entry) => entry.field)).toEqual(
      expect.arrayContaining(['occurred_at', 'mentioned_at', 'recorded_at']),
    );
  });

  it('orders by occurrence before recording time and leaves unknown occurrence last', () => {
    const laterMentionedOlderEvent = canonicalTemporalFromLegacy({
      occurredAt: '2024-06-01T00:00:00.000Z',
      recordedAt: '2026-08-09T00:00:00.000Z',
      precision: 'month',
      source: 'user_stated',
    });
    const earlierMentionedNewerEvent = canonicalTemporalFromLegacy({
      occurredAt: '2025-01-01T00:00:00.000Z',
      recordedAt: '2025-01-02T00:00:00.000Z',
      precision: 'year',
      source: 'user_stated',
    });
    const unknown = canonicalTemporalFromLegacy({
      occurredAt: null,
      recordedAt: '2023-01-01T00:00:00.000Z',
    });

    const ordered = [unknown, earlierMentionedNewerEvent, laterMentionedOlderEvent]
      .sort(compareCanonicalTemporal);
    expect(ordered).toEqual([laterMentionedOlderEvent, earlierMentionedNewerEvent, unknown]);
  });

  it('excludes identity prompts even when punctuation is missing', () => {
    const result = projectCanonicalTimeline([
      {
        id: 'prompt',
        kind: 'moment',
        sourceId: 'message-1',
        sortTime: '2026-08-09T10:00:00.000Z',
        title: 'What do you remember about me',
        body: 'What do you remember about me',
        sourceKind: 'journal_entry',
        sourceIds: ['message-1'],
        sourceType: 'chat',
        recordedAt: '2026-08-09T10:00:00.000Z',
        occurredAt: null,
        temporalSource: 'recording_fallback',
      },
    ]);
    expect(result.canonical).toHaveLength(0);
    expect(result.excluded[0]?.speechAct).toBe('RECAP_REQUEST');
  });
});
