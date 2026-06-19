import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  DEMO_DOCUMENT_UPLOAD_STAGES,
  simulateDemoDocumentUpload,
} from './demoDocumentUpload';
import { emitDemoEffect } from './demoMutationEffects';

vi.mock('../hooks/useShouldUseMockData', () => ({
  shouldSimulateUploadFlow: () => true,
}));

vi.mock('../contexts/MockDataContext', () => ({
  getGlobalMockDataEnabled: () => true,
  getGlobalIsGuest: () => true,
}));

vi.mock('./demoMutationEffects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./demoMutationEffects')>();
  return {
    ...actual,
    emitDemoEffect: vi.fn(),
  };
});

describe('demoDocumentUpload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs staged progress then returns document result', async () => {
    const file = new File(['demo'], 'diary.txt', { type: 'text/plain' });
    const progressCalls: number[] = [];

    const promise = simulateDemoDocumentUpload(file, (p) => {
      progressCalls.push(p.percent);
    });

    const totalMs = DEMO_DOCUMENT_UPLOAD_STAGES.reduce((sum, s) => sum + s.durationMs, 0);
    await vi.advanceTimersByTimeAsync(totalMs + 100);
    const result = await promise;

    expect(result.kind).toBe('document');
    expect(result.fileName).toBe('diary.txt');
    expect(result.entriesCreated).toBe(3);
    expect(progressCalls.at(-1)).toBe(100);
    expect(emitDemoEffect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'document_uploaded' }),
    );
  });
});
