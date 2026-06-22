import { anchorMatchScore } from './narrativeAnchorRetriever';
import { entityMatchScore } from './entityAwareRetriever';
import { relationshipMatchScore } from './relationshipAwareRetriever';
import { timelineMatchScore } from './timelineAwareRetriever';
import type {
  RetrievalAnchorRef,
  RetrievalEntityRef,
  RetrievalMemoryRecord,
  RetrievalScoreBreakdown,
  RetrievedMemory,
} from './retrievalTypes';
import { truthRankWeight } from './truthStateRetrievalFilter';
import { requiresCarefulPhrasing } from './truthStateRetrievalFilter';

const WEIGHTS = {
  semantic: 0.12,
  entityMatch: 0.18,
  anchorMatch: 0.14,
  timelineMatch: 0.1,
  relationshipMatch: 0.1,
  emotional: 0.1,
  narrativeGravity: 0.16,
  recency: 0.03,
  frequency: 0.05,
  truthRank: 0.2,
  provenanceConfidence: 0.08,
};

function queryTextOverlap(record: RetrievalMemoryRecord, query: string): number {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3);
  if (tokens.length === 0) return 0;
  const text = record.text.toLowerCase();
  const hits = tokens.filter((t) => text.includes(t)).length;
  return hits / tokens.length;
}

export function scoreRecord(
  record: RetrievalMemoryRecord,
  query: string,
  entities: RetrievalEntityRef[],
  anchors: RetrievalAnchorRef[],
): RetrievalScoreBreakdown {
  const semantic = Math.min(1, Math.max(record.semanticScore, queryTextOverlap(record, query)));
  const entityMatch = entityMatchScore(record, query, entities);
  const anchorMatch = anchorMatchScore(record, anchors, query);
  const timelineMatch = timelineMatchScore(record, query);
  const relationshipMatch = relationshipMatchScore(record, query);
  const emotional = Math.min(1, record.emotionalWeight);
  const narrativeGravity = Math.min(1, record.narrativeGravity);
  const recency = Math.min(1, record.recencyScore);
  const frequency = Math.min(1, record.frequency / 5);
  const truthRank = truthRankWeight(record);
  const provenanceConfidence = Math.min(1, record.provenance.confidence);

  const total =
    semantic * WEIGHTS.semantic +
    entityMatch * WEIGHTS.entityMatch +
    anchorMatch * WEIGHTS.anchorMatch +
    timelineMatch * WEIGHTS.timelineMatch +
    relationshipMatch * WEIGHTS.relationshipMatch +
    emotional * WEIGHTS.emotional +
    narrativeGravity * WEIGHTS.narrativeGravity +
    recency * WEIGHTS.recency +
    frequency * WEIGHTS.frequency +
    truthRank * WEIGHTS.truthRank +
    provenanceConfidence * WEIGHTS.provenanceConfidence;

  return {
    semantic,
    entityMatch,
    anchorMatch,
    timelineMatch,
    relationshipMatch,
    emotional,
    narrativeGravity,
    recency,
    frequency,
    truthRank,
    provenanceConfidence,
    total,
  };
}

export function buildRetrievalReasons(breakdown: RetrievalScoreBreakdown): string[] {
  const reasons: string[] = [];
  if (breakdown.entityMatch >= 0.3) reasons.push('entity_match');
  if (breakdown.anchorMatch >= 0.25) reasons.push('narrative_anchor');
  if (breakdown.timelineMatch >= 0.2) reasons.push('timeline_era');
  if (breakdown.relationshipMatch >= 0.2) reasons.push('relationship_context');
  if (breakdown.narrativeGravity >= 0.5) reasons.push('narrative_gravity');
  if (breakdown.emotional >= 0.5) reasons.push('emotional_weight');
  if (breakdown.truthRank >= 0.85) reasons.push('canon_confirmed');
  if (breakdown.recency >= 0.7) reasons.push('recent_mention');
  return reasons;
}

export function rankRecords(
  records: RetrievalMemoryRecord[],
  query: string,
  entities: RetrievalEntityRef[],
  anchors: RetrievalAnchorRef[],
): RetrievedMemory[] {
  const scored = records.map((record) => {
    const breakdown = scoreRecord(record, query, entities, anchors);
    const retrievalReasons = buildRetrievalReasons(breakdown);
    return {
      record,
      score: breakdown.total,
      breakdown,
      provenance: record.provenance,
      carefulPhrasing: requiresCarefulPhrasing(record),
      retrievalReasons,
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

export function importantCanonBeatsRecentWeak(
  canon: RetrievedMemory,
  recentWeak: RetrievedMemory,
): boolean {
  return (
    canon.breakdown.truthRank > recentWeak.breakdown.truthRank &&
    canon.breakdown.narrativeGravity > recentWeak.breakdown.narrativeGravity &&
    canon.score > recentWeak.score
  );
}
