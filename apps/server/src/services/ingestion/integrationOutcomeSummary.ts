export type IntegrationOutcomeStatus =
  | 'completed'
  | 'updated'
  | 'no_change'
  | 'skipped'
  | 'degraded'
  | 'unavailable';

export type IntegrationOutcome = {
  status: IntegrationOutcomeStatus;
  reason: string;
  retryable?: boolean;
};

export function buildIntegrationOutcomeSummary(input: {
  entityResolutionFailed: boolean;
  knowledgeUnitsCreated: number;
  knowledgeUnitsTouched: number;
  eventsAssembled: number;
  entitiesCreated: number;
  eventCandidatesCreated: number;
}) {
  const unavailableCounts = Object.entries(input)
    .filter(([key, value]) => key !== 'entityResolutionFailed' && typeof value === 'number' && value < 0)
    .map(([key]) => key);
  const eventWork = Math.max(0, input.eventsAssembled) + Math.max(0, input.eventCandidatesCreated);
  const knowledgeWork = Math.max(0, input.knowledgeUnitsCreated) + Math.max(0, input.knowledgeUnitsTouched);

  const stages: Record<string, IntegrationOutcome> = {
    focus_resolution: {
      status: 'completed',
      reason: 'navigation focus was read from the durable message when present',
    },
    entity_resolution: input.entityResolutionFailed
      ? { status: 'degraded', reason: 'provider resolution failed; tenant book matches were used as a safe floor', retryable: true }
      : { status: 'completed', reason: 'canonical entity resolution completed' },
    assertion_extraction: unavailableCounts.some((key) => key.startsWith('knowledgeUnits'))
      ? { status: 'unavailable', reason: 'knowledge-unit counts could not be read', retryable: true }
      : knowledgeWork > 0
        ? { status: 'updated', reason: `${knowledgeWork} knowledge unit write or reinforcement operation(s) observed` }
        : { status: 'no_change', reason: 'no durable assertion change was observed' },
    event_decomposition: unavailableCounts.some((key) => key.includes('event'))
      ? { status: 'unavailable', reason: 'event counts could not be read', retryable: true }
      : eventWork > 0
        ? { status: 'updated', reason: `${eventWork} event or event-candidate operation(s) observed` }
        : { status: 'no_change', reason: 'no timeline-eligible occurrence was produced' },
  };

  const projections: Record<string, IntegrationOutcome> = {
    character_book: input.entitiesCreated < 0
      ? { status: 'unavailable', reason: 'character projection count could not be read', retryable: true }
      : input.entitiesCreated > 0
        ? { status: 'updated', reason: `${input.entitiesCreated} canonical character row(s) created` }
        : { status: 'no_change', reason: 'existing focused/linked characters were reused or no character was asserted' },
    timeline: input.eventsAssembled < 0
      ? { status: 'unavailable', reason: 'timeline projection count could not be read', retryable: true }
      : input.eventsAssembled > 0
        ? { status: 'updated', reason: `${input.eventsAssembled} resolved event(s) assembled` }
        : { status: 'skipped', reason: 'no timeline-eligible event was assembled' },
    narrative: eventWork > 0
      ? { status: 'completed', reason: 'event work is available to Narrative IR refreshers' }
      : { status: 'skipped', reason: 'no event or event candidate required narrative refresh' },
    relationships: {
      status: 'unavailable',
      reason: 'this production summary does not yet count relationship projection writes',
    },
    identity: {
      status: 'unavailable',
      reason: 'this production summary does not yet count identity projection refreshes',
    },
    publishing: {
      status: 'skipped',
      reason: 'publishing is derived on demand and is not mutated by ingestion',
    },
  };

  const failedStages = [
    ...(input.entityResolutionFailed ? ['entity_resolution'] : []),
    ...unavailableCounts.map((name) => `summary_count:${name}`),
  ];

  return {
    version: 'integration-outcomes-v1' as const,
    stages,
    projections,
    failedStages,
    retryable: failedStages.length > 0,
    complete: failedStages.length === 0,
  };
}

