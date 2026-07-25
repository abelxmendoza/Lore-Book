import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  chatGPTLoreMigrationService,
  classifyChatGPTLoreCategory,
  extractUserAuthoredChatGPTClaims,
} from '../../src/services/chatgptImport/chatGPTLoreMigrationService';
import { memoryReviewQueueService } from '../../src/services/memoryReviewQueueService';
import { selfCharacterService } from '../../src/services/selfCharacterService';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('classifyChatGPTLoreCategory', () => {
  it('routes autobiographical claims into profile preview categories', () => {
    expect(classifyChatGPTLoreCategory('I built MemoVault as my main project.')).toBe('projects');
    expect(classifyChatGPTLoreCategory('I prefer quiet mornings and coffee.')).toBe('preferences_habits');
    expect(classifyChatGPTLoreCategory('I want to learn Japanese next year.')).toBe('skills_interests');
    expect(classifyChatGPTLoreCategory('I met Jamie while working at Vanguard Robotics.')).toBe('relationships');
  });

  it('keeps autobiographical evidence while excluding prompts and sensitive claims by default', () => {
    expect(
      extractUserAuthoredChatGPTClaims('I built a Python app called MemoVault.').claims,
    ).toEqual(['I built a Python app called MemoVault.']);
    expect(
      extractUserAuthoredChatGPTClaims('Write me a fictional biography where I live on Mars.'),
    ).toMatchObject({ claims: [], excludedAsHypothetical: true });
    expect(
      extractUserAuthoredChatGPTClaims('I was diagnosed with a medical condition last year.'),
    ).toMatchObject({ claims: [], sensitiveClaimsExcluded: 1 });
  });

  it('keeps handoff claims review-only, preserves AI recall provenance, and excludes sensitive claims by default', async () => {
    vi.spyOn(selfCharacterService, 'ensureSelfCharacter').mockResolvedValue({
      id: 'self-1',
      name: 'You',
    } as never);
    const ingest = vi.spyOn(memoryReviewQueueService, 'ingestMemory').mockResolvedValue({
      proposal: { metadata: { evidence_count: 1 } },
      auto_approved: false,
    } as never);

    const stats = await chatGPTLoreMigrationService.processConversations({
      userId: 'user-1',
      sourceFileId: 'source-1',
      conversations: [
        {
          id: 'handoff-1',
          title: 'LoreBook Memory Handoff',
          createdAt: null,
          updatedAt: null,
          messages: [
            {
              id: 'claim-1',
              role: 'handoff',
              text: 'You are building MemoVault.',
              createdAt: null,
              handoffClaim: {
                category: 'Software project',
                confidence: 'high',
                sourceType: 'saved_memory',
                approximatePeriod: 'Ongoing',
                relatedEntities: 'MemoVault',
                evidence: 'Discussed repeatedly.',
                sensitive: false,
              },
            },
            {
              id: 'claim-2',
              role: 'handoff',
              text: 'You reported private employment feedback.',
              createdAt: null,
              handoffClaim: {
                category: 'Employment feedback',
                confidence: 'medium',
                sourceType: 'chat_history_recall',
                approximatePeriod: '2026',
                relatedEntities: 'Vanguard Robotics',
                evidence: 'Discussed once.',
                sensitive: true,
              },
            },
          ],
        },
      ],
      includeSensitive: false,
    });

    expect(stats).toMatchObject({
      handoffClaimsConsidered: 2,
      sensitiveClaimsExcluded: 1,
      proposalsCreated: 1,
    });
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls[0]?.[1]).toMatchObject({
      confidence: 0.72,
      metadata: {
        force_review: true,
        source: 'chatgpt_memory_handoff',
        authority: 'assistant_recalled_review_required',
        handoff_source_type: 'saved_memory',
        handoff_sensitive: false,
      },
    });
  });
});
