import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  queueExtractedUnitForReview,
  shouldQueueExtractedUnitForReview,
} from '../../src/services/conversationCentered/ingestionMemoryBridge';
import type { ExtractedUnit } from '../../src/types/conversationCentered';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

vi.mock('../../src/services/omegaMemoryService', () => ({
  omegaMemoryService: {
    getEntities: vi.fn().mockResolvedValue([
      { id: 'self-entity', user_id: 'user-1', type: 'PERSON', primary_name: 'Me', aliases: [] },
    ]),
  },
}));

vi.mock('../../src/services/perspectiveService', () => ({
  perspectiveService: {
    getOrCreateDefaultPerspectives: vi.fn().mockResolvedValue([{ id: 'persp-self', type: 'SELF' }]),
  },
}));

vi.mock('../../src/services/memoryReviewQueueService', () => ({
  memoryReviewQueueService: {
    ingestMemory: vi.fn().mockResolvedValue({
      proposal: { id: 'proposal-1' },
      auto_approved: false,
    }),
  },
}));

import { memoryReviewQueueService } from '../../src/services/memoryReviewQueueService';

const baseUnit: ExtractedUnit = {
  id: 'unit-1',
  utterance_id: 'utt-1',
  user_id: 'user-1',
  type: 'CLAIM',
  content: 'My sister lives in Portland now.',
  confidence: 0.82,
  temporal_context: { start_time: '2024-01-01T00:00:00.000Z' },
  entity_ids: [],
  created_at: new Date().toISOString(),
};

describe('shouldQueueExtractedUnitForReview', () => {
  it('queues epistemic unit types above confidence floor', () => {
    expect(shouldQueueExtractedUnitForReview({ type: 'CLAIM', confidence: 0.5 })).toBe(true);
    expect(shouldQueueExtractedUnitForReview({ type: 'PERCEPTION', confidence: 0.6 })).toBe(true);
    expect(shouldQueueExtractedUnitForReview({ type: 'DECISION', confidence: 0.7 })).toBe(true);
    expect(shouldQueueExtractedUnitForReview({ type: 'CORRECTION', confidence: 0.8 })).toBe(true);
  });

  it('skips narrative or emotional unit types', () => {
    expect(shouldQueueExtractedUnitForReview({ type: 'EXPERIENCE', confidence: 0.9 })).toBe(false);
    expect(shouldQueueExtractedUnitForReview({ type: 'FEELING', confidence: 0.9 })).toBe(false);
    expect(shouldQueueExtractedUnitForReview({ type: 'THOUGHT', confidence: 0.9 })).toBe(false);
  });

  it('skips low-confidence epistemic units', () => {
    expect(shouldQueueExtractedUnitForReview({ type: 'CLAIM', confidence: 0.3 })).toBe(false);
  });
});

describe('queueExtractedUnitForReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls ingestMemory for reviewable units', async () => {
    const result = await queueExtractedUnitForReview('user-1', baseUnit, 'full message text');

    expect(result.queued).toBe(true);
    expect(result.proposalId).toBe('proposal-1');
    expect(memoryReviewQueueService.ingestMemory).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        text: baseUnit.content,
        confidence: baseUnit.confidence,
        metadata: expect.objectContaining({
          extracted_unit_id: 'unit-1',
          source: 'ingestion_pipeline',
        }),
      }),
      expect.objectContaining({ id: 'self-entity' }),
      'persp-self',
      'full message text'
    );
  });

  it('does not call ingestMemory for non-reviewable units', async () => {
    const result = await queueExtractedUnitForReview('user-1', {
      ...baseUnit,
      type: 'EXPERIENCE',
    });

    expect(result.queued).toBe(false);
    expect(result.reason).toBe('unit_not_reviewable');
    expect(memoryReviewQueueService.ingestMemory).not.toHaveBeenCalled();
  });
});
