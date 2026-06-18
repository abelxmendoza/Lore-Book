import { describe, expect, it } from 'vitest';
import {
  detectMetaQuery,
  formatSelfModelBlock,
  FALLBACK_SELF_MODEL,
  loadSelfModel,
  resolveMetaProductContext,
} from '../../../src/services/chat/lorebookSelfModelService';

describe('lorebookSelfModelService', () => {
  describe('detectMetaQuery', () => {
    it('detects strong product identity queries', () => {
      const match = detectMetaQuery('What is LoreBook?');
      expect(match).not.toBeNull();
      expect(match?.strength).toBe('strong');
      expect(match?.concepts).toContain('product_identity');
    });

    it('detects strong how-it-works queries', () => {
      const match = detectMetaQuery('How does this app work?');
      expect(match?.strength).toBe('strong');
      expect(match?.concepts).toEqual(
        expect.arrayContaining(['product_identity', 'memory_lifecycle', 'surfaces'])
      );
    });

    it('detects memory lifecycle queries', () => {
      const match = detectMetaQuery('How do you remember things?');
      expect(match?.strength).toBe('strong');
      expect(match?.concepts).toContain('memory_lifecycle');
    });

    it('does not treat user biography recall as meta product', () => {
      expect(detectMetaQuery('What do you know about me?')).toBeNull();
      expect(detectMetaQuery('What do you know about my family?')).toBeNull();
      expect(detectMetaQuery('Who are the people in my story?')).toBeNull();
    });

    it('detects soft narrator queries', () => {
      const match = detectMetaQuery('Am I in my Characters book?');
      expect(match?.strength).toBe('soft');
      expect(match?.concepts).toContain('user_is_narrator');
    });
  });

  describe('formatSelfModelBlock', () => {
    it('formats facts as a prompt block', () => {
      const block = formatSelfModelBlock([FALLBACK_SELF_MODEL.product_identity]);
      expect(block).toContain('verified facts');
      expect(block).toContain('personal memory operating system');
    });

    it('returns null for empty facts', () => {
      expect(formatSelfModelBlock([])).toBeNull();
    });
  });

  describe('loadSelfModel', () => {
    it('returns fallback facts without DB', async () => {
      const facts = await loadSelfModel(['product_identity', 'surfaces']);
      expect(facts).toHaveLength(2);
      expect(facts[0].concept).toBe('product_identity');
      expect(facts[1].concept).toBe('surfaces');
    });
  });

  describe('resolveMetaProductContext', () => {
    it('short-circuits strong meta queries', async () => {
      const result = await resolveMetaProductContext('What is LoreBook?');
      expect(result.shortCircuit).not.toBeNull();
      expect(result.shortCircuit?.content).toContain('LoreBook');
      expect(result.promptBlock).toBeNull();
    });

    it('returns prompt block for soft meta queries', async () => {
      const result = await resolveMetaProductContext('Am I a character in my book?');
      expect(result.shortCircuit).toBeNull();
      expect(result.promptBlock).toContain('main character');
    });

    it('returns empty for non-meta queries', async () => {
      const result = await resolveMetaProductContext('I had a hard day at work');
      expect(result.shortCircuit).toBeNull();
      expect(result.promptBlock).toBeNull();
    });
  });
});
