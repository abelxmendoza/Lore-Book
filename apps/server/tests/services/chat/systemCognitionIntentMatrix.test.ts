import { describe, expect, it } from 'vitest';

import { detectMetaQuery } from '../../../src/services/chat/lorebookSelfModelService';
import { detectTestingMode } from '../../../src/services/chat/testingModeDetector';
import { matchesFoundationRecallQuery } from '../../../src/services/chat/recallIntentPatterns';
import {
  NON_META_CASES,
  SOFT_META_CASES,
  STRONG_META_CASES,
} from './systemCognitionFixtures';

describe('System Cognition intent matrix', () => {
  describe('strong meta queries', () => {
    it.each(STRONG_META_CASES.map((c) => [c.message, c.concepts] as const))(
      'classifies "%s" as strong meta',
      (message, concepts) => {
        const match = detectMetaQuery(message);
        expect(match).not.toBeNull();
        expect(match?.strength).toBe('strong');
        for (const concept of concepts) {
          expect(match?.concepts).toContain(concept);
        }
      }
    );
  });

  describe('soft meta queries', () => {
    it.each(SOFT_META_CASES.map((c) => [c.message, c.concepts] as const))(
      'classifies "%s" as soft meta',
      (message, concepts) => {
        const match = detectMetaQuery(message);
        expect(match).not.toBeNull();
        expect(match?.strength).toBe('soft');
        for (const concept of concepts) {
          expect(match?.concepts).toContain(concept);
        }
      }
    );
  });

  describe('non-meta life/recall queries', () => {
    it.each(NON_META_CASES.map((m) => [m] as const))(
      'does not classify "%s" as product meta',
      (message) => {
        expect(detectMetaQuery(message)).toBeNull();
      }
    );
  });

  describe('collision guards — meta must not steal recall or diagnostic intents', () => {
    it('user family recall stays recall_check, not meta', () => {
      const message = 'What do you know about my family?';
      expect(detectMetaQuery(message)).toBeNull();
      expect(detectTestingMode(message)).toBe('recall_check');
    });

    it('memory formation stays diagnostic, not meta', () => {
      const message = 'Did you save Grandma Rose?';
      expect(detectMetaQuery(message)).toBeNull();
      expect(detectTestingMode(message)).toBe('memory_formation');
    });

    it('foundation recall queries are not product meta', () => {
      const message = 'Who are the people in my story?';
      expect(detectMetaQuery(message)).toBeNull();
      expect(matchesFoundationRecallQuery(message)).toBe(true);
    });

    it('product meta and biography recall are mutually exclusive', () => {
      const message = 'What do you know about me?';
      expect(detectMetaQuery(message)).toBeNull();
      expect(matchesFoundationRecallQuery(message)).toBe(true);
    });
  });
});
