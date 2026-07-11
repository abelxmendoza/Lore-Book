import { describe, it, expect, vi, beforeEach } from 'vitest';

const persistMock = vi.fn();
const markRecoveryMock = vi.fn();
const findByKeyMock = vi.fn();

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: null }) }) }),
    }),
  },
}));

vi.mock('../../../src/services/ingestion/ingestionJobStore', () => ({
  ingestionJobStore: {
    persist: (...a: unknown[]) => persistMock(...a),
    markMessageRecoveryRequired: (...a: unknown[]) => markRecoveryMock(...a),
    findByIdempotencyKey: (...a: unknown[]) => findByKeyMock(...a),
    claim: vi.fn().mockResolvedValue({ claimed: true, leaseToken: 't', attemptVersion: 1 }),
    markCompleted: vi.fn().mockResolvedValue(true),
    markRetrying: vi.fn(),
    markDead: vi.fn(),
    markProcessing: vi.fn(),
    loadResumable: vi.fn().mockResolvedValue([]),
    reclaimStaleLocks: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../../../src/services/chat/chatDurability', () => ({
  incMetric: vi.fn(),
}));

vi.mock('../../../src/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../src/lib/messageCostTracker', () => ({
  runWithMessageCost: (_: unknown, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../../../src/services/ingestion/pipelineRunService', () => ({
  pipelineRunService: {
    start: vi.fn().mockResolvedValue(null),
    complete: vi.fn(),
    fail: vi.fn(),
    markPartial: vi.fn(),
    recordStep: vi.fn(),
  },
}));

import { ingestionQueue } from '../../../src/services/ingestion/ingestionQueue';

describe('enqueueDurable truth contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns QUEUED only when durable persist succeeds', async () => {
    persistMock.mockResolvedValue({ ok: true, isNew: true, id: 'job-1' });
    const r = await ingestionQueue.enqueueDurable({
      userId: 'u1',
      chatMessageId: 'm1',
      sessionId: 's1',
    });
    expect(r.status).toBe('QUEUED');
    expect(r.isNew).toBe(true);
    expect(markRecoveryMock).not.toHaveBeenCalled();
  });

  it('returns RECOVERY_REQUIRED when durable persist fails (never claims queued)', async () => {
    persistMock.mockResolvedValue({ ok: false, error: 'db down' });
    const r = await ingestionQueue.enqueueDurable({
      userId: 'u1',
      chatMessageId: 'm1',
      sessionId: 's1',
    });
    expect(r.status).toBe('RECOVERY_REQUIRED');
    expect(r.status).not.toBe('QUEUED');
    expect(markRecoveryMock).toHaveBeenCalledWith('u1', 'm1', expect.any(String));
  });

  it('returns DUPLICATE when idempotency key exists', async () => {
    persistMock.mockResolvedValue({ ok: true, isNew: false, id: 'job-existing' });
    findByKeyMock.mockResolvedValue({ id: 'job-existing' });
    const r = await ingestionQueue.enqueueDurable({
      userId: 'u1',
      chatMessageId: 'm1',
      sessionId: 's1',
    });
    expect(r.status).toBe('DUPLICATE');
    expect(r.jobId).toBe('job-existing');
  });
});
