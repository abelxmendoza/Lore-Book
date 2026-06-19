import { describe, it, expect } from 'vitest';
import { aggregateDomainCoverage } from './domainMapping';
import { buildGaps, scoreDimensions, topicToProfile, weightedProgress } from './readinessScorer';
import { getTopicById } from './topics';
import type { AtomSliceMetrics } from './atomIndexService';

describe('loreReadiness domainMapping', () => {
  it('aggregates friendship and romance into relationships topic', () => {
    const rows = [
      { domain: 'relationships', atomCount: 2, entryCount: 2 },
      { domain: 'friendship', atomCount: 3, entryCount: 2 },
      { domain: 'romance', atomCount: 1, entryCount: 1 },
    ];
    const result = aggregateDomainCoverage(rows, 'relationships');
    expect(result.atomCount).toBe(6);
    expect(result.entryCount).toBe(5);
  });
});

describe('loreReadiness scorer', () => {
  const baseMetrics: AtomSliceMetrics = {
    atoms: [],
    atomCount: 10,
    entryCount: 6,
    wordCount: 1200,
    atomTypeCounts: { event: 3, reflection: 2, achievement: 1 },
    timeSpanMonths: 18,
    entityIds: { characters: ['a'], locations: [] },
  };

  it('marks professional topic ready when thresholds met', () => {
    const topic = getTopicById('professional')!;
    const profile = topicToProfile(topic);
    const dimensions = scoreDimensions(baseMetrics, profile);
    const progress = weightedProgress(dimensions);
    expect(progress).toBeGreaterThanOrEqual(1);
    const gaps = buildGaps(baseMetrics, profile, 100, topic.label);
    expect(gaps.filter((g) => g.severity === 'blocker')).toHaveLength(0);
  });

  it('reports atom gaps when under threshold', () => {
    const topic = getTopicById('full_life')!;
    const profile = topicToProfile(topic);
    const sparse = { ...baseMetrics, atomCount: 5, entryCount: 2, timeSpanMonths: 2 };
    const gaps = buildGaps(sparse, profile, 100, topic.label);
    expect(gaps.some((g) => g.id === 'atoms')).toBe(true);
    expect(gaps.some((g) => g.id === 'entries')).toBe(true);
  });
});
