import { describe, expect, it } from 'vitest';

import {
  assembleChaptersFromScenes,
  classifySceneNarrative,
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

/**
 * The mixed week that motivated the identity-first redesign: a breakup beat,
 * an errand with family, duplicate club nights, a different romance, and
 * creative work — previously all glued into one index-like chapter.
 */
function mixedWeek(): ChapterSceneInput[] {
  return [
    scene('s-date', 'Date night with Rina', {
      timeStart: '2026-07-10T20:00:00.000Z',
      participants: ['rina'],
      significanceScore: 62,
    }),
    scene('s-app', 'Building MemoVault', {
      timeStart: '2026-07-14T16:00:00.000Z',
      summary: 'Stayed home working on MemoVault all afternoon.',
      significanceScore: 50,
    }),
    scene('s-club-1', 'Went to Neon Palace', {
      timeStart: '2026-07-15T04:00:00.000Z',
      location: 'Neon Palace',
      summary: 'Danced all night at the club.',
      significanceScore: 44,
    }),
    scene('s-club-2', 'Went to Neon Palace', {
      timeStart: '2026-07-15T05:00:00.000Z',
      location: 'Neon Palace',
      summary: 'Danced all night at the club.',
      significanceScore: 40,
    }),
    scene('s-club-3', 'Visit to Neon Palace', {
      timeStart: '2026-07-16T04:00:00.000Z',
      location: 'Neon Palace',
      summary: 'Another night dancing at the club.',
      significanceScore: 41,
    }),
    scene('s-mara', 'Hooked up with Mara at the afters', {
      timeStart: '2026-07-16T07:00:00.000Z',
      participants: ['mara'],
      significanceScore: 58,
    }),
    scene('s-grocer', 'Grocery run with Grandma', {
      timeStart: '2026-07-16T18:00:00.000Z',
      participants: ['grandma'],
      significanceScore: 45,
    }),
    scene('s-blocked', 'Rina blocked me on Instagram', {
      timeStart: '2026-07-17T15:00:00.000Z',
      participants: ['rina'],
      summary: 'Then she blocked me on Instagram after weeks of no contact.',
      significanceScore: 72,
    }),
  ];
}

describe('classifySceneNarrative', () => {
  it('answers what a scene is fundamentally about', () => {
    const identity = classifySceneNarrative(
      scene('s1', 'Rina blocked me on Instagram', { participants: ['rina'] }),
    );
    expect(identity.domain).toBe('romance');
    expect(identity.subject).toBe('rina');
    expect(identity.statement).toBe('This chapter is about your relationship with Rina.');
  });

  it('routes kin scenes to family with the relative as subject', () => {
    const identity = classifySceneNarrative(
      scene('s1', 'Grocery run with Grandma', { participants: ['grandma'] }),
    );
    expect(identity.domain).toBe('family');
    expect(identity.subject).toBe('grandma');
  });

  it('treats a named cast with no stronger evidence as a friends story', () => {
    const identity = classifySceneNarrative(
      scene('s1', 'Afternoon with Devon', { participants: ['devon'] }),
    );
    expect(identity.domain).toBe('friends');
    expect(identity.subject).toBe('devon');
  });
});

describe('assembleChaptersFromScenes', () => {
  it('splits a mixed week into one chapter per story, never one index', () => {
    const chapters = assembleChaptersFromScenes(mixedWeek());

    const rina = chapters.find((c) => c.narrative.subject === 'rina');
    expect(rina).toBeDefined();
    expect(rina!.narrative.domain).toBe('romance');
    expect(rina!.sceneIds.sort()).toEqual(['s-blocked', 's-date']);
    // Unrelated life threads must not pad the breakup story.
    expect(rina!.sceneIds).not.toContain('s-grocer');
    expect(rina!.sceneIds).not.toContain('s-app');
    expect(rina!.sceneIds).not.toContain('s-mara');
    expect(rina!.participants).not.toContain('mara');
    expect(rina!.themes).toContain('romance');
    expect(rina!.themes).not.toContain('errands');
    expect(rina!.ownership.primarySubject).toMatch(/rina/i);
    expect(rina!.ownership.primaryNarrative.toLowerCase()).toContain('rina');
    expect(rina!.thesis.toLowerCase()).toContain('rina');
    expect(rina!.ownership.domain).toBe('romance');
    expect(rina!.contributions.every((c) => c.classification === 'supporting')).toBe(true);

    // A different partner is a different story.
    const mara = chapters.find((c) => c.narrative.subject === 'mara');
    expect(mara).toBeDefined();
    expect(mara!.sceneIds).toEqual(['s-mara']);

    const family = chapters.find((c) => c.narrative.domain === 'family');
    expect(family!.sceneIds).toEqual(['s-grocer']);

    const creative = chapters.find((c) => c.narrative.domain === 'creative');
    expect(creative!.sceneIds).toEqual(['s-app']);
    expect(creative!.title).toBe('Building MemoVault');
  });

  it('collapses duplicate experiences into one beat of one chapter', () => {
    const chapters = assembleChaptersFromScenes(mixedWeek());
    const club = chapters.filter((c) => c.narrative.domain === 'social_scene');
    expect(club).toHaveLength(1);
    // Near-duplicate Neon Palace nights collapse to one biographical beat.
    expect(club[0].sceneIds).toHaveLength(1);
    expect(['s-club-1', 's-club-2', 's-club-3']).toContain(club[0].sceneIds[0]);
    expect(club[0].title).toBe('Nights out');
  });

  it('keeps distinct club venues in one nightlife chapter without pinning one venue', () => {
    const chapters = assembleChaptersFromScenes([
      scene('v1', 'Went to Neon Palace', {
        timeStart: '2026-06-10T04:00:00.000Z',
        location: 'Neon Palace',
        summary: 'Danced at the goth club.',
        significanceScore: 40,
      }),
      scene('v2', 'Visit to Velvet Room', {
        timeStart: '2026-06-27T04:00:00.000Z',
        location: 'Velvet Room',
        summary: 'One night dancing at the club.',
        significanceScore: 42,
      }),
      scene('v3', 'Went to the club last night', {
        timeStart: '2026-07-07T04:00:00.000Z',
        summary: 'Another night out dancing.',
        significanceScore: 38,
      }),
    ]);
    const club = chapters.filter((c) => c.narrative.domain === 'social_scene');
    expect(club).toHaveLength(1);
    expect(club[0].sceneIds.sort()).toEqual(['v1', 'v2', 'v3']);
    expect(club[0].title).toBe('Nights out');
    expect(club[0].location).toBeNull();
    expect(club[0].summary).toMatch(/→/);
  });

  it('treats club anniversary nights as nightlife, not romance', () => {
    const chapters = assembleChaptersFromScenes([
      scene('ann', 'Visit to Neon Palace', {
        summary: 'Saw a DJ at Neon Palace 2 year anniversary.',
        location: 'Neon Palace',
        significanceScore: 40,
      }),
    ]);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].narrative.domain).toBe('social_scene');
  });

  it('refuses to assemble a chapter with no narrative identity', () => {
    const chapters = assembleChaptersFromScenes([
      scene('s1', 'A quiet day', { summary: 'Nothing much happened.', significanceScore: 12 }),
      scene('s2', 'Some afternoon', {
        timeStart: '2026-07-19T14:00:00.000Z',
        summary: 'Misc stuff.',
        significanceScore: 15,
      }),
    ]);
    expect(chapters).toHaveLength(0);
  });

  it('refuses identity-less anchors even when significant — no ownership contract', () => {
    const chapters = assembleChaptersFromScenes([
      scene('s1', 'Totaled the car on the freeway', {
        summary: 'Wrecked the car on the freeway ramp.',
        significanceScore: 80,
      }),
    ]);
    // Narrative Ownership: without a discoverable story, do not publish a chapter.
    expect(chapters).toHaveLength(0);
  });

  it('splits the same story across hard time gaps', () => {
    const chapters = assembleChaptersFromScenes([
      scene('a', 'Date night with Rina', {
        timeStart: '2026-01-01T20:00:00.000Z',
        participants: ['rina'],
      }),
      scene('b', 'Anniversary date night with Rina', {
        timeStart: '2026-07-01T20:00:00.000Z',
        participants: ['rina'],
      }),
    ]);
    expect(chapters).toHaveLength(2);
    expect(chapters.every((c) => c.narrative.subject === 'rina')).toBe(true);
  });
});

describe('shouldMergeScenes', () => {
  it('continues a story only for the same domain and subject', () => {
    const [dateNight, , , , , mara, grocer, blocked] = mixedWeek();
    expect(shouldMergeScenes(dateNight, blocked)).toBe(true);
    expect(shouldMergeScenes(blocked, grocer)).toBe(false);
    expect(shouldMergeScenes(blocked, mara)).toBe(false);
  });
});

describe('deriveChapterTitle', () => {
  it('titles flow from the narrative identity', () => {
    const anchor = scene('s1', 'Rina blocked me on Instagram', { participants: ['rina'] });
    const title = deriveChapterTitle({
      identity: classifySceneNarrative(anchor),
      anchor,
      location: null,
    });
    expect(title).toBe('Falling out with Rina');
  });
});

describe('chapterSignificance', () => {
  it('persists a multi-scene story chapter', () => {
    const chapters = assembleChaptersFromScenes(mixedWeek());
    const rina = chapters.find((c) => c.narrative.subject === 'rina')!;
    const decision = mayPersistChapter(rina);
    expect(decision.allow).toBe(true);
    expect(decision.breakdown.sceneCount).toBe(2);
  });

  it('persists a high-stakes single-scene romance with an outcome', () => {
    const chapters = assembleChaptersFromScenes([
      scene('block', 'then she blocked me just yesterday on instagram', {
        summary: 'then she blocked me just yesterday on instagram',
        significanceScore: 41,
      }),
    ]);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].ownership.domain).toBe('romance');
    expect(mayPersistChapter(chapters[0]).allow).toBe(true);
  });
});
