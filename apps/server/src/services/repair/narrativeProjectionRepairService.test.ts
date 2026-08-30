import { describe, expect, it } from 'vitest';

import { auditNarrativeProjectionRows } from './narrativeProjectionRepairService';

const baseDates = {
  time_start: '2026-01-01T00:00:00.000Z',
  time_end: '2026-01-31T00:00:00.000Z',
  created_at: '2026-02-01T00:00:00.000Z',
  updated_at: '2026-02-02T00:00:00.000Z',
};

function storyline(overrides: Record<string, unknown> = {}) {
  return {
    id: 'storyline-a',
    user_id: 'user-a',
    title: 'Building a product',
    summary: 'A focused product-building season.',
    primary_subject: 'MemoVault',
    domain: 'creative',
    ...baseDates,
    scene_ids: ['scene-a', 'scene-b'],
    event_ids: ['event-a'],
    significance_score: 80,
    confidence: 0.8,
    ...overrides,
  };
}

describe('narrative projection repair audit', () => {
  it('reports overlapping storylines and selects a deterministic survivor', () => {
    const report = auditNarrativeProjectionRows({
      userId: 'user-a',
      storylines: [
        storyline(),
        storyline({
          id: 'storyline-b',
          scene_ids: ['scene-a', 'scene-b', 'scene-c'],
          significance_score: 40,
          updated_at: '2026-02-03T00:00:00.000Z',
        }),
      ],
    });

    expect(report.counts.duplicate_storyline).toBe(1);
    expect(report.findings[0]).toMatchObject({
      kind: 'duplicate_storyline',
      id: 'storyline-b',
      relatedId: 'storyline-a',
      reversible: true,
    });
  });

  it('does not merge separate domains with similar titles', () => {
    const report = auditNarrativeProjectionRows({
      userId: 'user-a',
      storylines: [
        storyline({ id: 'career', primary_subject: 'Northwind Labs', domain: 'career' }),
        storyline({
          id: 'learning',
          primary_subject: 'Northwind Labs',
          domain: 'education',
          title: 'Learning a product',
          scene_ids: ['different-scene'],
          event_ids: ['different-event'],
        }),
      ],
    });

    expect(report.counts.duplicate_storyline).toBe(0);
  });

  it('reports parent arrays that reference missing projection rows', () => {
    const report = auditNarrativeProjectionRows({
      userId: 'user-a',
      storylines: [storyline()],
      lifeChapters: [{
        id: 'life-chapter-a',
        user_id: 'user-a',
        domain: 'creative',
        title: 'Product work',
        summary: 'Product work.',
        ...baseDates,
        storyline_ids: ['missing-storyline'],
        scene_ids: [],
        event_ids: [],
        confidence: 0.7,
      }],
      eras: [{
        id: 'era-a',
        user_id: 'user-a',
        title: 'A season of work',
        summary: 'A season of work.',
        ...baseDates,
        chapter_ids: ['missing-life-chapter'],
        scene_ids: [],
        event_ids: [],
        confidence: 0.7,
        is_current: true,
      }],
    });

    expect(report.counts.stale_life_chapter_membership).toBe(1);
    expect(report.counts.stale_storyline_membership).toBe(1);
  });
});
