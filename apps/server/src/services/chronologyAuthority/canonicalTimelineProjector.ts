/**
 * Project stitch candidates into canonical Omni items.
 * Collapses journal evidence under resolved events; marks unresolved dates.
 */

import {
  applyTemporalConfidenceCeiling,
  isImportOrRecoveryTag,
  TEMPORAL_CONFIDENCE_CEILINGS,
} from './temporalConfidenceCeilings';
import { detectTemporalContradiction } from './temporalContradiction';
import { evaluateTimelineEligibility } from './timelineSpeechActGate';
import type { TemporalPrecision, TemporalSource } from '../temporal/temporalEvidence';
import {
  canonicalTemporalFromLegacy,
  type CanonicalTemporalModel,
} from '../temporal/canonicalTemporalModel';

export type ProjectionRole = 'canonical' | 'evidence' | 'unresolved' | 'excluded';
export type OccurrenceStatus = 'confirmed' | 'range' | 'unresolved';

export type CanonicalEventType =
  | 'activity'
  | 'social_event'
  | 'nightlife_event'
  | 'family_event'
  | 'work_session'
  | 'project_milestone'
  | 'career_milestone'
  | 'reflection'
  | 'system_activity'
  | 'external_context'
  | 'unknown';

export type ProjectableTimelineItem = {
  id: string;
  kind: 'moment' | 'event';
  sourceId: string;
  sortTime: string;
  title: string;
  body: string;
  sourceKind: 'journal_entry' | 'resolved_event' | 'timeline_event';
  sourceIds: string[];
  sourceType: string;
  tags?: string[];
  confidence?: number;
  timePrecision?: string;
  timeConfidence?: number;
  temporalSource?: string;
  occurredAt?: string | null;
  occurredEnd?: string | null;
  mentionedAt?: string | null;
  recordedAt?: string | null;
  knownFrom?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ProjectedTimelineItem = ProjectableTimelineItem & {
  timePrecision: string;
  timeConfidence: number;
  temporalSource: string;
  occurrenceStatus: OccurrenceStatus;
  projectionRole: ProjectionRole;
  canonicalEventType: CanonicalEventType;
  eligibilitySurface: string;
  speechAct: string;
  temporal: CanonicalTemporalModel;
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
}

export function inferCanonicalEventType(title: string, body: string, tags?: string[]): CanonicalEventType {
  const text = `${title} ${body}`;
  if ((tags ?? []).some((t) => /recovered|import/i.test(t))) return 'system_activity';
  if (/\b(?:recap|token|debug|testing the chat)\b/i.test(text)) return 'system_activity';
  if (/\b(?:world cup|weather)\b/i.test(text)) return 'external_context';
  if (/\b(?:interview|hired|onboarding|background[- ]?check|first day|job)\b/i.test(text)) {
    return 'career_milestone';
  }
  if (/\b(?:lore\s*book|coding|coded|distrokid|feature)\b/i.test(text)) return 'project_milestone';
  if (/\b(?:club|afters|rave|concert|show|dj)\b/i.test(text)) return 'nightlife_event';
  if (/\b(?:graduation|cousin|abuela|family|t[ií]o)\b/i.test(text)) return 'family_event';
  if (/\b(?:party|met |dinner|lunch)\b/i.test(text)) return 'social_event';
  if (/\b(?:feel|reflect|thinking)\b/i.test(text)) return 'reflection';
  if (/\b(?:went|visited|ran|gym|worked)\b/i.test(text)) return 'activity';
  return 'unknown';
}

function honestTemporal(item: ProjectableTimelineItem): {
  precision: string;
  confidence: number;
  source: string;
  occurrenceStatus: OccurrenceStatus;
  /** The occurrence value this function actually decided on — the single
   *  source of truth for "what is this item's occurrence," so callers never
   *  need to re-derive it independently and risk drifting out of sync. */
  occurrence: string | null;
} {
  const tags = item.tags ?? [];
  const recovered = isImportOrRecoveryTag(tags);
  // A recording_fallback temporalSource means the caller already knows this
  // item has no real occurrence evidence — falling back to sortTime here
  // regardless (as this used to) let write-time leak back in as occurrence
  // whenever occurredAt was left undefined rather than explicitly null.
  //
  // But that guard must only apply when the caller left occurredAt genuinely
  // undefined ("I don't know, you figure it out"). When the caller already
  // made an explicit determination — including resolved_events rows, whose
  // start_time has no innocent default and is set by stitchedTimelineService
  // as occurredAt: cluster.time regardless of temporal_source — that
  // determination must be trusted. temporal_source on resolved_events
  // defaults to 'recording_fallback' at the schema level whenever the
  // ingestion pipeline never separately classified evidence, even when
  // start_time itself is a genuine extracted date; treating that default as
  // an unconditional veto silently unresolves real, dated events.
  // Import/recovery-tagged data stays an unconditional veto: that tag is a
  // deliberate "don't trust this row's dates" marker, not a schema default,
  // so an explicit occurredAt on a recovered row isn't trusted either.
  const recordingFallback = item.temporalSource === 'recording_fallback';
  const occurrence: string | null = recovered
    ? null
    : item.occurredAt !== undefined
      ? item.occurredAt
      : (recordingFallback ? null : item.sortTime);
  const trustedExplicitOccurrence = Boolean(occurrence) && !recovered;
  const rawSource = (
    recovered
      ? 'recording_fallback'
      : trustedExplicitOccurrence && recordingFallback
        ? 'context_inferred'
        : (item.temporalSource ?? 'context_inferred')
  ) as TemporalSource;
  const rawPrecision = (item.timePrecision ?? 'date') as TemporalPrecision;
  const rawConf = item.timeConfidence ?? item.confidence ?? 0.5;

  const capped = applyTemporalConfidenceCeiling({
    start: occurrence || null,
    end: item.occurredEnd ?? null,
    timezone: null,
    precision: recovered ? 'unknown' : rawPrecision,
    source: recovered ? 'recording_fallback' : rawSource,
    status: 'approximate',
    confidence: rawConf,
    expression: null,
  });

  const contradiction = detectTemporalContradiction({
    recordId: item.id,
    storedOccurrence: occurrence,
    title: item.title,
    summary: item.body,
    temporalSource: capped.source,
    tags,
  });

  if (
    contradiction
    || recovered
    // Only treat recording_fallback as unresolved when it actually resulted
    // in no occurrence value — `occurrence` above already carries the real
    // answer (explicit occurredAt wins over a merely-default source tag), so
    // re-deriving from capped.source here would undo that distinction.
    || !occurrence
    || (capped.precision === 'year' && !capped.end)
  ) {
    return {
      precision: capped.precision === 'exact' ? 'unknown' : capped.precision,
      confidence: Math.min(capped.confidence, TEMPORAL_CONFIDENCE_CEILINGS.IMPORT_RECOVERY),
      source: capped.source,
      occurrenceStatus: 'unresolved',
      // occurrenceStatus is the authoritative trust signal for this branch —
      // callers that gate on occurrenceStatus !== 'unresolved' already do the
      // right thing, so the raw value stays available here for audit/debug
      // rather than being redundantly nulled a second way.
      occurrence,
    };
  }

  if (
    capped.precision === 'week'
    || capped.precision === 'month'
    || capped.precision === 'season'
    || capped.precision === 'quarter'
    || capped.precision === 'approximate'
    || (capped.precision === 'year' && Boolean(capped.end))
    || capped.status === 'approximate'
  ) {
    return {
      precision: capped.precision,
      confidence: capped.confidence,
      source: capped.source,
      occurrenceStatus: 'range',
      occurrence,
    };
  }

  return {
    precision: capped.precision,
    confidence: capped.confidence,
    source: capped.source,
    occurrenceStatus: occurrence
      ? (capped.confidence >= 0.6 ? 'confirmed' : 'range')
      : 'unresolved',
    occurrence,
  };
}

/**
 * Project raw stitch items for Omni global feed.
 * - Prefer resolved_event over journal_entry for same day + similar title
 * - Exclude non-autobiographical speech acts from canonical list
 * - Mark temporally dishonest items as unresolved (still returned separately)
 */
export function projectCanonicalTimeline(items: ProjectableTimelineItem[]): {
  canonical: ProjectedTimelineItem[];
  unresolved: ProjectedTimelineItem[];
  excluded: ProjectedTimelineItem[];
  evidenceHidden: number;
} {
  const excluded: ProjectedTimelineItem[] = [];
  const unresolved: ProjectedTimelineItem[] = [];
  const working: ProjectedTimelineItem[] = [];

  const hardExcludeActs = new Set([
    'RECAP_REQUEST',
    'COMMAND',
    'CORRECTION',
    'QUESTION',
    'PRODUCT_FEEDBACK',
    'SYSTEM_DEBUGGING',
    'EMPTY',
    'EXTERNAL_CONTEXT',
  ]);

  for (const item of items) {
    const temporal = honestTemporal(item);
    const temporalModel = canonicalTemporalFromLegacy({
      id: item.sourceId,
      // honestTemporal already decided the occurrence value — re-deriving it
      // independently here (as this used to) is exactly how the two could
      // drift apart and mask a real start_time as unresolved.
      occurredAt: temporal.occurrence,
      occurredEnd: item.occurredEnd,
      mentionedAt: item.mentionedAt,
      recordedAt: item.recordedAt,
      knownFrom: item.knownFrom,
      validFrom: item.validFrom,
      validUntil: item.validUntil,
      precision: temporal.precision,
      source: temporal.source,
      status: temporal.occurrenceStatus === 'confirmed'
        ? 'anchored'
        : temporal.occurrenceStatus === 'range'
          ? 'approximate'
          : 'ambiguous',
      confidence: temporal.confidence,
      sourceLabel: item.sourceType,
    });
    const eligibility = evaluateTimelineEligibility({
      text: item.body || item.title,
      title: item.title,
      // Candidates reaching the canonical projector already came from a
      // structured chronology source. Requiring their generated summaries to
      // contain first-person grammar incorrectly drops legitimate events such
      // as "Camping trip" or calendar titles. Speech-act exclusions still run
      // first, so commands, recaps, debugging text, and corrections remain out.
      type: 'personal_event',
      tags: item.tags,
      metadata: item.metadata ?? null,
    });
    const canonicalEventType = inferCanonicalEventType(item.title, item.body, item.tags);

    const projected: ProjectedTimelineItem = {
      ...item,
      timePrecision: temporal.precision,
      timeConfidence: temporal.confidence,
      temporalSource: temporal.source,
      occurrenceStatus: temporal.occurrenceStatus,
      projectionRole: 'canonical',
      canonicalEventType,
      eligibilitySurface: eligibility.surface,
      speechAct: eligibility.speechAct,
      temporal: temporalModel,
      confidence: temporal.confidence,
    };

    // Hard speech-act rejects never appear on Omni (even as unresolved).
    if (hardExcludeActs.has(eligibility.speechAct)) {
      projected.projectionRole = 'excluded';
      excluded.push(projected);
      continue;
    }

    // Temporal honesty first: recovered / Jan-1 fallbacks / year-only → tray.
    if (temporal.occurrenceStatus === 'unresolved' || eligibility.surface === 'NEEDS_REVIEW') {
      projected.projectionRole = 'unresolved';
      unresolved.push(projected);
      continue;
    }

    if (!eligibility.eligible || eligibility.surface === 'EXCLUDED') {
      projected.projectionRole = 'excluded';
      excluded.push(projected);
      continue;
    }

    if (eligibility.surface === 'REFLECTION_LAYER' || eligibility.surface === 'PROJECT_TIMELINE') {
      if (canonicalEventType === 'system_activity' || canonicalEventType === 'external_context') {
        projected.projectionRole = 'excluded';
        excluded.push(projected);
        continue;
      }
    }

    working.push(projected);
  }

  // Collapse journal moments under resolved events same day + title similarity
  const events = working.filter((i) => i.sourceKind === 'resolved_event');
  const journals = working.filter((i) => i.sourceKind === 'journal_entry');
  const others = working.filter((i) => i.sourceKind === 'timeline_event');

  const significantTokens = (title: string) =>
    normalizeTitle(title)
      .split(' ')
      .filter((w) => w.length >= 5 && !/^(about|after|before|during|with|from|their|there|these|those|would|could|should)$/.test(w));

  let evidenceHidden = 0;
  const keptJournals: ProjectedTimelineItem[] = [];
  for (const j of journals) {
    const jDay = dayKey(j.sortTime);
    const jTokens = new Set(significantTokens(`${j.title} ${j.body}`));
    // Stable-identity linkage is preferred and always wins outright when
    // present: journal_entries carries no back-reference into resolved_events
    // today (confirmed — no ingestion path populates one), so this is
    // currently a no-op in practice, but it's checked first and unconditionally
    // so a canonical event with real shared-source evidence is never
    // second-guessed by the text heuristic below.
    const sharedSource = events.some(
      (e) => e.sourceIds?.includes(j.sourceId) || j.sourceIds?.includes(e.sourceId),
    );
    // Fallback only: same-day text similarity. This must stay conservative —
    // a single shared 5+-letter word (e.g. "session") was previously enough
    // to collapse two genuinely distinct same-day events (two separate gym
    // visits with different people both mentioning "session"). Require
    // either an exact normalized title match, or *multiple* shared
    // significant tokens covering at least half of the smaller side's
    // vocabulary — a much weaker false-positive rate for "probably the same
    // moment" without any new data source.
    const looseMatch =
      !sharedSource &&
      events.some((e) => {
        if (dayKey(e.sortTime) !== jDay) return false;
        if (normalizeTitle(e.title) === normalizeTitle(j.title)) return true;
        const eTokens = significantTokens(`${e.title} ${e.body}`);
        if (eTokens.length === 0 || jTokens.size === 0) return false;
        const overlap = eTokens.filter((w) => jTokens.has(w)).length;
        const smallerSide = Math.min(eTokens.length, jTokens.size);
        return overlap >= 2 && overlap / smallerSide >= 0.5;
      });
    if (looseMatch || sharedSource) {
      evidenceHidden += 1;
      continue;
    }
    keptJournals.push(j);
  }

  const canonical = sortByTime([...events, ...keptJournals, ...others]);
  return { canonical, unresolved, excluded, evidenceHidden };
}

function sortByTime(items: ProjectedTimelineItem[]): ProjectedTimelineItem[] {
  return [...items].sort(
    (a, b) => new Date(a.sortTime).getTime() - new Date(b.sortTime).getTime(),
  );
}

export function mapWebTimePrecision(
  precision: string,
): 'exact' | 'day' | 'month' | 'year' | 'approximate' {
  switch (precision) {
    case 'exact':
    case 'time_of_day':
      return 'exact';
    case 'date':
      return 'day';
    case 'month':
    case 'season':
    case 'quarter':
      return 'month';
    case 'year':
      return 'year';
    default:
      return 'approximate';
  }
}
