/**
 * Autobiographical importance scoring.
 *
 * Replaces recency/mention-count ranking with a transparent weighted formula.
 * Foundational material (education, career transitions, family, long-term
 * projects and communities) generally outranks isolated recent anecdotes;
 * recency is one small signal, not the sort key.
 */
import {
  ACHIEVEMENT_RE,
  EMPHASIS_RE,
  NEGATIVE_MOODS,
  POSITIVE_MOODS,
  TRANSITION_RE,
} from './lexicons';
import {
  FOUNDATIONAL_DOMAINS,
  type CanonicalEvent,
  type EvidenceRecord,
  type ImportanceSignals,
  type KnownEntity,
} from './narrativeRecords';

/** Configurable weights; must stay in sync with ImportanceSignals keys. */
export const IMPORTANCE_WEIGHTS: Record<keyof ImportanceSignals, number> = {
  identityRelevance: 0.16,
  lifeChangeMagnitude: 0.16,
  duration: 0.09,
  emotionalImpact: 0.08,
  recurrenceAcrossTime: 0.1,
  userEmphasis: 0.08,
  relationshipSignificance: 0.08,
  achievementSignificance: 0.09,
  causalImpact: 0.06,
  recency: 0.03,
  evidenceStrength: 0.07,
};

const KIN_OR_PARTNER_RE = /\b(uncle|aunt|t[ií][oa]|cousin|mom|dad|mother|father|brother|sister|grandma|grandpa|abuel[oa]|partner|girlfriend|boyfriend|wife|husband|best friend)\b/i;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function monthsSpanned(dates: string[]): number {
  const months = new Set(dates.map((d) => d.slice(0, 7)));
  return months.size;
}

export function computeImportanceSignals(
  event: CanonicalEvent,
  evidenceById: Map<string, EvidenceRecord>,
  allEvents: CanonicalEvent[],
  entities: KnownEntity[],
  now: Date = new Date()
): ImportanceSignals {
  const evidence = event.evidenceIds
    .map((id) => evidenceById.get(id))
    .filter((r): r is EvidenceRecord => Boolean(r));
  const combinedText = evidence.map((r) => r.text).join(' ');
  const entityById = new Map(entities.map((e) => [e.id, e]));

  const foundationalHits = event.domains.filter((d) => FOUNDATIONAL_DOMAINS.has(d)).length;
  const identityRelevance = clamp01(foundationalHits / 2);

  const lifeChangeMagnitude = TRANSITION_RE.test(combinedText) ? 1 : 0;
  const achievementSignificance = ACHIEVEMENT_RE.test(combinedText) ? 1 : 0;
  const userEmphasis = clamp01(
    (EMPHASIS_RE.test(combinedText) ? 0.7 : 0) +
      (evidence.some((r) =>
        ['testimony', 'vow', 'manifesto', 'declaration', 'dedication'].includes(r.contentType ?? '')
      )
        ? 0.5
        : 0)
  );

  const spanDays =
    event.startTime && event.endTime
      ? Math.abs(Date.parse(event.endTime) - Date.parse(event.startTime)) / 86_400_000
      : 0;
  const duration = clamp01(Math.log10(1 + spanDays) / 2.5); // ~1.0 at ~1 year

  const evidenceDates = evidence.map((r) => r.date).filter((d): d is string => Boolean(d));
  const recurrenceAcrossTime = clamp01((monthsSpanned(evidenceDates) - 1) / 5);

  let emotionalImpact = 0;
  for (const r of evidence) {
    if (typeof r.emotionalIntensity === 'number') {
      emotionalImpact = Math.max(emotionalImpact, clamp01(r.emotionalIntensity));
    }
    const mood = r.mood?.toLowerCase();
    if (mood && (NEGATIVE_MOODS.has(mood) || POSITIVE_MOODS.has(mood))) {
      emotionalImpact = Math.max(emotionalImpact, 0.6);
    }
  }

  const relationshipSignificance = clamp01(
    (KIN_OR_PARTNER_RE.test(combinedText) ? 0.6 : 0) +
      event.entityIds.filter((id) => {
        const role = entityById.get(id)?.relationshipRole?.toLowerCase() ?? '';
        return KIN_OR_PARTNER_RE.test(role);
      }).length *
        0.4
  );

  // Causal impact: later events that continue this event's thread (same
  // domain + a shared entity or organization) suggest it set a trajectory.
  const laterContinuations = allEvents.filter((other) => {
    if (other.id === event.id) return false;
    if (!other.startTime || !event.startTime || other.startTime <= event.startTime) return false;
    const sharedDomain = other.domains.some((d) => event.domains.includes(d));
    const sharedActor =
      other.entityIds.some((id) => event.entityIds.includes(id)) ||
      other.organizationIds.some((id) => event.organizationIds.includes(id));
    return sharedDomain && sharedActor;
  }).length;
  const causalImpact = clamp01(laterContinuations / 4);

  let recency = 0;
  if (event.endTime ?? event.startTime) {
    const ageDays = (now.getTime() - Date.parse(event.endTime ?? event.startTime!)) / 86_400_000;
    recency = clamp01(Math.exp(-Math.max(0, ageDays) / 180));
  }

  const sources = new Set(evidence.map((r) => r.source));
  const evidenceStrength = clamp01(evidence.length / 4 + (sources.size - 1) * 0.2);

  return {
    identityRelevance,
    duration,
    lifeChangeMagnitude,
    emotionalImpact,
    recurrenceAcrossTime,
    userEmphasis,
    relationshipSignificance,
    achievementSignificance,
    causalImpact,
    recency,
    evidenceStrength,
  };
}

export function weightedImportance(
  signals: ImportanceSignals,
  weights: Record<keyof ImportanceSignals, number> = IMPORTANCE_WEIGHTS
): number {
  let score = 0;
  for (const key of Object.keys(weights) as (keyof ImportanceSignals)[]) {
    score += weights[key] * signals[key];
  }
  return Math.round(score * 1000) / 1000;
}

/** Score every canonical event in place and return them sorted by importance. */
export function scoreEvents(
  events: CanonicalEvent[],
  records: EvidenceRecord[],
  entities: KnownEntity[],
  now?: Date
): CanonicalEvent[] {
  const evidenceById = new Map(records.map((r) => [r.id, r]));
  for (const event of events) {
    const signals = computeImportanceSignals(event, evidenceById, events, entities, now);
    event.importanceSignals = signals;
    event.importanceScore = weightedImportance(signals);
  }
  return [...events].sort((a, b) => b.importanceScore - a.importanceScore);
}
