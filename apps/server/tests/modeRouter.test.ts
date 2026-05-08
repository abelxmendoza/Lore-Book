import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock OpenAI so LLM fallback returns UNKNOWN — we are only testing pattern-matching logic
vi.mock('../src/services/openaiClient', () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                mode: 'UNKNOWN',
                confidence: 0.8,
                reasoning: 'Normal conversation — mock response',
              }),
            },
          }],
        }),
      },
    },
  },
}));

import { modeRouterService } from '../src/services/modeRouter/modeRouterService';

const USER_ID = 'test-user-regression';

describe('ModeRouter regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // These messages are normal first-person conversation.
  // They were previously caught by the broad ACTION_LOG verb patterns.
  // After the fix they must NOT be ACTION_LOG.
  // ─────────────────────────────────────────────────────────────────────────
  describe('UNKNOWN — normal conversation must never be ACTION_LOG', () => {
    const cases = [
      'I thought the villain needed more depth.',
      'I felt like chapter 2 was weak.',
      'I noticed the pacing slowed down.',
      'I realized the main character needs a stronger motive.',
      'I decided the story should start at the funeral.',
    ];

    for (const msg of cases) {
      it(`NOT ACTION_LOG: "${msg}"`, async () => {
        const result = await modeRouterService.routeMessage(USER_ID, msg);
        expect(result.mode).not.toBe('ACTION_LOG');
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Explicit save/log commands — must resolve to ACTION_LOG via pattern match
  // (high confidence, no LLM call needed)
  // ─────────────────────────────────────────────────────────────────────────
  describe('ACTION_LOG — explicit log commands', () => {
    const cases = [
      'Log this: Abel entered the lab.',
      'Save this memory: Omega failed the first trial.',
      'Journal entry: I finished chapter 2.',
      'Memory: The villain fears abandonment.',
      'Lore note: The city runs on stolen sunlight.',
    ];

    for (const msg of cases) {
      it(`ACTION_LOG: "${msg}"`, async () => {
        const result = await modeRouterService.routeMessage(USER_ID, msg);
        expect(result.mode).toBe('ACTION_LOG');
        // Should resolve via pattern matching (confidence high, no LLM needed)
        expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Greetings and meta-questions must stay UNKNOWN (normal chat)
  // ─────────────────────────────────────────────────────────────────────────
  describe('UNKNOWN — greetings and meta questions', () => {
    const cases = [
      'Hey',
      'Hello',
      'Does it work?',
      'Are you there?',
      'Thanks',
    ];

    for (const msg of cases) {
      it(`UNKNOWN: "${msg}"`, async () => {
        const result = await modeRouterService.routeMessage(USER_ID, msg);
        expect(result.mode).toBe('UNKNOWN');
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Questions should never be ACTION_LOG regardless of opening words
  // ─────────────────────────────────────────────────────────────────────────
  describe('ACTION_LOG must not fire on questions', () => {
    const cases = [
      'What did I write in chapter 3?',
      'Do you remember what I said about the villain?',
      'Log this — or should I?',
    ];

    for (const msg of cases) {
      it(`NOT ACTION_LOG: "${msg}"`, async () => {
        const result = await modeRouterService.routeMessage(USER_ID, msg);
        expect(result.mode).not.toBe('ACTION_LOG');
      });
    }
  });
});
