import { describe, expect, it } from 'vitest';

import { clusterEligibleForPhysicalMerge, pickMergeTitle } from './duplicateMergePolicy';
import { clusterDuplicateEvents, type CanonicalizableEvent } from './eventCanonicalization';

describe('clusterEligibleForPhysicalMerge', () => {
  it('allows single-thread clusters', () => {
    const result = clusterEligibleForPhysicalMerge([
      { title: 'Harbor Fair', summary: 'Went to the harbor fair', threadId: 't-1' },
      { title: 'Harbor Fair Visit', summary: 'Visited the harbor fair', threadId: 't-1' },
    ]);
    expect(result.eligible).toBe(true);
  });

  it('allows clusters with no thread ids (recovery/reflection rows)', () => {
    const result = clusterEligibleForPhysicalMerge([
      { title: 'Harbor Fair', summary: 'Went to the harbor fair' },
      { title: 'Harbor Fair Visit', summary: 'Visited the harbor fair' },
    ]);
    expect(result.eligible).toBe(true);
  });

  it('rejects cross-thread clusters with deictic content', () => {
    const result = clusterEligibleForPhysicalMerge([
      { title: 'Recap Everything We Discussed In This Thread', summary: 'Recap everything we discussed in this thread.', threadId: 't-1' },
      { title: 'Recap Everything We Discussed In This Thread', summary: 'Recap everything we discussed in this thread.', threadId: 't-2' },
    ]);
    expect(result).toEqual({ eligible: false, reason: 'cross-thread deictic content' });
  });

  it('rejects cross-thread clusters where every title is a generic shell', () => {
    const result = clusterEligibleForPhysicalMerge([
      { title: 'Captured Conversation', summary: 'hi im Rey Solano', threadId: 't-1' },
      { title: 'Captured Conversation', summary: 'hi Rey Solano', threadId: 't-2' },
    ]);
    expect(result).toEqual({ eligible: false, reason: 'cross-thread with only generic titles' });
  });

  it('allows cross-thread clusters when one member has a real title', () => {
    const result = clusterEligibleForPhysicalMerge([
      { title: 'Captured Conversation', summary: 'Saltwind Pier concert sounded great on the way in', threadId: 't-1' },
      { title: 'Saltwind Pier Concert', summary: 'Saltwind Pier concert sounded great on the way in', threadId: 't-2' },
    ]);
    expect(result.eligible).toBe(true);
  });
});

describe('pickMergeTitle', () => {
  const ev = (id: string, title: string, time: string): CanonicalizableEvent => ({
    id,
    title,
    summary: 'Saltwind Pier concert sounded great on the way in with Quinn',
    time,
  });

  it('never lets a generic shell title win over a publishable one', () => {
    const clusters = clusterDuplicateEvents([
      ev('e-a', 'Captured Conversation', '2026-06-03T14:00:00Z'),
      ev('e-b', 'Saltwind Pier Concert', '2026-06-03T15:00:00Z'),
    ]);
    expect(clusters).toHaveLength(1);
    expect(pickMergeTitle(clusters[0])).toBe('Saltwind Pier Concert');
  });

  it('keeps the cluster pick when it is already publishable', () => {
    const clusters = clusterDuplicateEvents([
      ev('e-a', 'Saltwind Pier Concert With Quinn', '2026-06-03T14:00:00Z'),
      ev('e-b', 'Pier Concert', '2026-06-03T15:00:00Z'),
    ]);
    expect(clusters).toHaveLength(1);
    expect(pickMergeTitle(clusters[0])).toBe('Saltwind Pier Concert With Quinn');
  });
});
