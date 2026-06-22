import { describe, it, expect } from 'vitest';
import {
  hasQuestSignal,
  hasProgressSignal,
  hasSkillSignal,
  hasProjectSignal,
  hasInterestSignal,
  hasLifeChangeSignal,
  hasAnyExtractionSignal,
  hasSelfAttributeSignal,
  hasWorkoutSignal,
  hasBiometricSignal,
} from '../../src/services/conversationCentered/extractionSignals';

/**
 * The extraction-signal gates are the core of the "429 fan-out" fix: every
 * per-message LLM extractor is fired only when its cheap keyword gate matches.
 * A regression here either re-introduces the cost storm (gate too loose) or
 * silently drops user intent (gate too tight), so we pin both directions.
 */
describe('extractionSignals', () => {
  describe('hasQuestSignal', () => {
    it.each([
      'I want to learn the guitar',
      'gonna run a marathon next year',
      "I'll finally write that novel",
      'my goal is to get promoted',
      'I need to fix my sleep schedule',
      'planning to move to Spain',
    ])('detects quest intent in: %s', (text) => {
      expect(hasQuestSignal(text)).toBe(true);
    });

    it.each([
      'had coffee with Maria',
      'the weather is nice today',
      'she walked to the store',
    ])('ignores non-quest text: %s', (text) => {
      expect(hasQuestSignal(text)).toBe(false);
    });

    it('normalizes curly apostrophes (I\u2019ll)', () => {
      expect(hasQuestSignal('I\u2019ll start tomorrow')).toBe(true);
    });
  });

  describe('hasProgressSignal', () => {
    it.each([
      'finished the first draft',
      'made progress on the deck',
      "I'm halfway through the course",
      'knocked out three chapters',
      'about 80% done',
    ])('detects progress in: %s', (text) => {
      expect(hasProgressSignal(text)).toBe(true);
    });

    it.each(['I want to start running', 'went to the gym'])(
      'ignores non-progress text: %s',
      (text) => {
        expect(hasProgressSignal(text)).toBe(false);
      },
    );
  });

  describe('hasSkillSignal', () => {
    it.each([
      'learning Spanish',
      'practicing piano every day',
      'getting better at chess',
      'teaching myself to code',
      'I leveled up my cooking',
    ])('detects skill activity in: %s', (text) => {
      expect(hasSkillSignal(text)).toBe(true);
    });

    it('ignores plain narration', () => {
      expect(hasSkillSignal('we ate dinner together')).toBe(false);
    });
  });

  describe('hasProjectSignal', () => {
    it.each([
      'building a new app',
      'working on a side project',
      'shipped the MVP',
      'launching next week',
      'deployed to production',
    ])('detects project work in: %s', (text) => {
      expect(hasProjectSignal(text)).toBe(true);
    });

    it('ignores non-project text', () => {
      expect(hasProjectSignal('I had a great day')).toBe(false);
    });
  });

  describe('hasInterestSignal', () => {
    it.each([
      'I love hiking',
      "I'm really into jazz",
      'obsessed with this show',
      'my favorite hobby is painting',
      'fascinated by astronomy',
    ])('detects interest in: %s', (text) => {
      expect(hasInterestSignal(text)).toBe(true);
    });

    it('ignores neutral statements', () => {
      expect(hasInterestSignal('the meeting is at noon')).toBe(false);
    });
  });

  describe('hasLifeChangeSignal', () => {
    it.each([
      'I quit my job',
      'we broke up',
      'moving to a new city',
      'got married last weekend',
      'I got laid off',
      'we are pregnant',
    ])('detects life change in: %s', (text) => {
      expect(hasLifeChangeSignal(text)).toBe(true);
    });

    it('ignores everyday text', () => {
      expect(hasLifeChangeSignal('I made pasta for lunch')).toBe(false);
    });
  });

  describe('hasSelfAttributeSignal', () => {
    it.each([
      'I work as a nurse at Kaiser',
      'studying computer science at MIT',
      'I live in Portland now',
      "I'm 32 years old",
    ])('detects self attributes in: %s', (text) => {
      expect(hasSelfAttributeSignal(text)).toBe(true);
    });

    it('ignores bare first-person narration', () => {
      expect(hasSelfAttributeSignal('I went to the store')).toBe(false);
    });
  });

  describe('hasWorkoutSignal', () => {
    it('detects gym content', () => {
      expect(hasWorkoutSignal('hit the gym and did squats')).toBe(true);
    });
    it('ignores non-workout text', () => {
      expect(hasWorkoutSignal('had lunch with Sam')).toBe(false);
    });
  });

  describe('hasBiometricSignal', () => {
    it('detects scale metrics', () => {
      expect(hasBiometricSignal('my body fat is down to 18%')).toBe(true);
    });
    it('ignores non-biometric text', () => {
      expect(hasBiometricSignal('feeling tired today')).toBe(false);
    });
  });

  describe('hasAnyExtractionSignal', () => {
    it('returns true when any single gate matches', () => {
      expect(hasAnyExtractionSignal('I want to learn guitar')).toBe(true);
      expect(hasAnyExtractionSignal('shipped the MVP')).toBe(true);
    });

    it('returns false for plain narration with no signals', () => {
      expect(hasAnyExtractionSignal('had coffee with Maria this morning')).toBe(false);
    });
  });

  describe('input hardening', () => {
    it('handles empty string without throwing', () => {
      expect(hasAnyExtractionSignal('')).toBe(false);
      expect(hasQuestSignal('')).toBe(false);
    });

    it('handles null/undefined defensively', () => {
      expect(hasAnyExtractionSignal(undefined as unknown as string)).toBe(false);
      expect(hasQuestSignal(null as unknown as string)).toBe(false);
    });
  });
});
