import { describe, expect, it } from 'vitest';

import type { ChapterSceneInput } from './chapterAssembler';
import {
  collectEvidence,
  declareOwnership,
  discoverNarrative,
  establishOwnership,
  scoreSceneContribution,
} from './narrativeOwnership';
import { classifySceneNarrative } from './chapterAssembler';

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
    significanceScore: opts.significanceScore ?? 55,
    promotedEventId: opts.promotedEventId ?? null,
    themes: opts.themes,
  };
}

describe('narrativeOwnership', () => {
  it('discovers a romance story from the strongest clear identity', () => {
    const scenes = [
      scene('s-errand', 'Grocery run with Grandma', {
        participants: ['grandma'],
        significanceScore: 40,
      }),
      scene('s-block', 'Rina blocked me on Instagram', {
        participants: ['rina'],
        summary: 'Then she blocked me on Instagram after weeks of no contact.',
        significanceScore: 72,
      }),
    ];
    const discovered = discoverNarrative(scenes);
    expect(discovered).not.toBeNull();
    expect(discovered!.identity.domain).toBe('romance');
    expect(discovered!.identity.subject).toBe('rina');
  });

  it('declares ownership with conflict and outcome for a breakup', () => {
    const scenes = [
      scene('s1', 'First date with Rina', { participants: ['rina'] }),
      scene('s2', 'Rina blocked me on Instagram', {
        participants: ['rina'],
        summary: 'She blocked me after ghosting. No contact.',
        significanceScore: 80,
      }),
    ];
    const identity = classifySceneNarrative(scenes[1]);
    const ownership = declareOwnership(identity, scenes);
    expect(ownership).not.toBeNull();
    expect(ownership!.primarySubject).toMatch(/rina/i);
    expect(ownership!.primaryConflict).toBeTruthy();
    expect(ownership!.primaryOutcome).toMatch(/no contact/i);
    expect(ownership!.primaryNarrative.toLowerCase()).toContain('rina');
  });

  it('excludes Costco/errands and creative work from a romance ownership contract', () => {
    const ownership = establishOwnership([
      scene('s-date', 'First date with Rina', {
        participants: ['rina'],
        significanceScore: 60,
      }),
      scene('s-block', 'Rina blocked me', {
        participants: ['rina'],
        summary: 'Blocked on Instagram. No contact.',
        significanceScore: 75,
      }),
    ]);
    expect(ownership).not.toBeNull();

    const costco = scoreSceneContribution(
      ownership!,
      scene('s-costco', 'Costco trip with Grandma', {
        participants: ['grandma'],
        primaryGoal: 'errand_visit',
        summary: 'Bought groceries at Costco with Grandma.',
      }),
    );
    expect(costco.classification).toBe('excluded');
    expect(costco.strength).toBeLessThan(60);

    const creative = scoreSceneContribution(
      ownership!,
      scene('s-app', 'Building MemoVault', {
        summary: 'Worked on MemoVault all afternoon.',
        primaryGoal: 'creative_work',
      }),
    );
    expect(creative.classification).toBe('excluded');

    const otherPartner = scoreSceneContribution(
      ownership!,
      scene('s-mara', 'Night with Mara', {
        participants: ['mara'],
        summary: 'Hooked up with Mara after the show.',
      }),
    );
    expect(otherPartner.classification).toBe('excluded');

    const evidence = collectEvidence(ownership!, [
      scene('s-date', 'First date with Rina', { participants: ['rina'] }),
      scene('s-block', 'Rina blocked me', {
        participants: ['rina'],
        summary: 'Blocked. No contact.',
      }),
      scene('s-costco', 'Costco trip with Grandma', {
        participants: ['grandma'],
        primaryGoal: 'errand_visit',
      }),
      scene('s-app', 'Building MemoVault', { primaryGoal: 'creative_work' }),
    ]);
    expect(evidence.supporting.every((s) => s.participants?.includes('rina'))).toBe(true);
    expect(evidence.excluded.map((s) => s.id).sort()).toEqual(['s-app', 's-costco']);
  });
});
