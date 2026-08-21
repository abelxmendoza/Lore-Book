import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./memoryService', () => ({
  memoryService: { saveEntry: vi.fn() },
}));

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      upsert: vi.fn(() => ({
        catch: vi.fn(),
      })),
    })),
  },
}));

import { memoryService } from './memoryService';
import { chatGPTImportService } from './chatGPTImportService';

describe('chatGPTImportService importFacts occurrence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(memoryService.saveEntry).mockResolvedValue({ id: 'entry-chatgpt-1' } as never);
  });

  it('does not pass import time as occurrence', async () => {
    await chatGPTImportService.importFacts('user-1', [
      {
        id: 'fact-1',
        text: 'In 2023 I interned at Vanguard Robotics.',
        confidence: 'high',
        verificationStatus: 'unverified',
        source: 'user message',
        sourceCreatedAt: '2025-01-15T09:00:00.000Z',
      },
    ]);

    const payload = vi.mocked(memoryService.saveEntry).mock.calls[0][0];
    expect(payload.date).toBeUndefined();
    expect(payload.sourceCreatedAt).toBe('2025-01-15T09:00:00.000Z');
    expect(payload.mentionedAt).toBe('2025-01-15T09:00:00.000Z');
    expect(payload.metadata).toMatchObject({ import_channel: 'chatgpt', imported: true });
    expect(payload.userId).toBe('user-1');
  });
});
