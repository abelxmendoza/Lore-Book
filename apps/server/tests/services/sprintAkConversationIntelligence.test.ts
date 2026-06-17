import { describe, expect, it } from 'vitest';
import {
  classifyQuestionIntent,
  extractPersonNameFromIntent,
} from '../../src/services/chat/questionIntentClassifier';
import { formatEvidenceResponse, hasAnyEvidence } from '../../src/services/chat/memoryEvidenceFormatter';
import { formatLabeledRecall } from '../../src/services/chat/memorySourceLabels';
import {
  shouldSuppressTherapist,
  shouldPreferBiographyWriter,
} from '../../src/services/chat/therapistSuppressionRules';
import {
  transformFactToNarrative,
  buildStoryInsights,
} from '../../src/services/chat/storyInsightService';
import {
  containsBlockedPhrase,
  sanitizeAssistantResponse,
} from '../../src/services/chat/antiRepetitionLayer';

describe('Sprint AK — conversation intelligence', () => {
  describe('AK-1 question intent classification', () => {
    it('classifies recall_person', () => {
      expect(classifyQuestionIntent('Do you remember Jerry?')).toBe('recall_person');
      expect(extractPersonNameFromIntent('Do you remember Jerry?', 'recall_person')).toBe('Jerry');
    });

    it('classifies person_profile', () => {
      expect(classifyQuestionIntent('What do you remember about Alex?')).toBe('person_profile');
    });

    it('classifies daily_recall', () => {
      expect(classifyQuestionIntent('What did I do today?')).toBe('daily_recall');
    });

    it('classifies thread_recall', () => {
      expect(classifyQuestionIntent('What did we talk about?')).toBe('thread_recall');
    });

    it('classifies memory_verification', () => {
      expect(classifyQuestionIntent('Did you save that?')).toBe('memory_verification');
    });

    it('classifies character_creation_check', () => {
      expect(classifyQuestionIntent('Did you create a character?')).toBe('character_creation_check');
    });

    it('classifies memory_debug', () => {
      expect(classifyQuestionIntent('What was extracted?')).toBe('memory_debug');
    });
  });

  describe('AK-2 memory evidence format', () => {
    it('formats known/unknown/evidence blocks', () => {
      const text = formatEvidenceResponse({
        known: ['Character "Grandma Rose" in database'],
        unknown: ['No timeline events yet'],
        evidence: { thread: 2, memory: 3, event: 0, character: 1 },
      });
      expect(text).toContain('**Known:**');
      expect(text).toContain('**Unknown:**');
      expect(text).toContain('Thread: 2');
      expect(hasAnyEvidence({ thread: 0, memory: 0, event: 0, character: 1 })).toBe(true);
    });
  });

  describe('AK-4 thread vs lore labels', () => {
    it('labels current thread and stored lore separately', () => {
      const text = formatLabeledRecall({
        currentThread: 'We talked about Costco.',
        storedLore: 'Grandma Rose — grandmother, 3 memories',
      });
      expect(text).toContain('**Current Thread:**');
      expect(text).toContain('**Stored Lore:**');
    });
  });

  describe('AK-5 therapist suppression', () => {
    it('suppresses therapist for testing and recall', () => {
      expect(shouldSuppressTherapist('Did you save Grandma Rose?', 'memory_verification')).toBe(true);
      expect(shouldSuppressTherapist('What do you know about my family?')).toBe(true);
    });

    it('prefers biography for caretaker facts', () => {
      expect(shouldPreferBiographyWriter('Tio Juan makes sure I eat')).toBe(true);
      expect(shouldPreferBiographyWriter('Costco with Grandma Rose was great')).toBe(true);
    });
  });

  describe('AK-6 story insights', () => {
    it('transforms bootcamp cost fact', () => {
      expect(transformFactToNarrative('Bootcamp cost 15k')).toBe(
        'The expensive bet that changed me.'
      );
    });

    it('transforms Costco + Grandma Rose', () => {
      const insight = buildStoryInsights(['Costco with Grandma Rose yesterday']);
      expect(insight[0]).toContain("wasn't Costco");
    });
  });

  describe('AK-7 anti-repetition', () => {
    it('blocks forbidden fallback phrases', () => {
      expect(containsBlockedPhrase("My record there is thin")).toBe(true);
      expect(containsBlockedPhrase("I've captured that")).toBe(true);
    });

    it('replaces repeated blocked phrases', () => {
      const recent = ["My record there is thin — tell me now."];
      const sanitized = sanitizeAssistantResponse(
        "My record there is thin — tell me now.",
        recent
      );
      expect(sanitized).not.toContain('My record there is thin');
    });
  });
});
