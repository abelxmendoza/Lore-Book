import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/trust/knowledgeCoverageService', () => ({
  auditAllDomainCoverage: vi.fn(),
}));

vi.mock('../../src/services/trust/knowledgeStateService', () => ({
  classifyAllDomainStates: vi.fn(),
  aggregateStateTotals: vi.fn(),
}));

vi.mock('../../src/services/trust/unknownDetectionService', () => ({
  detectUnknowns: vi.fn(),
}));

vi.mock('../../src/services/trust/reviewPriorityService', () => ({
  buildReviewQueue: vi.fn(),
}));

import { auditAllDomainCoverage } from '../../src/services/trust/knowledgeCoverageService';
import { classifyAllDomainStates, aggregateStateTotals } from '../../src/services/trust/knowledgeStateService';
import { detectUnknowns } from '../../src/services/trust/unknownDetectionService';
import { buildReviewQueue } from '../../src/services/trust/reviewPriorityService';
import { buildTrustOverview, formatBookTrustLine } from '../../src/services/trust/trustCenterService';

describe('trustCenterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(classifyAllDomainStates).mockResolvedValue({
      byDomain: {
        characters: { known: 10, suggested: 2, unverified: 1, conflicted: 1, archived: 0 },
      },
      entities: [],
    });

    vi.mocked(auditAllDomainCoverage).mockResolvedValue([
      {
        domain: 'characters',
        entity_count: 14,
        evidence_count: 20,
        coverage_score: 72,
        confidence_distribution: { high: 5, medium: 6, low: 2, none: 1 },
        states: { known: 8, suggested: 2, unverified: 1, conflicted: 1, archived: 0 },
      },
    ]);

    vi.mocked(detectUnknowns).mockResolvedValue([
      {
        id: 'gap-1',
        kind: 'mentioned_person_no_profile',
        label: 'Alex',
        prompt: 'Who is Alex?',
        domain: 'characters',
        priority: 80,
      },
    ]);

    vi.mocked(buildReviewQueue).mockResolvedValue({
      conflicts: [
        {
          id: 'c-1',
          kind: 'duplicate_entity',
          title: 'Jordan duplicate',
          reason: 'unresolved',
          domain: 'characters',
          priority: 88,
        },
      ],
      review_queue: [
        {
          id: 'r-1',
          kind: 'mentioned_person_no_profile',
          title: 'Alex',
          reason: 'Who is Alex?',
          domain: 'characters',
          priority: 80,
          action: 'fill_gap',
        },
      ],
    });

    vi.mocked(aggregateStateTotals).mockReturnValue({
      known: 10,
      suggested: 2,
      unverified: 1,
      conflicted: 1,
      archived: 0,
    });
  });

  it('buildTrustOverview merges coverage, unknowns, and review queue', async () => {
    const overview = await buildTrustOverview('user-1');

    expect(overview.user_id).toBe('user-1');
    expect(overview.overall_coverage_score).toBe(72);
    expect(overview.coverage[0].states.known).toBe(10);
    expect(overview.unknowns).toHaveLength(1);
    expect(overview.conflicts).toHaveLength(1);
    expect(overview.review_queue).toHaveLength(1);
    expect(overview.state_totals.known).toBe(10);
  });

  it('formatBookTrustLine summarizes entity states', () => {
    const line = formatBookTrustLine('characters', {
      domain: 'characters',
      entity_count: 14,
      evidence_count: 20,
      coverage_score: 72,
      confidence_distribution: { high: 0, medium: 0, low: 0, none: 0 },
      states: { known: 10, suggested: 2, unverified: 1, conflicted: 1, archived: 0 },
    });

    expect(line).toContain('14 total');
    expect(line).toContain('2 suggested');
    expect(line).toContain('1 conflicts');
  });
});
