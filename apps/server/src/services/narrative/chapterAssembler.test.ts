import { describe, expect, it } from 'vitest';

import {
  assembleChaptersFromScenes,
  deriveChapterTitle,
  shouldMergeScenes,
  type ChapterSceneInput,
} from './chapterAssembler';
import { mayPersistChapter } from './chapterSignificance';

function scene(
  id: string,
  title: string,
  opts: Partial<ChapterSceneInput> = {},
): ChapterSceneInput {
  return {
    id,
    title,
    summary: opts.summary ?? title,
    timeStart: opts.timeStart ?? '2026-07-18T14:00:00.000Z',
    timeEnd: opts.timeEnd ?? opts.timeStart ?? '2026-07-18T18:00:00.000Z',
    location: opts.location,
    participants: opts.participants,
    primaryGoal: opts.primaryGoal,
    dominantEmotion: opts.dominantEmotion,
    significanceScore: opts.significanceScore ?? 55,
    promotedEventId: opts.promotedEventId ?? null,
    themes: opts.themes,
  };
}

describe('chapterAssembler', () => {
  it('merges related same-week scenes into one chapter', () => {
    const scenes = [
      scene('s1', 'Costco trip with Abuela', {
        timeStart: '2026-07-18T14:00:00.000Z',
        location: 'Costco',
        participants: ['abuela'],
        primaryGoal: 'errand_visit',
        significanceScore: 60,
        promotedEventId: 'e1',
      }),
      scene('s2', 'Afternoon at Abuela\'s house', {
        timeStart: '2026-07-19T15:00:00.000Z',
        location: "Abuela's house",
        participants: ['abuela'],
        primaryGoal: 'creative_work',
        summary: 'Worked on MemoVault at Abuela\'s house.',
        significanceScore: 58,
      }),
      scene('s3', 'Building MemoVault', {
        timeStart: '2026-07-20T16:00:00.000Z',
        location: "Abuela's house",
        participants: ['abuela'],
        primaryGoal: 'creative_work',
        summary: 'Continued MemoVault development.',
        significanceScore: 50,
      }),
    ];

    expect(shouldMergeScenes(scenes[0], scenes[1])).toBe(true);
    const chapters = assembleChaptersFromScenes(scenes);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].sceneIds).toHaveLength(3);
    expect(chapters[0].eventIds).toContain('e1');
    expect(chapters[0].title.toLowerCase()).not.toContain('captured conversation');
  });

  it('splits when scenes jump across hard time gaps', () => {
    const a = scene('a', 'Met Jamie at Northwind Depot', {
      timeStart: '2026-01-01T12:00:00.000Z',
      participants: ['jamie'],
      location: 'Northwind Depot',
      primaryGoal: 'social_time',
    });
    const b = scene('b', 'Onboarding day', {
      timeStart: '2026-07-01T12:00:00.000Z',
      location: 'Vanguard Robotics',
      primaryGoal: 'career_progress',
      summary: 'Years later I started onboarding at Vanguard Robotics.',
    });
    expect(shouldMergeScenes(a, b)).toBe(false);
    expect(assembleChaptersFromScenes([a, b])).toHaveLength(2);
  });

  it('derives evidence-first chapter titles', () => {
    const title = deriveChapterTitle({
      scenes: [
        scene('s1', 'Costco trip with Abuela', {
          summary: 'Costco then MemoVault at home',
          participants: ['abuela'],
        }),
      ],
      location: "Abuela's house",
      participants: ['abuela'],
      themes: ['creative', 'errands', 'social'],
    });
    expect(title.length).toBeGreaterThan(0);
    expect(title.toLowerCase()).not.toContain('captured conversation');
  });
});

describe('chapterSignificance', () => {
  it('persists multi-scene chapters even when individual scenes are modest', () => {
    const [chapter] = assembleChaptersFromScenes([
      scene('s1', 'Went to Costco', { significanceScore: 40, participants: ['jamie'] }),
      scene('s2', 'Time with Jamie', {
        timeStart: '2026-07-19T12:00:00.000Z',
        significanceScore: 38,
        participants: ['jamie'],
        primaryGoal: 'social_time',
      }),
      scene('s3', 'Worked on MemoVault', {
        timeStart: '2026-07-20T12:00:00.000Z',
        significanceScore: 36,
        participants: ['jamie'],
        primaryGoal: 'creative_work',
      }),
    ]);
    const decision = mayPersistChapter(chapter);
    expect(decision.allow).toBe(true);
    expect(decision.breakdown.sceneCount).toBe(3);
    expect(decision.score).toBeGreaterThanOrEqual(35);
  });

  it('skips a thin single scene with no event', () => {
    const [chapter] = assembleChaptersFromScenes([
      scene('s1', 'Bought snacks', { significanceScore: 12 }),
    ]);
    const decision = mayPersistChapter(chapter);
    expect(decision.allow).toBe(false);
  });
});
