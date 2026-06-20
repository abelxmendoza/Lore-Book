import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPublish = vi.hoisted(() => vi.fn());

vi.mock('../../../src/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/services/lorebook/parser/loreBookParseEngine', () => ({
  parseLoreBookText: vi.fn().mockReturnValue({
    operations: [],
    redirects: [],
  }),
}));

vi.mock('../../../src/services/lorebook/parser/canonIndexBuilder', () => ({
  buildCanonIndexForUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/services/lorebook/parser/loreBookParseCorpusService', () => ({
  applyParseOperations: vi.fn(),
}));

vi.mock('../../../src/services/lorebook/parser/loreBookNoticeService', () => ({
  publishLoreBookNotice: (...args: unknown[]) => mockPublish(...args),
}));

import { applyParseOperations } from '../../../src/services/lorebook/parser/loreBookParseCorpusService';
import { ingestLoreBookParseFromMessage } from '../../../src/services/lorebook/parser/loreBookIngestionParseService';

describe('ingestLoreBookParseFromMessage notice publishing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(applyParseOperations).mockResolvedValue({
      linesParsed: 0,
      operationsSeen: 1,
      applied: 1,
      skipped: 0,
      byDomain: { quests: 1 },
      appliedItems: [{ domain: 'quests', name: 'Ship beta', confidence: 0.88 }],
    });
  });

  it('publishes notice when chatMessageId and applied items exist', async () => {
    await ingestLoreBookParseFromMessage('user-1', 'We need to ship LoreBook beta soon.', {
      messageId: 'conv-msg-1',
      chatMessageId: 'chat-msg-1',
    });

    expect(mockPublish).toHaveBeenCalledWith('chat-msg-1', 'user-1', [
      { domain: 'quests', name: 'Ship beta', confidence: 0.88 },
    ]);
  });

  it('does not publish without chatMessageId', async () => {
    await ingestLoreBookParseFromMessage('user-1', 'We need to ship LoreBook beta soon.', {
      messageId: 'conv-msg-1',
    });
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('does not publish when nothing applied', async () => {
    vi.mocked(applyParseOperations).mockResolvedValue({
      linesParsed: 0,
      operationsSeen: 1,
      applied: 0,
      skipped: 1,
      byDomain: {},
      appliedItems: [],
    });

    await ingestLoreBookParseFromMessage('user-1', 'We need to ship LoreBook beta soon.', {
      messageId: 'conv-msg-1',
      chatMessageId: 'chat-msg-1',
    });
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
