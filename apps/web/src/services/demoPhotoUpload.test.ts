import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  DEMO_PHOTO_ANALYZE_STAGES,
  DEMO_PHOTO_GALLERY_STAGES,
  DEMO_PHOTO_PROCESS_STAGES,
  buildDemoPhotoAnalysis,
  simulateDemoPhotoAnalyze,
  simulateDemoPhotoGalleryUpload,
  simulateDemoPhotoProcess,
} from './demoPhotoUpload';
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

describe('demoPhotoUpload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds memory analysis for typical photo names', () => {
    const file = new File(['demo'], 'trail_hike.jpg', { type: 'image/jpeg' });
    const analysis = buildDemoPhotoAnalysis(file);

    expect(analysis.photoType).toBe('memory');
    expect(analysis.confidence).toBeGreaterThan(0.8);
    expect(analysis.suggestedLocation?.name).toContain('Mountain');
  });

  it('runs staged analyze progress then returns analysis', async () => {
    const file = new File(['demo'], 'friends.jpg', { type: 'image/jpeg' });
    const progressCalls: number[] = [];

    const promise = simulateDemoPhotoAnalyze(file, (p) => {
      progressCalls.push(p.percent);
    });

    const totalMs = DEMO_PHOTO_ANALYZE_STAGES.reduce((sum, s) => sum + s.durationMs, 0);
    await vi.advanceTimersByTimeAsync(totalMs + 100);
    const analysis = await promise;

    expect(analysis.photoType).toBe('memory');
    expect(progressCalls.at(-1)).toBe(100);
  });

  it('runs staged process progress and emits photo_uploaded effect', async () => {
    const file = new File(['demo'], 'friends.jpg', { type: 'image/jpeg' });
    const progressCalls: number[] = [];

    const promise = simulateDemoPhotoProcess(
      file,
      { addToLoreBook: true, extractTextOnly: false },
      (p) => {
        progressCalls.push(p.percent);
      },
    );

    const totalMs = DEMO_PHOTO_PROCESS_STAGES.reduce((sum, s) => sum + s.durationMs, 0);
    await vi.advanceTimersByTimeAsync(totalMs + 100);
    const result = await promise;

    expect(result.message).toBe('Photo added to lore book');
    expect(progressCalls.at(-1)).toBe(100);
    expect(emitDemoEffect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'photo_uploaded' }),
    );
  });

  it('runs gallery upload stages and returns photo metadata', async () => {
    const file = new File(['demo'], 'sunset.jpg', { type: 'image/jpeg' });
    const progressCalls: number[] = [];

    const promise = simulateDemoPhotoGalleryUpload(file, (p) => {
      progressCalls.push(p.percent);
    });

    const totalMs = DEMO_PHOTO_GALLERY_STAGES.reduce((sum, s) => sum + s.durationMs, 0);
    await vi.advanceTimersByTimeAsync(totalMs + 100);
    const result = await promise;

    expect(result.photoId).toMatch(/^demo-photo-/);
    expect(result.locationName).toBeTruthy();
    expect(progressCalls.at(-1)).toBe(100);
    expect(emitDemoEffect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'photo_uploaded' }),
    );
  });
});
