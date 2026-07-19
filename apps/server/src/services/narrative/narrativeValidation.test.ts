import { describe, expect, it } from 'vitest';

import { assembleChaptersFromScenes, type ChapterSceneInput } from './chapterAssembler';
import { mayPublishOwnedChapter } from './narrativeValidation';

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
    timeEnd: opts.timeEnd ?? '2026-07-18T18:00:00.000Z',
    participants: opts.participants,
    primaryGoal: opts.primaryGoal,
    significanceScore: opts.significanceScore ?? 60,
  };
}

describe('narrativeValidation', () => {
  it('publishes an owned romance chapter with supporting evidence only', () => {
    const [chapter] = assembleChaptersFromScenes([
      scene('s1', 'First date with Rina', {
        participants: ['rina'],
        summary: 'Went on a first date with Rina.',
      }),
      scene('s2', 'Rina blocked me on Instagram', {
        participants: ['rina'],
        summary: 'She blocked me after ghosting. No contact.',
        significanceScore: 80,
      }),
    ]);
    expect(chapter).toBeDefined();
    expect(chapter!.ownership.domain).toBe('romance');
    expect(chapter!.ownership.primaryNarrative.toLowerCase()).toContain('rina');
    const gate = mayPublishOwnedChapter(chapter!);
    expect(gate.allow).toBe(true);
    expect(chapter!.contributions.every((c) => c.classification === 'supporting')).toBe(true);
  });
});
