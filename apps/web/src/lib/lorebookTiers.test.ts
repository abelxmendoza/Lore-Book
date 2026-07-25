import { describe, expect, it } from 'vitest';
import {
  evaluateLorebookTierOffer,
  evaluateProjectTierOffer,
  evaluateTimelineTierOffer,
  LOREBOOK_TIERS,
} from './lorebookTiers';
import type { ProjectDetailProfile } from '../components/projects/projectModalTypes';

function emptyProfile(overrides: Partial<ProjectDetailProfile> = {}): ProjectDetailProfile {
  return {
    purpose: '',
    tagline: '',
    currentPhase: '',
    brief: {
      what: '',
      why: '',
      currentState: '',
      lastActivity: '',
      nextStep: '',
    },
    stats: { momentCount: 0, threadCount: 0, dayCount: 0, lastActiveLabel: '' },
    milestones: [],
    contributors: [],
    skills: [],
    resources: [],
    decisions: [],
    storyBeats: [],
    locations: [],
    openLoops: [],
    ...overrides,
  };
}

describe('lorebookTiers', () => {
  it('unlocks vignette with 2 moments and enough words', () => {
    const offer = evaluateTimelineTierOffer({
      eventCount: 2,
      uniqueDays: 1,
      wordCount: 40,
      subjectLabel: 'career',
    });
    expect(offer.canCreateAny).toBe(true);
    expect(offer.unlocked).toContain('vignette');
    expect(offer.unlocked).not.toContain('chapter');
    expect(offer.highestUnlocked).toBe('vignette');
    expect(offer.next).toBe('chapter');
    expect(offer.meter.counterLabel).toMatch(/Chapter/i);
  });

  it('unlocks chapter before short LoreBook', () => {
    const offer = evaluateTimelineTierOffer({
      eventCount: 3,
      uniqueDays: 2,
      wordCount: 90,
    });
    expect(offer.unlocked).toEqual(['vignette', 'chapter']);
    expect(offer.next).toBe('short_book');
  });

  it('unlocks short LoreBook at the classic subject meter', () => {
    const offer = evaluateTimelineTierOffer({
      eventCount: 5,
      uniqueDays: 3,
      wordCount: 120,
    });
    expect(offer.unlocked).toContain('short_book');
    expect(offer.unlocked).not.toContain('book');
  });

  it('keeps full book and epic locked until richer signals', () => {
    const offer = evaluateTimelineTierOffer({
      eventCount: 8,
      uniqueDays: 5,
      wordCount: 250,
    });
    expect(offer.unlocked).toContain('book');
    expect(offer.unlocked).not.toContain('epic');

    const epic = evaluateTimelineTierOffer({
      eventCount: 15,
      uniqueDays: 10,
      wordCount: 500,
    });
    expect(epic.unlocked).toContain('epic');
    expect(epic.next).toBeNull();
    expect(epic.meter.counterLabel).toMatch(/ready/i);
  });

  it('maps default depth per form', () => {
    expect(LOREBOOK_TIERS.vignette.defaultDepth).toBe('summary');
    expect(LOREBOOK_TIERS.book.defaultDepth).toBe('detailed');
    expect(LOREBOOK_TIERS.epic.defaultDepth).toBe('epic');
    expect(LOREBOOK_TIERS.vignette.maxChapters).toBe(1);
    expect(LOREBOOK_TIERS.short_book.maxChapters).toBe(4);
  });

  it('unlocks project vignette from a single milestone', () => {
    const offer = evaluateProjectTierOffer(
      emptyProfile({
        milestones: [{ id: '1', title: 'Kickoff', date: '2026-01-01', kind: 'start' }],
      }),
      'MemoVault',
    );
    expect(offer.canCreateAny).toBe(true);
    expect(offer.highestUnlocked).toBe('vignette');
  });

  it('evaluates entity-style signals via generic offer', () => {
    const offer = evaluateLorebookTierOffer({
      source: 'timeline',
      eventCount: 1,
      uniqueDays: 1,
      wordCount: 10,
    });
    expect(offer.canCreateAny).toBe(false);
    expect(offer.highestUnlocked).toBeNull();
    expect(offer.next).toBe('vignette');
  });
});
