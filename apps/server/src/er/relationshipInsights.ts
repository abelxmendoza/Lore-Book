/**
 * Relationship Insights — Phase 3.2
 * Rule-based, explainable insights from temporal edge data.
 * No new schema, no ML.
 */

import { daysBetween } from './timeUtils';
import type { RelationshipPhase } from './temporalEdgeService';
import type { RelationshipScope } from './scopeInference';

export type RelationshipInsightType =
  | 'FADE_WARNING'
  | 'REACTIVATION'
  | 'CORE_STABILITY'
  | 'SCOPE_CONCENTRATION'
  | 'REPEATED_PATTERN';

export type RelationshipInsight = {
  type: RelationshipInsightType;
  entity_id: string;
  scope: RelationshipScope;
  phase: RelationshipPhase;
  confidence: number;
  explanation: string;
  supporting_evidence: {
    last_seen?: string;
    evidence_count: number;
    age_days: number;
  };
};

/** Edge shape used by generators; expects at least TemporalEdgeRow fields. */
type EdgeForInsights = {
  phase: string;
  last_evidence_at?: string | null;
  to_entity_id?: string;
  confidence: number;
  evidence_source_ids?: string[] | null;
  start_time?: string | null;
  scope?: string | null;
};

const FADE_RECENCY_DAYS = 45;

function now(): Date {
  return new Date();
}

/**
 * FADE_WARNING: WEAK phase and no evidence for >= 45 days.
 * Returns null if to_entity_id is missing.
 */
export function generateFadeWarning(edge: EdgeForInsights): RelationshipInsight | null {
  if (edge.phase !== 'WEAK') return null;

  const recencyDays = edge.last_evidence_at
    ? daysBetween(edge.last_evidence_at, now())
    : Infinity;

  if (recencyDays < FADE_RECENCY_DAYS) return null;
  if (!edge.to_entity_id) return null;

  const scope = (edge.scope ?? 'global') as RelationshipScope;
  const ageDays = edge.start_time ? daysBetween(edge.start_time, now()) : 0;

  return {
    type: 'FADE_WARNING',
    entity_id: edge.to_entity_id,
    scope,
    phase: edge.phase as RelationshipPhase,
    confidence: edge.confidence,
    explanation: 'This connection has weakened due to lack of recent interaction.',
    supporting_evidence: {
      last_seen: edge.last_evidence_at ?? undefined,
      evidence_count: edge.evidence_source_ids?.length ?? 0,
      age_days: ageDays,
    },
  };
}

/**
 * CORE_STABILITY: CORE phase and confidence >= 0.85.
 * Returns null if to_entity_id is missing.
 */
export function generateCoreStability(edge: EdgeForInsights): RelationshipInsight | null {
  if (edge.phase !== 'CORE') return null;
  if (edge.confidence < 0.85) return null;
  if (!edge.to_entity_id) return null;

  const scope = (edge.scope ?? 'global') as RelationshipScope;
  const ageDays = edge.start_time ? daysBetween(edge.start_time, now()) : 0;

  return {
    type: 'CORE_STABILITY',
    entity_id: edge.to_entity_id,
    scope,
    phase: edge.phase as RelationshipPhase,
    confidence: edge.confidence,
    explanation: 'This relationship has remained central and stable over time.',
    supporting_evidence: {
      last_seen: edge.last_evidence_at ?? undefined,
      evidence_count: edge.evidence_source_ids?.length ?? 0,
      age_days: ageDays,
    },
  };
}

const SCOPE_CONCENTRATION_MIN_ACTIVE = 5;

/**
 * SCOPE_CONCENTRATION: >= 5 ACTIVE edges in a scope.
 * entity_id = 'scope:' + scope.
 */
export function generateScopeConcentrationInsights(
  edges: EdgeForInsights[],
  scope: string
): RelationshipInsight[] {
  const activeEdges = edges.filter((e) => e.scope === scope && e.phase === 'ACTIVE');

  if (activeEdges.length < SCOPE_CONCENTRATION_MIN_ACTIVE) return [];

  return [
    {
      type: 'SCOPE_CONCENTRATION',
      entity_id: 'scope:' + scope,
      scope: scope as RelationshipScope,
      phase: 'ACTIVE',
      confidence: 0.7,
      explanation: `A large portion of your active relationships are concentrated in ${scope}.`,
      supporting_evidence: {
        evidence_count: activeEdges.length,
        age_days: 0,
      },
    },
  ];
}

const TYPE_ORDER: RelationshipInsightType[] = [
  'FADE_WARNING',
  'REACTIVATION',
  'CORE_STABILITY',
  'SCOPE_CONCENTRATION',
  'REPEATED_PATTERN',
];

function typePriority(t: RelationshipInsightType): number {
  const i = TYPE_ORDER.indexOf(t);
  return i >= 0 ? i : TYPE_ORDER.length;
}

/**
 * Sorts insights by relevance: type priority (FADE_WARNING first) then confidence desc.
 */
export function sortInsightsByRelevance(insights: RelationshipInsight[]): RelationshipInsight[] {
  return [...insights].sort((a, b) => {
    const pa = typePriority(a.type);
    const pb = typePriority(b.type);
    if (pa !== pb) return pa - pb;
    return b.confidence - a.confidence;
  });
}

/**
 * Pipeline: per-edge FADE_WARNING and CORE_STABILITY; per-scope SCOPE_CONCENTRATION.
 * REACTIVATION and REPEATED_PATTERN have no generators (reserved for future rules).
 */
export function generateRelationshipInsights(edges: EdgeForInsights[]): RelationshipInsight[] {
  const insights: RelationshipInsight[] = [];

  for (const edge of edges) {
    const fade = generateFadeWarning(edge);
    if (fade) insights.push(fade);

    const core = generateCoreStability(edge);
    if (core) insights.push(core);
  }

  const scopes = new Set(edges.map((e) => e.scope ?? 'global'));
  for (const scope of scopes) {
    insights.push(...generateScopeConcentrationInsights(edges, scope));
  }

  return sortInsightsByRelevance(insights);
}
