import { describe, expect, it } from 'vitest';
import {
  detectTestingMode,
  detectRecallFailure,
  isTestingModeMessage,
} from '../../src/services/chat/testingModeDetector';
import {
  matchesThreadRecallQuery,
  THREAD_RECALL_RE,
} from '../../src/services/chat/threadRecallService';
import { matchesFoundationRecallQuery } from '../../src/services/chat/recallIntentPatterns';

describe('Sprint AH — trust & recall', () => {
  describe('thread recall detection', () => {
    it('matches "what did I say earlier"', () => {
      expect(matchesThreadRecallQuery('What did I say earlier?')).toBe(true);
      expect(THREAD_RECALL_RE.test('what did I just tell you')).toBe(true);
    });

    it('matches conversation recall via foundation gate', () => {
      expect(matchesFoundationRecallQuery('What did I say in this conversation?')).toBe(true);
    });
  });

  describe('testing mode detection', () => {
    it('detects memory formation queries', () => {
      expect(detectTestingMode('Did you save Abuela?')).toBe('memory_formation');
      expect(isTestingModeMessage('Did you make a character for Ashley?')).toBe(true);
    });

    it('detects recall check queries', () => {
      expect(detectTestingMode('What do you know about my family?')).toBe('recall_check');
    });
  });

  describe('recall failure detection', () => {
    it('detects frustration signals', () => {
      expect(detectRecallFailure('You forgot what I said')).toBe(true);
      expect(detectRecallFailure('Still not working')).toBe(true);
    });
  });
});
