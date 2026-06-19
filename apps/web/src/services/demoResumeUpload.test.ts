import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  DEMO_RESUME_UPLOAD_STAGES,
  simulateDemoResumeUpload,
} from './demoResumeUpload';
import { emitDemoEffect } from './demoMutationEffects';

vi.mock('../hooks/useShouldUseMockData', () => ({
  shouldUseMockData: () => true,
}));

vi.mock('../contexts/MockDataContext', () => ({
  getGlobalMockDataEnabled: () => true,
}));

vi.mock('./demoMutationEffects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./demoMutationEffects')>();
  return {
    ...actual,
    emitDemoEffect: vi.fn(),
  };
});

describe('demoResumeUpload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs staged progress then returns demo resume result', async () => {
    const file = new File(['demo'], 'My_Resume.pdf', { type: 'application/pdf' });
    const progressCalls: number[] = [];

    const promise = simulateDemoResumeUpload(file, (p) => {
      progressCalls.push(p.percent);
    });

    const totalMs = DEMO_RESUME_UPLOAD_STAGES.reduce((sum, s) => sum + s.durationMs, 0);
    await vi.advanceTimersByTimeAsync(totalMs + 100);
    const result = await promise;

    expect(result.kind).toBe('resume');
    expect(result.fileName).toBe('My_Resume.pdf');
    expect(result.chatFeedback).toContain('Resume ingested');
    expect(result.claimsCreated).toBeGreaterThan(0);
    expect(progressCalls.at(-1)).toBe(100);
    expect(emitDemoEffect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'resume_uploaded' }),
    );
  });
});
