import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../../src/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { supabaseAdmin } from '../../src/services/supabaseClient';
import { perceptionService } from '../../src/services/perceptionService';

describe('perceptionService.createPerceptionEntry — metadata linkage', () => {
  const mockSingle = vi.fn();
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { id: 'perc-1' }, error: null });
    mockSelect.mockReturnValue({ single: mockSingle });
    mockInsert.mockReturnValue({ select: mockSelect });
    vi.mocked(supabaseAdmin.from).mockReturnValue({ insert: mockInsert } as any);
  });

  it('merges caller-supplied linkage metadata into the row alongside the built-in fields', async () => {
    await perceptionService.createPerceptionEntry('user-1', {
      subject_alias: 'Maria',
      content: 'I believe Maria is upset with me.',
      source: 'intuition',
      impact_on_me: 'Makes me anxious.',
      metadata: {
        source_message_id: 'msg-1',
        utterance_id: 'utt-1',
        session_id: 'thread-1',
        extracted_unit_id: 'u1',
      },
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const row = mockInsert.mock.calls[0][0];
    expect(row.metadata).toMatchObject({
      source_message_id: 'msg-1',
      utterance_id: 'utt-1',
      session_id: 'thread-1',
      extracted_unit_id: 'u1',
      // Built-in fields survive alongside the caller-supplied ones.
      source: 'intuition',
      confidence_level: 0.3,
    });
  });

  it('still builds metadata correctly when no linkage metadata is supplied', async () => {
    await perceptionService.createPerceptionEntry('user-1', {
      subject_alias: 'Maria',
      content: 'I believe Maria is upset with me.',
      source: 'intuition',
      impact_on_me: 'Makes me anxious.',
    });

    const row = mockInsert.mock.calls[0][0];
    expect(row.metadata).toMatchObject({ source: 'intuition', confidence_level: 0.3 });
  });
});
