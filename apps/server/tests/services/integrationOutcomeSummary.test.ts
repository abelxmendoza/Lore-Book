import { describe, expect, it } from 'vitest';

import { buildIntegrationOutcomeSummary } from '../../src/services/ingestion/integrationOutcomeSummary';

describe('integration production outcomes', () => {
  it('reports successful, skipped, and unobserved projections separately', () => {
    const summary = buildIntegrationOutcomeSummary({
      entityResolutionFailed: false,
      knowledgeUnitsCreated: 2,
      knowledgeUnitsTouched: 1,
      eventsAssembled: 1,
      entitiesCreated: 0,
      eventCandidatesCreated: 2,
    });

    expect(summary.complete).toBe(true);
    expect(summary.stages.assertion_extraction.status).toBe('updated');
    expect(summary.projections.timeline.status).toBe('updated');
    expect(summary.projections.character_book.status).toBe('no_change');
    expect(summary.projections.relationships.status).toBe('unavailable');
    expect(summary.projections.publishing).toMatchObject({ status: 'skipped' });
  });

  it('makes entity-resolution degradation and unreadable counts retryable', () => {
    const summary = buildIntegrationOutcomeSummary({
      entityResolutionFailed: true,
      knowledgeUnitsCreated: -1,
      knowledgeUnitsTouched: 0,
      eventsAssembled: 0,
      entitiesCreated: 0,
      eventCandidatesCreated: 0,
    });

    expect(summary.complete).toBe(false);
    expect(summary.retryable).toBe(true);
    expect(summary.stages.entity_resolution.status).toBe('degraded');
    expect(summary.stages.assertion_extraction.status).toBe('unavailable');
    expect(summary.failedStages).toEqual(expect.arrayContaining([
      'entity_resolution',
      'summary_count:knowledgeUnitsCreated',
    ]));
  });
});

