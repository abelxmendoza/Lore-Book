import { describe, expect, it } from 'vitest';
import {
  DO_YOU_REMEMBER_BARE_RE,
  matchesThreadRecallQuery,
} from '../../src/services/chat/threadRecallService';
import {
  detectTestingMode,
  detectRecallFailure,
} from '../../src/services/chat/testingModeDetector';
import {
  extractSignificanceFromText,
  formatFactsAndMeaning,
} from '../../src/services/chat/significanceRecall';
import {
  containsUnverifiedClaim,
  FORBIDDEN_UNVERIFIED_CLAIMS,
  VERIFIED_SILENCE_FALLBACK,
} from '../../src/services/chat/verifiedMemoryLanguage';
import {
  formatGroupedCharacterRosterForChat,
  formatFamilyTreeForChat,
  type CharacterRosterEntry,
} from '../../src/services/chat/foundationRecallDataService';

describe('Sprint AI — memory trust & recall', () => {
  describe('thread recall', () => {
    it('matches bare "Do you remember?"', () => {
      expect(DO_YOU_REMEMBER_BARE_RE.test('Do you remember?')).toBe(true);
      expect(matchesThreadRecallQuery('Do you remember?')).toBe(true);
    });

    it('matches "what happened today"', () => {
      expect(matchesThreadRecallQuery('What happened today?')).toBe(true);
    });
  });

  describe('testing mode detection', () => {
    it('detects extraction audit queries', () => {
      expect(detectTestingMode('What was extracted?')).toBe('memory_formation');
      expect(detectTestingMode('What changed?')).toBe('memory_formation');
      expect(detectTestingMode('Did memory form?')).toBe('memory_formation');
    });
  });

  describe('failure recovery', () => {
    it('detects "aww man" frustration', () => {
      expect(detectRecallFailure('aww man you forgot')).toBe(true);
    });
  });

  describe('significance layer', () => {
    it('extracts meaning from Costco + Abuela transcript pattern', () => {
      const text =
        'The highlight was that my Abuela is still alive. We spent 2.5 hours at Costco.';
      const meanings = extractSignificanceFromText(text);
      expect(meanings.some((m) => /highlight|still alive|Abuela/i.test(m))).toBe(true);
    });

    it('formats facts and meaning blocks', () => {
      const { factsBlock, meaningBlock } = formatFactsAndMeaning(
        ['Costco trip', '2.5 hours'],
        'The highlight was that my Abuela is still alive.'
      );
      expect(factsBlock).toContain('Costco');
      expect(meaningBlock).toMatch(/still alive|highlight/i);
    });
  });

  describe('verified memory language', () => {
    it('flags unverified success claims', () => {
      expect(containsUnverifiedClaim("I've captured that")).toBe(true);
      expect(containsUnverifiedClaim('My record is thin')).toBe(true);
      expect(containsUnverifiedClaim('Here is what I found from your thread.')).toBe(false);
    });

    it('documents forbidden patterns', () => {
      expect(FORBIDDEN_UNVERIFIED_CLAIMS.length).toBeGreaterThan(3);
      expect(VERIFIED_SILENCE_FALLBACK).not.toMatch(/captured|saved/i);
    });
  });

  describe('grouped character roster', () => {
    it('groups family and romantic members', async () => {
      const roster: CharacterRosterEntry[] = [
        {
          id: '1',
          name: 'Abuela',
          aliases: [],
          relationshipToUser: 'grandmother',
          memoryCount: 3,
          timelineEventCount: 1,
          isSelf: false,
        },
        {
          id: '2',
          name: 'Sol',
          aliases: [],
          relationshipToUser: 'romantic partner',
          memoryCount: 5,
          timelineEventCount: 0,
          isSelf: false,
        },
        {
          id: '3',
          name: 'Kelly',
          aliases: [],
          relationshipToUser: 'colleague',
          memoryCount: 1,
          timelineEventCount: 0,
          isSelf: false,
        },
        {
          id: '4',
          name: 'Mr Chino',
          aliases: [],
          relationshipToUser: null,
          memoryCount: 0,
          timelineEventCount: 0,
          isSelf: false,
        },
      ];

      const formatted = await formatGroupedCharacterRosterForChat('test-user', roster);
      expect(formatted).toContain('**Family**');
      expect(formatted).toContain('Abuela');
      expect(formatted).toContain('**Romantic**');
      expect(formatted).toContain('Sol');
      expect(formatted).toContain('**Professional**');
      expect(formatted).toContain('Kelly');
      expect(formatted).toContain('**Scene**');
      expect(formatted).toContain('Mr Chino');
    });
  });

  describe('family tree formatter', () => {
    it('returns null when no family members', async () => {
      // fetchFamilyMembers hits DB — expect null for unknown user
      const tree = await formatFamilyTreeForChat('00000000-0000-0000-0000-000000000000');
      expect(tree).toBeNull();
    });
  });
});
