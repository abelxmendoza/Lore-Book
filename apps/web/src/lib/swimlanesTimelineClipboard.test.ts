import { describe, expect, it } from 'vitest';
import type { LifeArc } from '../hooks/useLifeArcs';
import type { ChronologyEntry } from '../types/timelineV2';
import {
  SWIMLANES_ARCHITECTURE_LEGEND,
  buildArcForest,
  buildSwimlanesTimelineClipboardText,
  flattenLifeArcs,
} from './swimlanesTimelineClipboard';

function arc(partial: Partial<LifeArc> & Pick<LifeArc, 'id' | 'title'>): LifeArc {
  return {
    arc_type: 'work',
    track: 'career',
    dominant_emotion: null,
    emotional_arc: null,
    parent_id: null,
    start_date: '2024-01-01',
    end_date: '2024-12-01',
    is_active: false,
    summary: 'Built MemoVault',
    confidence: 0.8,
    source: 'inferred',
    tags: ['work'],
    ...partial,
  };
}

function entry(partial: Partial<ChronologyEntry> & Pick<ChronologyEntry, 'id' | 'start_time'>): ChronologyEntry {
  return {
    user_id: 'u1',
    journal_entry_id: 'j1',
    time_precision: 'day',
    time_confidence: 0.9,
    content: 'Shipped a release\nWith a second line of detail.',
    timeline_memberships: [],
    ...partial,
  };
}

describe('swimlanesTimelineClipboard nesting', () => {
  const child = arc({
    id: 'a-child',
    title: 'Launch sprint',
    parent_id: 'a-parent',
    start_date: '2024-03-01',
    end_date: '2024-04-01',
    summary: 'Two-week push',
  });
  const parent = arc({
    id: 'a-parent',
    title: 'Vanguard Robotics',
    track: 'career',
    children: [child],
    metadata: { role: 'contractor' },
  });

  it('flattens and rebuilds parent → child forests', () => {
    expect(flattenLifeArcs([parent]).map((a) => a.id)).toEqual(['a-parent', 'a-child']);
    const forest = buildArcForest([parent]);
    expect(forest).toHaveLength(1);
    expect(forest[0].children?.[0]?.title).toBe('Launch sprint');
  });

  it('exports nested children, metadata, and full moment text in a readable outline', () => {
    const moment = entry({
      id: 'e1',
      start_time: '2024-03-15T12:00:00.000Z',
      title: 'Release day',
      tags: ['ship'],
    });
    const text = buildSwimlanesTimelineClipboardText({
      scaleId: 'year',
      scaleLabel: 'Year',
      zoom: 0.73,
      pixelsPerDay: 2.19,
      timelineStartIso: '2023-01-01T00:00:00.000Z',
      todayIso: '2026-07-25T00:00:00.000Z',
      totalDays: 1300,
      totalWidthPx: 2847,
      clusterPx: 52,
      showEraBands: true,
      eras: [
        {
          id: 'era-1',
          label: 'Early career',
          startDate: '2023-01-01',
          endDate: '2025-01-01',
        },
      ],
      tracks: ['career', 'inner'],
      arcs: [parent],
      arcsByTrack: { career: [parent], inner: [] },
      drawableArcsByTrack: { career: [parent], inner: [] },
      subLaneByTrack: { career: new Map([['a-parent', 0]]) },
      gapsByTrack: { career: [] },
      entries: [moment],
      clusters: [{ key: 'e1', x: 400, entries: [moment] }],
      unresolvedItems: [],
      viewportScrollLeftPx: 120,
      viewportWidthPx: 860,
      xOf: (d) => {
        const t = typeof d === 'string' ? new Date(d).getTime() : d.getTime();
        return Math.round((t - Date.parse('2023-01-01T00:00:00.000Z')) / 86_400_000);
      },
    });

    expect(text).toContain('# Omni Swimlanes Timeline — Copy all');
    expect(text).toContain(SWIMLANES_ARCHITECTURE_LEGEND.split('\n')[0]);
    expect(text).toContain('[ARC] Vanguard Robotics');
    expect(text).toContain('[CHILD] Launch sprint');
    expect(text).toContain('Nested children (1):');
    expect(text).toContain('role: contractor');
    expect(text).toContain('[MOMENT] 2024-03-15 — Release day');
    expect(text).toContain('With a second line of detail.');
    expect(text).toContain('## 5. All moments chronological');
    expect(text).toContain('Arcs including nested: 2');
    expect(text).toContain('## Diagnostics');
    expect(text).toContain('no structural errors detected');
    expect(text).toContain('Viewport scroll left px: 120');
    expect(text).toContain('## End of swimlanes export');
  });

  it('reports suppressed bars and actionable structural errors separately', () => {
    const brokenArc = arc({
      id: 'broken',
      title: '',
      start_date: null,
      end_date: null,
      parent_id: 'missing-parent',
    });
    const occasion = arc({
      id: 'occasion',
      title: 'Release party',
      arc_type: 'occasion',
      start_date: '2024-04-01',
      end_date: '2024-04-01',
    });
    const invalidMoment = entry({ id: 'bad-moment', start_time: 'not-a-date', journal_entry_id: '' });
    const text = buildSwimlanesTimelineClipboardText({
      scaleId: 'year',
      scaleLabel: 'Year',
      zoom: 1,
      pixelsPerDay: 3,
      timelineStartIso: '2023-01-01T00:00:00.000Z',
      todayIso: '2026-07-25T00:00:00.000Z',
      totalDays: 1300,
      totalWidthPx: 3900,
      clusterPx: 52,
      showEraBands: false,
      eras: [],
      tracks: ['career'],
      arcs: [brokenArc, occasion],
      arcsByTrack: { career: [brokenArc, occasion] },
      drawableArcsByTrack: { career: [] },
      subLaneByTrack: { career: new Map() },
      gapsByTrack: { career: [] },
      entries: [invalidMoment],
      clusters: [],
      unresolvedItems: [],
      viewportScrollLeftPx: 0,
      viewportWidthPx: 860,
      xOf: () => 0,
    });

    expect(text).toContain('[ERROR] UNTITLED_ARC');
    expect(text).toContain('[ERROR] MISSING_PARENT');
    expect(text).toContain('[WARNING] BAR_SUPPRESSED_MISSING_START_DATE');
    expect(text).toContain('[INFO] BAR_SUPPRESSED_OCCASION');
    expect(text).toContain('[ERROR] INVALID_MOMENT_DATE');
    expect(text).toContain('[ERROR] MOMENT_NOT_CLUSTERED');
    expect(text).toContain('Correction:');
  });
});
