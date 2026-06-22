import { describe, expect, it } from 'vitest';

import {
  classifyIngestionScope,
  hasLifeContentSignals,
  isLoreBookProductName,
  isPureMetaProductMessage,
  mentionsLoreBookProduct,
} from '../../../src/services/chat/metaConversationClassifier';

describe('metaConversationClassifier', () => {
  describe('isLoreBookProductName', () => {
    it('matches product names', () => {
      expect(isLoreBookProductName('LoreBook')).toBe(true);
      expect(isLoreBookProductName('lore book')).toBe(true);
      expect(isLoreBookProductName('Lorekeeper')).toBe(true);
    });

    it('does not match people', () => {
      expect(isLoreBookProductName('Maria')).toBe(false);
      expect(isLoreBookProductName('Lore Book Club')).toBe(false);
    });
  });

  describe('classifyIngestionScope', () => {
    it('product_only for pure app questions', () => {
      expect(classifyIngestionScope('How does LoreBook remember things?')).toBe('product_only');
      expect(classifyIngestionScope('Did you save that as a character card?')).toBe('product_only');
      expect(classifyIngestionScope('The composer entity chips are confusing')).toBe('product_only');
    });

    it('life for normal autobiographical chat', () => {
      expect(classifyIngestionScope('Had coffee with Maria yesterday')).toBe('life');
      expect(classifyIngestionScope('My mom called me this morning')).toBe('life');
    });

    it('mixed when product and life signals coexist', () => {
      expect(
        classifyIngestionScope(
          'I was using LoreBook when I told you about my trip to Costa Rica last week'
        )
      ).toBe('mixed');
      expect(classifyIngestionScope('LoreBook saved my conversation about my mom')).toBe('mixed');
    });
  });

  describe('signals', () => {
    it('detects product mentions', () => {
      expect(mentionsLoreBookProduct('Wish LoreBook would fix the composer')).toBe(true);
    });

    it('detects pure meta', () => {
      expect(isPureMetaProductMessage('Will you remember this conversation?')).toBe(true);
    });

    it('detects life content', () => {
      expect(hasLifeContentSignals('Went to dinner with my friend')).toBe(true);
    });
  });
});
