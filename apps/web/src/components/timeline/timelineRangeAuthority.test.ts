import { describe, expect, it } from 'vitest';
import type { ChronologyEntry } from '../../types/timelineV2';
import type { LifeArc } from '../../hooks/useLifeArcs';
import {
  computeReliableTimelineSpan,
  defaultScaleForSpanDays,
  shouldDrawSwimlaneArcBar,
} from './timelineRangeAuthority';

function entry(partial: Partial<ChronologyEntry> & Pick<ChronologyEntry, 'id' | 'start_time'>): ChronologyEntry {
  return {
    user_id: 'u',
    journal_entry_id: 'j',
    time_precision: 'day',
    time_confidence: 0.9,
    content: 'x',
    timeline_memberships: [],
    ...partial,
  };
}

function arc(partial: Partial<LifeArc> & Pick<LifeArc, 'id' | 'title'>): LifeArc {
  return {
    arc_type: 'work',
    track: 'career',
    dominant_emotion: null,
    emotional_arc: null,
    parent_id: null,
    start_date: '2026-06-24',
    end_date: '2026-07-23',
    is_active: true,
    summary: null,
    confidence: 0.8,
    source: 'inferred',
    tags: [],
    ...partial,
  };
}

describe('timelineRangeAuthority', () => {
  it('ignores low-confidence 2023 outliers when computing canvas span', () => {
    const span = computeReliableTimelineSpan(
      [
        entry({
          id: 'bad',
          start_time: '2023-01-01T00:00:00.000Z',
          time_precision: 'year',
          time_confidence: 0.2,
          tags: ['recovered'],
        }),
        entry({ id: 'good1', start_time: '2026-06-04T12:00:00.000Z' }),
        entry({ id: 'good2', start_time: '2026-07-18T12:00:00.000Z' }),
      ],
      [arc({ id: 'a1', title: 'Work' })],
      new Date('2026-07-25T12:00:00.000Z'),
    );
    expect(span.start.getFullYear()).toBe(2026);
    expect(span.spanDays).toBeLessThan(120);
  });

  it('anchors to real history instead of collapsing to 45 days when nothing is "reliable"', () => {
    // Months-old, low-confidence/imported entries with no reliable arcs to
    // anchor on — this used to fall back to today-45d, clipping all of it
    // off the visible canvas.
    const span = computeReliableTimelineSpan(
      [
        entry({
          id: 'old1',
          start_time: '2026-04-02T00:00:00.000Z',
          time_precision: 'year',
          time_confidence: 0.3,
          tags: ['imported'],
        }),
        entry({
          id: 'old2',
          start_time: '2026-05-15T00:00:00.000Z',
          time_precision: 'year',
          time_confidence: 0.3,
          tags: ['imported'],
        }),
      ],
      [],
      new Date('2026-07-25T12:00:00.000Z'),
    );
    expect(span.usedFallback).toBe(true);
    expect(span.start.getTime()).toBeLessThan(new Date('2026-04-02T00:00:00.000Z').getTime());
    expect(span.spanDays).toBeGreaterThan(45);
  });

  it('still falls back to the last 45 days when there is no history at all', () => {
    const span = computeReliableTimelineSpan([], [], new Date('2026-07-25T12:00:00.000Z'));
    expect(span.usedFallback).toBe(true);
    expect(span.spanDays).toBe(45);
  });

  it('picks month scale for ~7 week reliable spans', () => {
    expect(defaultScaleForSpanDays(50)).toBe('season');
    expect(defaultScaleForSpanDays(30)).toBe('month');
  });

  it('does not draw zero-day occasions as bars', () => {
    expect(
      shouldDrawSwimlaneArcBar(
        arc({
          id: 'o1',
          title: 'Day cluster',
          arc_type: 'occasion',
          start_date: '2026-07-03',
          end_date: '2026-07-03',
        }),
      ),
    ).toBe(false);
  });
});
