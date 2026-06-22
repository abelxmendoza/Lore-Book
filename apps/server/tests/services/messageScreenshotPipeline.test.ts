import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPipeline = vi.fn();
const mockLoreParse = vi.fn();
const mockOmegaIngest = vi.fn();
const mockFrom = vi.fn();

vi.mock('../../src/services/pipeline/loreInterpretationPipeline', () => ({
  runLoreInterpretationPipeline: (...args: unknown[]) => mockPipeline(...args),
}));

vi.mock('../../src/services/lorebook/parser/loreBookIngestionParseService', () => ({
  ingestLoreBookParseFromMessage: (...args: unknown[]) => mockLoreParse(...args),
}));

vi.mock('../../src/services/omegaMemoryService', () => ({
  omegaMemoryService: {
    ingestText: (...args: unknown[]) => mockOmegaIngest(...args),
  },
}));

vi.mock('../../src/services/meaning/meaningResolutionService', () => ({
  meaningResolutionService: {
    allowsMemoryWrite: () => true,
  },
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import {
  runMessageScreenshotPipeline,
  persistPipelineSummary,
} from '../../src/services/characters/messageScreenshotPipelineService';

function chain(result: { data?: unknown; error?: unknown } = {}) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'insert', 'update']) builder[m] = vi.fn(() => builder);
  builder.single = vi.fn(async () => result);
  builder.maybeSingle = vi.fn(async () => result);
  return builder;
}

describe('runMessageScreenshotPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPipeline.mockResolvedValue({
      lexical: {
        entities: [{ surface: 'Oscar', type: 'PERSON' }],
        skills: [],
        confidence: 0.8,
      },
      meaning: {
        confidence: 0.75,
        resolvedRelationships: [{ from: 'self', to: 'Oscar', type: 'friend_of' }],
        factuality: 'asserted',
      },
      inference: { confidence: 0.5 },
    });
    mockLoreParse.mockResolvedValue({
      linesParsed: 1,
      operationsSeen: 2,
      applied: 1,
      skipped: 1,
      byDomain: { character: 1 },
      appliedItems: [{ domain: 'character', name: 'Oscar', confidence: 0.8 }],
    });
    mockOmegaIngest.mockResolvedValue({
      entities: [{ id: 'e1', name: 'Oscar' }],
      claims: [{ id: 'c1' }],
      conflicts_detected: 0,
    });
  });

  it('returns null for very short text', async () => {
    const result = await runMessageScreenshotPipeline({
      userId: 'user-1',
      characterId: 'char-1',
      characterName: 'Oscar',
      mediaId: 'media-1',
      extractedText: 'hi',
    });
    expect(result).toBeNull();
    expect(mockPipeline).not.toHaveBeenCalled();
  });

  it('runs lexical intelligence, interpretation, LoreBook parse, and omega ingest', async () => {
    const transcript = 'Oscar: hey are we still on for Saturday night?\nMe: yeah definitely, see you at Metro';
    const result = await runMessageScreenshotPipeline({
      userId: 'user-1',
      characterId: 'char-1',
      characterName: 'Oscar',
      mediaId: 'media-1',
      extractedText: transcript,
      analysis: { platform: 'imessage', confidence: 0.9, extractedText: transcript, messages: [] },
      caption: 'planning saturday',
    });

    expect(result).not.toBeNull();
    expect(result!.messageId).toBe('screenshot:media-1');
    expect(result!.lexicalIntelligence.spanCount).toBeGreaterThan(0);
    expect(result!.interpretation.entityCount).toBe(1);
    expect(result!.interpretation.relationshipCount).toBe(1);
    expect(result!.loreBookParse.applied).toBe(1);
    expect(result!.omegaIngest?.claimsQueued).toBe(1);

    expect(mockPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        messageId: 'screenshot:media-1',
        threadId: 'character:char-1',
      }),
      expect.objectContaining({ priorMentionedNames: ['Oscar'] }),
    );
    expect(mockLoreParse).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('Oscar'),
      expect.objectContaining({ messageId: 'screenshot:media-1' }),
    );
    expect(mockOmegaIngest).toHaveBeenCalledWith('user-1', expect.stringContaining(transcript), 'USER');
  });
});

describe('persistPipelineSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => chain({ data: { analysis: {} } }));
  });

  it('updates character_media and text_message_uploads', async () => {
    const pipeline = {
      messageId: 'screenshot:media-1',
      lexicalIntelligence: { spanCount: 2, entities: ['Oscar'], rulesFired: [] },
      interpretation: {
        entityCount: 1,
        relationshipCount: 0,
        skillCount: 0,
        confidence: 0.8,
        allowsMemoryWrite: true,
      },
      loreBookParse: {
        linesParsed: 1,
        operationsSeen: 0,
        applied: 0,
        skipped: 0,
        byDomain: {},
        appliedItems: [],
      },
      completedAt: new Date().toISOString(),
    };

    await persistPipelineSummary('user-1', 'media-1', 'archive-1', pipeline, { analysis: { summary: 'test' } });

    expect(mockFrom).toHaveBeenCalledWith('character_media');
    expect(mockFrom).toHaveBeenCalledWith('text_message_uploads');
  });
});
