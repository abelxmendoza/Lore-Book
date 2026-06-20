import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockParse = vi.hoisted(() => vi.fn());
const mockCanon = vi.hoisted(() => vi.fn());
const mockApply = vi.hoisted(() => vi.fn());

vi.mock('../../../src/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/services/lorebook/parser/loreBookParseEngine', () => ({
  parseLoreBookText: (...args: unknown[]) => mockParse(...args),
}));

vi.mock('../../../src/services/lorebook/parser/canonIndexBuilder', () => ({
  buildCanonIndexForUser: (...args: unknown[]) => mockCanon(...args),
}));

vi.mock('../../../src/services/lorebook/parser/loreBookParseCorpusService', () => ({
  applyParseOperations: (...args: unknown[]) => mockApply(...args),
}));

import { ingestLoreBookParseFromMessage } from '../../../src/services/lorebook/parser/loreBookIngestionParseService';

describe('loreBookIngestionParseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanon.mockResolvedValue(undefined);
    mockApply.mockResolvedValue({
      linesParsed: 0,
      operationsSeen: 1,
      applied: 1,
      skipped: 0,
      byDomain: { characters: 1 },
      appliedItems: [{ domain: 'characters', name: 'Oscar Martinez', confidence: 0.88 }],
    });
    mockParse.mockReturnValue({
      userId: 'user-1',
      text: 'Oscar Martinez is my friend from robotics.',
      lexicalSpans: [],
      operations: [
        {
          kind: 'suggest_add',
          domain: 'characters',
          name: 'Oscar Martinez',
          evidence: { quote: 'Oscar Martinez is my friend' },
          confidence: 0.88,
          sourceSpans: [],
          gate: 'suggest',
        },
      ],
      suppressed: [],
      redirects: [],
      warnings: [],
    });
  });

  it('skips very short messages', async () => {
    const summary = await ingestLoreBookParseFromMessage('user-1', 'ok', {
      messageId: 'msg-1',
      threadId: 'thread-1',
    });
    expect(summary.applied).toBe(0);
    expect(mockParse).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('parses user message lines and applies operations with ingest source', async () => {
    const summary = await ingestLoreBookParseFromMessage(
      'user-1',
      'Oscar Martinez is my friend from robotics.',
      { messageId: 'msg-1', threadId: 'thread-1' }
    );

    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        messageId: 'msg-1',
        threadId: 'thread-1',
      })
    );
    expect(mockApply).toHaveBeenCalledWith(
      'user-1',
      expect.any(Array),
      expect.objectContaining({ source: 'message_ingest', messageId: 'msg-1' })
    );
    expect(summary.applied).toBe(1);
    expect(summary.linesParsed).toBe(1);
  });

  it('splits multiline messages into separate parse passes', async () => {
    mockApply.mockResolvedValue({
      linesParsed: 0,
      operationsSeen: 2,
      applied: 2,
      skipped: 0,
      byDomain: {},
      appliedItems: [],
    });

    await ingestLoreBookParseFromMessage(
      'user-1',
      'Oscar Martinez joined our team.\nWe visited Gothicumbia last summer.',
      { messageId: 'msg-2' }
    );

    expect(mockParse).toHaveBeenCalledTimes(2);
  });

  it('returns empty summary when apply throws (caller handles non-blocking)', async () => {
    mockApply.mockRejectedValue(new Error('db down'));
    await expect(
      ingestLoreBookParseFromMessage('user-1', 'Oscar Martinez is my coworker.', {
        messageId: 'msg-3',
      })
    ).rejects.toThrow('db down');
  });
});
