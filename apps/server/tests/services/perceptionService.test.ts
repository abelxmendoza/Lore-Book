import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../../src/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// isDualWriteEnabled is kept real (reads process.env, set directly per test below);
// only the DB-touching kernel functions are mocked.
vi.mock('../../src/services/knowledgeKernel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/knowledgeKernel')>();
  return {
    ...actual,
    createKnowledgeAssertion: vi.fn(),
    linkAssertionRevision: vi.fn(),
    listAssertionsForSource: vi.fn(),
    perceptionToKernelAssertion: vi.fn((p: { id: string }) => ({ sourceId: p.id }) as any),
  };
});

import { supabaseAdmin } from '../../src/services/supabaseClient';
import {
  createKnowledgeAssertion,
  linkAssertionRevision,
  listAssertionsForSource,
} from '../../src/services/knowledgeKernel';
import { perceptionService } from '../../src/services/perceptionService';

/** Flush the microtask queue so fire-and-forget dual-write branches settle before assertions. */
async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

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

describe('perceptionService — knowledge kernel dual-write', () => {
  const originalFlag = process.env.KNOWLEDGE_KERNEL_DUAL_WRITE;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.KNOWLEDGE_KERNEL_DUAL_WRITE;
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.KNOWLEDGE_KERNEL_DUAL_WRITE;
    else process.env.KNOWLEDGE_KERNEL_DUAL_WRITE = originalFlag;
  });

  function mockCreateChain(createdRow: Record<string, unknown>) {
    const mockSingle = vi.fn().mockResolvedValue({ data: createdRow, error: null });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
    vi.mocked(supabaseAdmin.from).mockReturnValue({ insert: mockInsert } as any);
  }

  /** Supports both the pre-update currentEntry read and the update chain from the same mock. */
  function mockUpdateChain(currentEntry: Record<string, unknown>, updatedRow: Record<string, unknown>) {
    vi.mocked(supabaseAdmin.from).mockImplementation(() => {
      let mode: 'read' | 'write' = 'read';
      const chain: any = {
        select: () => chain,
        update: () => {
          mode = 'write';
          return chain;
        },
        eq: () => chain,
        single: () =>
          Promise.resolve(
            mode === 'write' ? { data: updatedRow, error: null } : { data: currentEntry, error: null },
          ),
      };
      return chain;
    });
  }

  const createInput = {
    subject_alias: 'Maria',
    content: 'I believe Maria is upset with me.',
    source: 'intuition' as const,
    impact_on_me: 'Makes me anxious.',
  };

  it('does not call the knowledge kernel when the flag is off', async () => {
    mockCreateChain({ id: 'perc-1' });

    const result = await perceptionService.createPerceptionEntry('user-1', createInput);
    await flushMicrotasks();

    expect(result).toMatchObject({ id: 'perc-1' });
    expect(createKnowledgeAssertion).not.toHaveBeenCalled();
  });

  it('creates a kernel assertion on create when the flag is on, without affecting the return value', async () => {
    process.env.KNOWLEDGE_KERNEL_DUAL_WRITE = '1';
    mockCreateChain({ id: 'perc-1' });
    vi.mocked(createKnowledgeAssertion).mockResolvedValue({ id: 'assertion-1' } as any);

    const result = await perceptionService.createPerceptionEntry('user-1', createInput);
    await flushMicrotasks();

    expect(result).toMatchObject({ id: 'perc-1' });
    expect(createKnowledgeAssertion).toHaveBeenCalledTimes(1);
    expect(createKnowledgeAssertion).toHaveBeenCalledWith('user-1', { sourceId: 'perc-1' });
  });

  it('does not let a kernel failure propagate out of createPerceptionEntry', async () => {
    process.env.KNOWLEDGE_KERNEL_DUAL_WRITE = '1';
    mockCreateChain({ id: 'perc-1' });
    vi.mocked(createKnowledgeAssertion).mockRejectedValue(new Error('kernel boom'));

    await expect(perceptionService.createPerceptionEntry('user-1', createInput)).resolves.toMatchObject({
      id: 'perc-1',
    });
    await flushMicrotasks();
  });

  it('links a revision when a prior kernel assertion exists for this perception on update', async () => {
    process.env.KNOWLEDGE_KERNEL_DUAL_WRITE = '1';
    mockUpdateChain({ content: 'old', original_content: null, evolution_notes: [] }, { id: 'perc-1', status: 'confirmed' });
    vi.mocked(listAssertionsForSource).mockResolvedValue([{ id: 'assertion-old' } as any]);
    vi.mocked(createKnowledgeAssertion).mockResolvedValue({ id: 'assertion-new' } as any);

    const result = await perceptionService.updatePerceptionEntry('user-1', 'perc-1', { status: 'confirmed' });
    await flushMicrotasks();

    expect(result).toMatchObject({ id: 'perc-1', status: 'confirmed' });
    expect(listAssertionsForSource).toHaveBeenCalledWith('user-1', 'perception_entries', 'perc-1');
    expect(linkAssertionRevision).toHaveBeenCalledWith('user-1', 'assertion-old', 'assertion-new', 'supersedes');
  });

  it('does not attempt a revision link when no prior kernel assertion exists', async () => {
    process.env.KNOWLEDGE_KERNEL_DUAL_WRITE = '1';
    mockUpdateChain({ content: 'old', original_content: null, evolution_notes: [] }, { id: 'perc-1', status: 'confirmed' });
    vi.mocked(listAssertionsForSource).mockResolvedValue([]);
    vi.mocked(createKnowledgeAssertion).mockResolvedValue({ id: 'assertion-new' } as any);

    await perceptionService.updatePerceptionEntry('user-1', 'perc-1', { status: 'confirmed' });
    await flushMicrotasks();

    expect(createKnowledgeAssertion).toHaveBeenCalledTimes(1);
    expect(linkAssertionRevision).not.toHaveBeenCalled();
  });

  it('fires dual-write on a content-only update with no status change', async () => {
    process.env.KNOWLEDGE_KERNEL_DUAL_WRITE = '1';
    mockUpdateChain(
      { content: 'old', original_content: null, evolution_notes: [] },
      { id: 'perc-1', content: 'I believe Maria has forgiven me.' },
    );
    vi.mocked(listAssertionsForSource).mockResolvedValue([]);
    vi.mocked(createKnowledgeAssertion).mockResolvedValue({ id: 'assertion-new' } as any);

    await perceptionService.updatePerceptionEntry('user-1', 'perc-1', {
      content: 'I believe Maria has forgiven me.',
    });
    await flushMicrotasks();

    expect(createKnowledgeAssertion).toHaveBeenCalledTimes(1);
  });

  it('does not let a kernel failure propagate out of updatePerceptionEntry', async () => {
    process.env.KNOWLEDGE_KERNEL_DUAL_WRITE = '1';
    mockUpdateChain({ content: 'old', original_content: null, evolution_notes: [] }, { id: 'perc-1', status: 'confirmed' });
    vi.mocked(listAssertionsForSource).mockRejectedValue(new Error('lookup boom'));

    await expect(
      perceptionService.updatePerceptionEntry('user-1', 'perc-1', { status: 'confirmed' }),
    ).resolves.toMatchObject({ id: 'perc-1', status: 'confirmed' });
    await flushMicrotasks();
  });
});
