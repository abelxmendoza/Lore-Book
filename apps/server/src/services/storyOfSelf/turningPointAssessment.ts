/**
 * Turning-point detection with explicit before/after requirements.
 *
 * A turning point is an event that creates a substantial, durable difference
 * in one or more life domains. Candidates must carry transition language and
 * show persistence (later evidence consistent with the new state). Everything
 * else is rejected with a reason that lands in the trace — routine onboarding
 * updates, entity metadata, and isolated anecdotes never qualify.
 *
 * Arc labels (victory/fall/awakening/…) are validated against valence
 * evidence: positive belonging can never be labeled a "fall", and weak
 * evidence defaults to ordinary_event or transition.
 */
import {
  ACHIEVEMENT_RE,
  CONFLICT_RE,
  LOSS_RE,
  POSITIVE_VALENCE_RE,
  REALIZATION_RE,
  TRANSITION_RE,
  estimateValence,
} from './lexicons';
import {
  assertCanonicalEvents,
  type ArcLabel,
  type CanonicalEvent,
  type EvidenceRecord,
  type LifeDomain,
  type TurningPointAssessment,
} from './narrativeRecords';

const MIN_MAGNITUDE = 0.45;

const DOMAIN_STATE_HINTS: Partial<Record<LifeDomain, RegExp>> = {
  career: /\b(started (a )?(new )?job|got (hired|fired|laid off|promoted)|quit|switched careers?|first day at)\b/i,
  education: /\b(graduated|earned (my|a) degree|dropped out|went back to school|finished (my|the) (degree|program))\b/i,
  location: /\b(moved (in|out|to|across)|relocat(ed|ing))\b/i,
  relationships: /\b(broke up|breakup|got (engaged|married|divorced)|started dating|ended (the|our) relationship)\b/i,
  community: /\b(joined|left) (the )?(band|team|gym|dojo|church|scene|crew)\b/i,
  health: /\b(diagnosed|recovered|hospitalized|sober|injur(y|ed))\b/i,
  beliefs: /\b(realiz(ed|ation)|changed (how|the way) i (see|think)|stopped believing|found faith)\b/i,
};

export function classifyArcLabel(
  combinedText: string,
  moods: (string | undefined)[],
  evidenceCount: number
): { label: ArcLabel; reasoning: string } {
  const valence = estimateValence(combinedText, moods.find(Boolean) ?? null);
  const hasLoss = LOSS_RE.test(combinedText);
  const hasAchievement = ACHIEVEMENT_RE.test(combinedText);
  const hasRealization = REALIZATION_RE.test(combinedText);
  const hasConflict = CONFLICT_RE.test(combinedText);
  const hasTransition = TRANSITION_RE.test(combinedText);
  const positiveBelonging = POSITIVE_VALENCE_RE.test(combinedText);

  // "fall" demands explicit loss language AND non-positive valence. Welcoming
  // coworkers and easy connection are the opposite of a fall.
  if (hasLoss && valence <= 0 && !positiveBelonging) {
    return { label: 'fall', reasoning: 'explicit loss/decline language with negative valence' };
  }
  if (hasAchievement && valence >= 0) {
    return { label: 'victory', reasoning: 'achievement language with non-negative valence' };
  }
  if (hasRealization && evidenceCount >= 2) {
    return {
      label: 'awakening',
      reasoning: 'stated realization supported by more than one piece of evidence',
    };
  }
  if (hasConflict && evidenceCount >= 2) {
    return { label: 'conflict', reasoning: 'sustained tension across multiple records' };
  }
  if (hasTransition) {
    return { label: 'transition', reasoning: 'state change without clear positive/negative valence' };
  }
  return { label: 'ordinary_event', reasoning: 'no dramatic label supported by the evidence' };
}

function affectedDomains(event: CanonicalEvent, text: string): LifeDomain[] {
  const affected = new Set<LifeDomain>();
  for (const [domain, re] of Object.entries(DOMAIN_STATE_HINTS) as [LifeDomain, RegExp][]) {
    if (re.test(text) && event.domains.includes(domain)) affected.add(domain);
  }
  // Transition language in a domain the event clearly lives in still counts
  // even when our per-domain hints miss the phrasing.
  if (affected.size === 0 && TRANSITION_RE.test(text)) {
    for (const d of event.domains) {
      if (d !== 'recreation') affected.add(d);
    }
  }
  return [...affected];
}

/**
 * Domains whose later activity still counts as the change persisting —
 * finishing a degree persists through the career it opened.
 */
const RELATED_DOMAINS: Partial<Record<LifeDomain, LifeDomain[]>> = {
  education: ['career', 'projects'],
  career: ['projects'],
  community: ['relationships'],
  location: ['career', 'community'],
};

/** Later events consistent with the new state ⇒ the change stuck. */
function measurePersistence(
  event: CanonicalEvent,
  domains: LifeDomain[],
  allEvents: CanonicalEvent[]
): number {
  if (!event.startTime) return 0;
  const persistent = new Set<LifeDomain>(domains);
  for (const d of domains) for (const r of RELATED_DOMAINS[d] ?? []) persistent.add(r);
  const later = allEvents.filter(
    (e) =>
      e.id !== event.id &&
      e.startTime &&
      e.startTime > event.startTime! &&
      e.domains.some((d) => persistent.has(d))
  );
  if (later.length === 0) return 0;
  const months = new Set(later.map((e) => e.startTime!.slice(0, 7)));
  return Math.min(1, months.size / 3);
}

export function assessTurningPoints(
  events: CanonicalEvent[],
  evidenceById: Map<string, EvidenceRecord>,
  options: { latestDate?: string } = {}
): TurningPointAssessment[] {
  assertCanonicalEvents('assessTurningPoints', events);
  const assessments: TurningPointAssessment[] = [];
  const acceptedByDomainChange = new Map<string, TurningPointAssessment>();

  const sorted = [...events].sort((a, b) =>
    (a.startTime ?? '9999').localeCompare(b.startTime ?? '9999')
  );

  for (const event of sorted) {
    const evidence = event.evidenceIds
      .map((id) => evidenceById.get(id))
      .filter((r): r is EvidenceRecord => Boolean(r));
    const combinedText = evidence.map((r) => r.text).join(' ');
    const moods = evidence.map((r) => r.mood);
    const { label, reasoning: labelReasoning } = classifyArcLabel(
      combinedText,
      moods,
      evidence.length
    );

    const reject = (
      reason: TurningPointAssessment['rejectionReason'],
      why: string,
      magnitude: number,
      persistence = 0
    ) => {
      assessments.push({
        eventId: event.id,
        event: event.summary,
        affectedDomains: [],
        arcLabel: label,
        magnitude,
        persistence,
        confidence: 0.3,
        reasoning: why,
        accepted: false,
        rejectionReason: reason,
      });
    };

    const hasTransition = TRANSITION_RE.test(combinedText);
    if (!hasTransition && !LOSS_RE.test(combinedText)) {
      reject(
        'no_durable_state_change',
        `${labelReasoning}; no life-transition language, so no before/after state change`,
        0.2
      );
      continue;
    }

    const domains = affectedDomains(event, combinedText);
    if (domains.length === 0) {
      reject('entity_metadata_only', 'change language without an affected life domain', 0.3);
      continue;
    }

    const signals = event.importanceSignals;
    const magnitude = Math.min(
      1,
      0.3 +
        (signals?.lifeChangeMagnitude ?? 0) * 0.35 +
        domains.length * 0.1 +
        (signals?.identityRelevance ?? 0) * 0.25
    );
    if (magnitude < MIN_MAGNITUDE) {
      reject('insufficient_magnitude', `magnitude ${magnitude.toFixed(2)} below threshold`, magnitude);
      continue;
    }

    const persistence = measurePersistence(event, domains, events);
    const isRecentFrontier =
      options.latestDate !== undefined &&
      event.startTime !== undefined &&
      Date.parse(options.latestDate) - Date.parse(event.startTime) < 90 * 86_400_000;
    if (persistence === 0 && !isRecentFrontier) {
      if (event.evidenceIds.length < 2) {
        reject('isolated_anecdote', 'single evidence record with no later continuation', magnitude);
      } else {
        reject('no_durable_state_change', 'no later evidence consistent with a new state', magnitude);
      }
      continue;
    }
    if (!event.startTime) {
      reject('unclear_temporal_effect', 'event has no usable date, cannot place a before/after', magnitude, persistence);
      continue;
    }

    // A second event describing the same domain shift within ~60 days is the
    // same turning point told twice.
    const domainKey = domains.slice().sort().join('+');
    const prior = acceptedByDomainChange.get(domainKey);
    if (
      prior &&
      prior.eventId !== event.id &&
      events.find((e) => e.id === prior.eventId)?.startTime &&
      Math.abs(
        Date.parse(event.startTime) -
          Date.parse(events.find((e) => e.id === prior.eventId)!.startTime!)
      ) <
        60 * 86_400_000
    ) {
      reject('duplicate_of_event', `duplicates accepted turning point ${prior.eventId}`, magnitude, persistence);
      continue;
    }

    const before = inferBeforeState(event, domains, sorted);
    const after = inferAfterState(event, domains, sorted);
    const assessment: TurningPointAssessment = {
      eventId: event.id,
      beforeState: before,
      event: event.summary,
      afterState: after,
      affectedDomains: domains,
      arcLabel: label,
      magnitude,
      persistence: Math.max(persistence, isRecentFrontier ? 0.3 : persistence),
      confidence: Math.min(1, 0.4 + persistence * 0.3 + event.confidence * 0.3),
      reasoning: `${labelReasoning}; affects ${domains.join(', ')}; persistence ${persistence.toFixed(2)}`,
      accepted: true,
    };
    assessments.push(assessment);
    acceptedByDomainChange.set(domainKey, assessment);
  }

  return assessments;
}

function inferBeforeState(
  event: CanonicalEvent,
  domains: LifeDomain[],
  sorted: CanonicalEvent[]
): string | undefined {
  if (!event.startTime) return undefined;
  const prior = sorted
    .filter(
      (e) =>
        e.startTime &&
        e.startTime < event.startTime! &&
        e.domains.some((d) => domains.includes(d))
    )
    .pop();
  return prior ? prior.title : undefined;
}

function inferAfterState(
  event: CanonicalEvent,
  domains: LifeDomain[],
  sorted: CanonicalEvent[]
): string | undefined {
  if (!event.startTime) return undefined;
  const next = sorted.find(
    (e) =>
      e.startTime && e.startTime > event.startTime! && e.domains.some((d) => domains.includes(d))
  );
  return next ? next.title : undefined;
}
