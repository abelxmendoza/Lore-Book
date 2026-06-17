import { describe, it, expect } from 'vitest';
import {
  computeLoreReadiness,
  computeTopicReadiness,
  LORE_TOPICS,
} from './loreReadiness';
import {
  MOCK_CONTENT_STATS_SPARSE,
  MOCK_CONTENT_STATS_RICH,
} from '../mocks/loreReadiness';

describe('loreReadiness', () => {
  it('marks sparse mock as not enough for full life', () => {
    const summary = computeLoreReadiness(MOCK_CONTENT_STATS_SPARSE);
    expect(summary.canGenerateAnyBook).toBe(false);
    expect(summary.overallLevel).toBe('needs_more');
    expect(summary.readyTopicCount).toBe(0);
  });

  it('marks rich mock as ready for multiple topics', () => {
    const summary = computeLoreReadiness(MOCK_CONTENT_STATS_RICH);
    expect(summary.canGenerateAnyBook).toBe(true);
    expect(summary.readyTopicCount).toBeGreaterThan(2);
  });

  it('computes per-topic progress with atom and entry thresholds', () => {
    const professional = LORE_TOPICS.find((t) => t.id === 'professional')!;
    const topic = computeTopicReadiness(professional, MOCK_CONTENT_STATS_RICH);
    expect(topic.canGenerate).toBe(true);
    expect(topic.level).toBe('ready');
  });
});
