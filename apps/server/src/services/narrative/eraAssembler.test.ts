import { describe, expect, it } from 'vitest';

import {
  assembleErasFromChapters,
  deriveEraTitle,
  shouldMergeChapters,
  type EraChapterInput,
} from './eraAssembler';
import { mayPersistEra } from './eraSignificance';

function chapter(
  id: string,
  title: string,
  opts: Partial<EraChapterInput> = {},
): EraChapterInput {
  return {
    id,
    title,
    summary: opts.summary ?? title,
    thesis: opts.thesis,
    timeStart: opts.timeStart ?? '2026-07-01T12:00:00.000Z',
    timeEnd: opts.timeEnd ?? opts.timeStart ?? '2026-07-14T12:00:00.000Z',
    location: opts.location,
    participants: opts.participants,
    themes: opts.themes,
    sceneIds: opts.sceneIds ?? [`scene-${id}`],
    eventIds: opts.eventIds ?? [],
    significanceScore: opts.significanceScore ?? 55,
    dominantEmotion: opts.dominantEmotion,
  };
}

describe('eraAssembler', () => {
  it('merges related months of chapters into one era', () => {
    const chapters = [
      chapter('c1', 'Costco chapter with Abuela', {
        timeStart: '2026-06-01T12:00:00.000Z',
        participants: ['abuela'],
        themes: ['errands', 'social'],
        location: 'Costco',
        eventIds: ['e1'],
      }),
      chapter('c2', 'Building MemoVault', {
        timeStart: '2026-06-20T12:00:00.000Z',
        participants: ['abuela'],
        themes: ['creative', 'social'],
        location: "Abuela's house",
        summary: 'MemoVault days at Abuela\'s house.',
        eventIds: ['e2'],
      }),
      chapter('c3', 'MemoVault progress', {
        timeStart: '2026-07-10T12:00:00.000Z',
        participants: ['abuela'],
        themes: ['creative'],
        location: "Abuela's house",
      }),
    ];

    expect(shouldMergeChapters(chapters[0], chapters[1])).toBe(true);
    const eras = assembleErasFromChapters(chapters);
    expect(eras).toHaveLength(1);
    expect(eras[0].chapterIds).toHaveLength(3);
    expect(eras[0].title.toLowerCase()).not.toContain('captured conversation');
  });

  it('splits when chapters jump across hard gaps', () => {
    const a = chapter('a', 'Met Jamie at Northwind Depot', {
      timeStart: '2025-01-01T12:00:00.000Z',
      participants: ['jamie'],
      themes: ['social'],
      location: 'Northwind Depot',
    });
    const b = chapter('b', 'Onboarding at Vanguard Robotics', {
      timeStart: '2026-07-01T12:00:00.000Z',
      themes: ['career'],
      location: 'Vanguard Robotics',
      summary: 'Years later I started onboarding at Vanguard Robotics.',
    });
    expect(shouldMergeChapters(a, b)).toBe(false);
    expect(assembleErasFromChapters([a, b])).toHaveLength(2);
  });

  it('derives evidence-first era titles', () => {
    const title = deriveEraTitle({
      chapters: [
        chapter('c1', 'Onboarding day', {
          summary: 'Started at Vanguard Robotics',
          themes: ['career'],
        }),
      ],
      location: 'Vanguard Robotics',
      participants: [],
      themes: ['career'],
    });
    expect(title.toLowerCase()).toMatch(/vanguard|robotics|era|onboarding/);
    expect(title.toLowerCase()).not.toContain('captured conversation');
  });

  it('names multi-chapter eras by season themes, not the loudest venue night', () => {
    const title = deriveEraTitle({
      chapters: [
        chapter('c1', 'Family life', {
          themes: ['family'],
          significanceScore: 24,
        }),
        chapter('c2', 'Nights out', {
          themes: ['social_scene'],
          significanceScore: 23,
        }),
        chapter('c3', 'Nights out at Velvet Room', {
          themes: ['social_scene'],
          significanceScore: 26,
          summary: 'One club night.',
        }),
      ],
      location: 'Velvet Room',
      participants: [],
      themes: ['family', 'social_scene'],
    });
    expect(title.toLowerCase()).toMatch(/season/);
    expect(title.toLowerCase()).not.toContain('velvet room');
  });
});

describe('eraSignificance', () => {
  it('persists multi-chapter eras', () => {
    const [era] = assembleErasFromChapters([
      chapter('c1', 'Time with Jamie', {
        significanceScore: 42,
        participants: ['jamie'],
        themes: ['social'],
        eventIds: ['e1'],
      }),
      chapter('c2', 'Worked on MemoVault', {
        timeStart: '2026-07-20T12:00:00.000Z',
        significanceScore: 44,
        participants: ['jamie'],
        themes: ['creative', 'social'],
        eventIds: ['e2'],
      }),
    ]);
    const decision = mayPersistEra(era);
    expect(decision.allow).toBe(true);
    expect(decision.breakdown.chapterCount).toBe(2);
  });

  it('skips a thin single chapter with little evidence', () => {
    const [era] = assembleErasFromChapters([
      chapter('c1', 'Bought snacks', {
        significanceScore: 20,
        sceneIds: ['s1'],
        eventIds: [],
      }),
    ]);
    const decision = mayPersistEra(era);
    expect(decision.allow).toBe(false);
  });

  it('persists a single chapter that already spans multiple scenes', () => {
    const [era] = assembleErasFromChapters([
      chapter('c1', 'Northwind Depot day with Jamie', {
        significanceScore: 34,
        sceneIds: ['s1', 's2', 's3', 's4'],
        eventIds: [],
        participants: ['jamie'],
        themes: ['social'],
      }),
    ]);
    const decision = mayPersistEra(era);
    expect(decision.allow).toBe(true);
  });
});
