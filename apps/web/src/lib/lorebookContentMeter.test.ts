import { describe, expect, it } from 'vitest';

import {
  meterFromCount,
  meterFromNarrativeAnchorMoments,
  meterFromProjectProfile,
  meterFromTimelineOffer,
} from './lorebookContentMeter';

describe('lorebookContentMeter', () => {
  it('builds a tiered timeline meter from offer counts', () => {
    const meter = meterFromTimelineOffer({
      eventCount: 2,
      uniqueDays: 1,
      wordCount: 40,
      canCreate: false,
      reason: 'Need more moments',
      subjectLabel: 'career',
    });
    expect(meter.ready).toBe(true); // vignette unlocked
    expect(meter.currentForm).toBe('vignette');
    expect(meter.nextForm).toBe('chapter');
    expect(meter.counterLabel).toMatch(/Chapter/i);
    expect(meter.segmentProgress?.length).toBe(5);
    expect(meter.progress).toBeGreaterThan(0);
    expect(meter.progress).toBeLessThan(1);
  });

  it('marks timeline meters ready with short LoreBook unlocked', () => {
    const meter = meterFromTimelineOffer({
      eventCount: 8,
      uniqueDays: 5,
      wordCount: 200,
      canCreate: true,
      reason: 'Enough',
      subjectLabel: 'family',
    });
    expect(meter.ready).toBe(true);
    expect(meter.currentForm).toBeTruthy();
    expect(meter.tierOffer?.unlocked).toContain('short_book');
  });

  it('scores project profiles toward the next form tier', () => {
    const meter = meterFromProjectProfile({
      purpose: '',
      tagline: '',
      currentPhase: '',
      brief: {
        what: '',
        why: '',
        currentState: '',
        lastActivity: '',
        nextStep: '',
      },
      stats: { momentCount: 2, threadCount: 1, dayCount: 3, lastActiveLabel: '' },
      milestones: [
        { id: '1', title: 'A', date: '2026-01-01', kind: 'start' },
        { id: '2', title: 'B', date: '2026-02-01', kind: 'milestone' },
      ],
      contributors: [],
      skills: [],
      resources: [],
      decisions: [],
      storyBeats: [],
      locations: [],
      openLoops: [],
    });
    expect(meter.ready).toBe(true);
    expect(meter.currentForm).toBe('chapter');
    expect(meter.nextForm).toBe('short_book');
    expect(meter.counterLabel).toMatch(/Short/i);
  });

  it('supports generic entity counters', () => {
    expect(meterFromCount(4, 6).counterLabel).toBe('4/6');
    expect(meterFromCount(6, 6).ready).toBe(true);
  });
});

describe('meterFromNarrativeAnchorMoments', () => {
  it('shows progress toward a vignette using only linked moments', () => {
    const meter = meterFromNarrativeAnchorMoments(1);
    expect(meter.counterLabel).toBe('Vignette · 1/2');
    expect(meter.ready).toBe(false);
  });

  it('advances through the available LoreBook forms', () => {
    const meter = meterFromNarrativeAnchorMoments(4);
    expect(meter.currentForm).toBe('chapter');
    expect(meter.nextForm).toBe('short_book');
    expect(meter.counterLabel).toBe('Short · 4/5');
  });
});
