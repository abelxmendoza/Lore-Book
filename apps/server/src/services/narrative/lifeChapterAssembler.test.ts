import { describe, expect, it } from 'vitest';

import {
  DOMAIN_LABELS,
  LIFE_CHAPTER_HARD_GAP_MS,
  assembleLifeChaptersFromStorylines,
  storylineRowToLifeChapterInput,
  type LifeChapterStorylineInput,
} from './lifeChapterAssembler';
import type { NarrativeDomain } from './narrativeIdentity';

function storyline(
  id: string,
  title: string,
  domain: NarrativeDomain,
  opts: Partial<LifeChapterStorylineInput> = {},
): LifeChapterStorylineInput {
  return {
    id,
    title,
    summary: opts.summary ?? title,
    domain,
    timeStart: opts.timeStart ?? '2026-06-01T12:00:00.000Z',
    timeEnd: opts.timeEnd ?? opts.timeStart ?? '2026-06-01T12:00:00.000Z',
    location: opts.location ?? null,
    participants: opts.participants ?? [],
    sceneIds: opts.sceneIds ?? [`scene-${id}`],
    eventIds: opts.eventIds ?? [],
    themes: opts.themes ?? [domain],
    significanceScore: opts.significanceScore ?? 55,
    dominantEmotion: opts.dominantEmotion ?? null,
  };
}

describe('lifeChapterAssembler', () => {
  it('groups every storyline in a domain into one chapter regardless of subject', () => {
    const storylines = [
      storyline('s1', 'Getting Hired at Northwind Robotics', 'career', {
        timeStart: '2026-01-05T12:00:00.000Z',
      }),
      storyline('s2', 'Learning the Onboarding Systems', 'career', {
        timeStart: '2026-02-10T12:00:00.000Z',
      }),
    ];

    const chapters = assembleLifeChaptersFromStorylines(storylines);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].domain).toBe('career');
    expect(chapters[0].title).toBe(DOMAIN_LABELS.career);
    expect(chapters[0].storylineIds.sort()).toEqual(['s1', 's2']);
  });

  it('keeps different domains in separate chapters', () => {
    const storylines = [
      storyline('s1', 'Building the Timeline Engine', 'creative'),
      storyline('s2', 'Time with Abuela', 'family'),
    ];

    const chapters = assembleLifeChaptersFromStorylines(storylines);
    expect(chapters).toHaveLength(2);
    const domains = chapters.map((c) => c.domain).sort();
    expect(domains).toEqual(['creative', 'family']);
    expect(chapters.find((c) => c.domain === 'creative')?.title).toBe('Creative Work');
    expect(chapters.find((c) => c.domain === 'family')?.title).toBe('Family');
  });

  it('splits the same domain into a new chapter after a long dormancy', () => {
    const gapMs = LIFE_CHAPTER_HARD_GAP_MS + 10 * 24 * 60 * 60 * 1000;
    const start = Date.parse('2025-01-01T12:00:00.000Z');
    const resumed = new Date(start + gapMs).toISOString();

    const storylines = [
      storyline('s1', 'Training for the Regional Meet', 'health', { timeStart: '2025-01-01T12:00:00.000Z' }),
      storyline('s2', 'Getting Back into Training', 'health', { timeStart: resumed }),
    ];

    const chapters = assembleLifeChaptersFromStorylines(storylines);
    expect(chapters).toHaveLength(2);
    expect(chapters.every((c) => c.domain === 'health')).toBe(true);
  });

  it('does not split the same domain across an ordinary storyline-level gap', () => {
    const storylines = [
      storyline('s1', 'Shipping the First Release', 'creative', { timeStart: '2026-01-01T12:00:00.000Z' }),
      storyline('s2', 'Fixing Feedback After Launch', 'creative', { timeStart: '2026-02-01T12:00:00.000Z' }),
    ];
    const chapters = assembleLifeChaptersFromStorylines(storylines);
    expect(chapters).toHaveLength(1);
  });

  it('maps a persisted storyline row to input, preferring ownership domain over themes', () => {
    const input = storylineRowToLifeChapterInput({
      id: 's1',
      title: 'Falling out with a friend',
      summary: 'A falling out.',
      time_start: '2026-01-01T12:00:00.000Z',
      time_end: null,
      themes: ['friends'],
      metadata: { ownership: { domain: 'romance' } },
    });
    expect(input.domain).toBe('romance');
  });

  it('falls back to themes, then unknown, when ownership metadata is missing', () => {
    const withThemes = storylineRowToLifeChapterInput({
      id: 's1',
      title: 'A road trip',
      summary: 'Went on a trip.',
      time_start: null,
      time_end: null,
      themes: ['travel'],
    });
    expect(withThemes.domain).toBe('travel');

    const withNothing = storylineRowToLifeChapterInput({
      id: 's2',
      title: 'Untitled',
      summary: '',
      time_start: null,
      time_end: null,
    });
    expect(withNothing.domain).toBe('unknown');
  });
});
