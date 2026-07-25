import { describe, expect, it } from 'vitest';
import {
  evaluateLorebookTierOffer,
  evaluateProjectTierOffer,
  evaluateQueryTierOffer,
  evaluateTimelineTierOffer,
  evaluateTopicTierOffer,
  LOREBOOK_TIERS,
} from './lorebookTiers';
import { LORE_TOPICS, type LoreReadinessEvaluation, type LoreTopicReadiness } from './loreReadiness';
import type { ProjectDetailProfile } from '../components/projects/projectModalTypes';

function topicReadiness(
  topicId: string,
  overrides: Partial<LoreTopicReadiness> = {},
): LoreTopicReadiness {
  const topic = LORE_TOPICS.find((t) => t.id === topicId)!;
  return {
    topic,
    level: 'needs_more',
    progress: 0,
    atomCount: 0,
    entryCount: 0,
    atomsNeeded: topic.minAtoms,
    entriesNeeded: topic.minEntries,
    canGenerate: false,
    ...overrides,
  };
}

function queryEvaluation(overrides: Partial<LoreReadinessEvaluation> = {}): LoreReadinessEvaluation {
  return {
    label: 'query',
    level: 'needs_more',
    progress: 0,
    canGenerate: false,
    atomCount: 0,
    entryCount: 0,
    wordCount: 0,
    estimatedPages: 0,
    atomsNeeded: 6,
    entriesNeeded: 3,
    gaps: [],
    dimensionScores: { volume: 0, diversity: 0, anchoring: 0, temporal: 0, evidence: 0 },
    suggestions: [],
    ...overrides,
  };
}

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

  describe('domain/topic tier offer', () => {
    it('only unlocks vignette at low atom/entry counts', () => {
      const offer = evaluateTopicTierOffer(
        topicReadiness('family', { atomCount: 1, entryCount: 1 }),
      );
      expect(offer.canCreateAny).toBe(true);
      expect(offer.unlocked).toEqual(['vignette']);
      expect(offer.next).toBe('chapter');
    });

    it('unlocks book once a topic reaches its own minAtoms/minEntries anchor, but not epic', () => {
      const offer = evaluateTopicTierOffer(
        topicReadiness('family', { atomCount: 6, entryCount: 4 }),
      );
      expect(offer.unlocked).toEqual(['vignette', 'chapter', 'short_book', 'book']);
      expect(offer.unlocked).not.toContain('epic');
    });

    it('scales gates per topic — an easier topic (family) unlocks book sooner than a harder one (professional)', () => {
      // family: minAtoms 6, minEntries 4 — professional: minAtoms 8, minEntries 5.
      const signals = { atomCount: 6, entryCount: 4 };
      const family = evaluateTopicTierOffer(topicReadiness('family', signals));
      const professional = evaluateTopicTierOffer(topicReadiness('professional', signals));

      expect(family.unlocked).toContain('book');
      expect(professional.unlocked).not.toContain('book');
    });

    it('unlocks nothing at zero content', () => {
      const offer = evaluateTopicTierOffer(topicReadiness('full_life'));
      expect(offer.canCreateAny).toBe(false);
      expect(offer.highestUnlocked).toBeNull();
      expect(offer.next).toBe('vignette');
    });
  });

  describe('free-text query tier offer (LoreBook Generator)', () => {
    it('unlocks nothing for a query with no content yet', () => {
      const offer = evaluateQueryTierOffer(queryEvaluation(), 'Sarah');
      expect(offer.canCreateAny).toBe(false);
      expect(offer.highestUnlocked).toBeNull();
    });

    it('unlocks vignette for a query with a little content', () => {
      const offer = evaluateQueryTierOffer(
        queryEvaluation({ atomCount: 1, entryCount: 0 }),
        'my music journey',
      );
      expect(offer.unlocked).toEqual(['vignette']);
    });

    it('unlocks book at the dynamic-query anchor (6 atoms / 3 entries)', () => {
      const offer = evaluateQueryTierOffer(queryEvaluation({ atomCount: 6, entryCount: 3 }));
      expect(offer.unlocked).toEqual(['vignette', 'chapter', 'short_book', 'book']);
      expect(offer.unlocked).not.toContain('epic');
    });
  });
});
