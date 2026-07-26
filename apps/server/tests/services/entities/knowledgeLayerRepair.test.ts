import { describe, expect, it } from 'vitest';

import { computeLearningScore } from '../../../src/services/entities/learningScore';
import { factContentKey, employmentOrProjectClusterKey } from '../../../src/services/entities/entityFactDedup';
import {
  classifySelfFactForCleanup,
  markClusterLosers,
  syntheticCleanupFixture,
} from '../../../src/scripts/cleanupSelfEntityFacts';

describe('employment / project clustering', () => {
  it('collapses Amazon/Ring employment paraphrases onto one key', () => {
    const a = factContentKey('Works at Amazon as a QA technician');
    const b = factContentKey('Works at Ring');
    const c = factContentKey('Is currently working at Amazon');
    expect(a).toBe('cluster:employer:amazon_ring');
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('clusters LoreBook project activity', () => {
    expect(employmentOrProjectClusterKey('is building lorebook')).toBe('cluster:project:lorebook');
    expect(factContentKey('Is actively working on LoreBook')).toBe('cluster:project:lorebook');
  });
});

describe('computeLearningScore', () => {
  it('does not award 100 for huge duplicate volume with zero patterns', () => {
    const facts = Array.from({ length: 1000 }, (_, i) => ({
      fact: i % 2 === 0 ? 'Works at Vanguard Robotics' : 'Works at Vanguard',
      category: 'career',
      confidence: 0.9,
      status: 'active',
      mention_count: 1,
    }));
    const score = computeLearningScore({
      facts,
      patternCount: 0,
      timelineEventCount: 0,
    });
    expect(score).toBeLessThan(100);
    expect(score).toBeLessThanOrEqual(72);
  });

  it('rewards coherent coverage with patterns and timeline', () => {
    const score = computeLearningScore({
      facts: [
        {
          fact: 'Works at Vanguard Robotics',
          category: 'career',
          confidence: 0.95,
          status: 'active',
          mention_count: 3,
          metadata: { evidence_ids: ['a', 'b', 'c'], confirmation_count: 3 },
        },
        {
          fact: 'Building MemoVault',
          category: 'goals',
          confidence: 0.9,
          status: 'active',
          mention_count: 2,
          metadata: { evidence_ids: ['d', 'e'] },
        },
        {
          fact: 'Lives in Los Angeles',
          category: 'location',
          confidence: 0.85,
          status: 'active',
          mention_count: 2,
          metadata: { evidence_ids: ['f'] },
        },
      ],
      patternCount: 4,
      timelineEventCount: 5,
      identityMentionCount: 2,
      memoryCount: 10,
    });
    expect(score).toBeGreaterThan(50);
  });
});

describe('cleanupSelfEntityFacts classification', () => {
  it('classifies synthetic fixture rows without founder PII', () => {
    const classified = markClusterLosers(
      syntheticCleanupFixture().map(classifySelfFactForCleanup),
    );
    const byId = Object.fromEntries(classified.map((r) => [r.id, r.action]));
    expect(byId.f1).toBe('contradict-as-conversational');
    expect(byId.f2).toBe('contradict-as-ephemeral');
    expect(byId.f5).toBe('contradict-as-subject');
    expect(['keep', 'cluster-into-canonical', 'flag-sensitive']).toContain(byId.f3);
    expect(['keep', 'cluster-into-canonical']).toContain(byId.f4);
    const clusterLoser = classified.find((r) => r.action === 'cluster-into-canonical');
    expect(clusterLoser).toBeTruthy();
  });
});
