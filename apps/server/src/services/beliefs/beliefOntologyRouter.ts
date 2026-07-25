import type {
  BeliefRoutingTarget,
  PropositionDomain,
  PropositionDurability,
  SpeechAct,
} from './beliefTypes';

export function routeBeliefOntology(input: {
  speechAct: SpeechAct;
  domain: PropositionDomain;
  durability: PropositionDurability;
  eligible: boolean;
}): BeliefRoutingTarget {
  const { speechAct, domain, durability, eligible } = input;

  if (!eligible || durability === 'NOT_MEMORY_WORTHY') {
    if (domain === 'ASSISTANT_FEEDBACK' || speechAct === 'SYSTEM_FEEDBACK') return 'ASSISTANT_FEEDBACK';
    if (domain === 'UI_PREFERENCE' || speechAct === 'UI_FEEDBACK') return 'UI_PREFERENCE';
    if (domain === 'PRODUCT_REQUIREMENT' || domain === 'PROJECT_GOAL') return 'PROJECT_GOAL';
    return 'REJECT';
  }

  if (domain === 'CORRECTION') return 'CORRECTION_QUEUE';
  if (domain === 'EVENT' || durability === 'EVENT_ONLY') return 'EVENT';
  if (domain === 'PLAN' || durability === 'PLAN_ONLY') return 'PLAN';
  if (
    domain === 'EMOTIONAL_STATE'
    || domain === 'PHYSICAL_STATE'
    || durability === 'TEMPORARY_STATE'
  ) {
    return 'TEMPORAL_STATE';
  }
  if (domain === 'PROJECT_GOAL') return 'PROJECT_GOAL';
  if (domain === 'PRODUCT_REQUIREMENT') return 'PROJECT_REQUIREMENT';
  if (domain === 'UI_PREFERENCE') return 'UI_PREFERENCE';
  if (domain === 'RELATIONSHIP') return 'RELATIONSHIP_GRAPH';
  if (domain === 'ENTITY_CLASSIFICATION' || domain === 'WORLD_FACT') return 'ENTITY_REGISTRY';
  if (domain === 'ALLEGATION') return 'CORRECTION_QUEUE';

  return 'TRUTH_STATE';
}
