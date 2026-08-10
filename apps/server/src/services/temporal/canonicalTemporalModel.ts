import { applyTemporalConfidenceCeiling } from '../chronologyAuthority/temporalConfidenceCeilings';

import {
  unanchoredEvidence,
  type TemporalEvidence,
  type TemporalPrecision,
  type TemporalSource,
  type TemporalStatus,
} from './temporalEvidence';

export type TemporalProvenanceRef = {
  field: 'occurred_at' | 'mentioned_at' | 'recorded_at' | 'known_from' | 'valid_from' | 'valid_until';
  source: string;
  sourceId?: string | null;
  expression?: string | null;
};

/** Shared temporal coordinates. Occurrence is never inferred from recording. */
export type CanonicalTemporalModel = {
  occurred: TemporalEvidence;
  mentionedAt: string | null;
  recordedAt: string | null;
  knownFrom: string | null;
  validFrom: string | null;
  validUntil: string | null;
  provenance: TemporalProvenanceRef[];
};

export type LegacyTemporalRecord = {
  id?: string | null;
  occurredAt?: string | null;
  occurredEnd?: string | null;
  mentionedAt?: string | null;
  recordedAt?: string | null;
  knownFrom?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  precision?: TemporalPrecision | string | null;
  source?: TemporalSource | string | null;
  status?: TemporalStatus | string | null;
  confidence?: number | null;
  expression?: string | null;
  timezone?: string | null;
  sourceLabel?: string | null;
};

function asSource(value: string | null | undefined): TemporalSource {
  const allowed = new Set<TemporalSource>([
    'user_corrected', 'user_stated', 'document_stated', 'relative_expression',
    'context_inferred', 'recording_fallback',
  ]);
  return allowed.has(value as TemporalSource) ? value as TemporalSource : 'recording_fallback';
}

function asPrecision(value: string | null | undefined): TemporalPrecision {
  switch (value) {
    case 'exact': case 'time_of_day': case 'date': case 'week': case 'month':
    case 'season': case 'quarter': case 'year': case 'approximate': case 'unknown': return value;
    case 'day': return 'date';
    default: return 'unknown';
  }
}

function asStatus(value: string | null | undefined, start: string | null): TemporalStatus {
  if (!start) return 'unanchored';
  switch (value) {
    case 'anchored': case 'approximate': case 'ambiguous':
    case 'unanchored': case 'corrected': return value;
    default: return 'approximate';
  }
}

export function canonicalTemporalFromLegacy(record: LegacyTemporalRecord): CanonicalTemporalModel {
  const occurredAt = record.occurredAt ?? null;
  const source = asSource(record.source);
  const occurred = occurredAt
    ? applyTemporalConfidenceCeiling({
        start: occurredAt,
        end: record.occurredEnd ?? null,
        timezone: record.timezone ?? null,
        precision: asPrecision(record.precision),
        source,
        status: asStatus(record.status, occurredAt),
        confidence: record.confidence ?? 0.5,
        expression: record.expression ?? null,
      })
    : unanchoredEvidence();

  const provenance: TemporalProvenanceRef[] = [];
  const sourceLabel = record.sourceLabel ?? source;
  if (occurred.start) provenance.push({ field: 'occurred_at', source: sourceLabel, sourceId: record.id, expression: occurred.expression });
  if (record.mentionedAt) provenance.push({ field: 'mentioned_at', source: sourceLabel, sourceId: record.id });
  if (record.recordedAt) provenance.push({ field: 'recorded_at', source: 'database', sourceId: record.id });
  if (record.knownFrom) provenance.push({ field: 'known_from', source: sourceLabel, sourceId: record.id });
  if (record.validFrom) provenance.push({ field: 'valid_from', source: sourceLabel, sourceId: record.id });
  if (record.validUntil) provenance.push({ field: 'valid_until', source: sourceLabel, sourceId: record.id });

  return {
    occurred,
    mentionedAt: record.mentionedAt ?? null,
    recordedAt: record.recordedAt ?? null,
    knownFrom: record.knownFrom ?? record.recordedAt ?? null,
    validFrom: record.validFrom ?? null,
    validUntil: record.validUntil ?? null,
    provenance,
  };
}

/** Unknown occurrence sorts last; recording is only a final tie-breaker. */
export function canonicalTemporalSortKey(model: CanonicalTemporalModel): [number, number] {
  const occurred = model.occurred.start ? Date.parse(model.occurred.start) : Number.NaN;
  if (Number.isFinite(occurred)) return [0, occurred];
  const validFrom = model.validFrom ? Date.parse(model.validFrom) : Number.NaN;
  if (Number.isFinite(validFrom)) return [1, validFrom];
  const recorded = model.recordedAt ? Date.parse(model.recordedAt) : Number.NaN;
  return [2, Number.isFinite(recorded) ? recorded : Number.MAX_SAFE_INTEGER];
}

export function compareCanonicalTemporal(a: CanonicalTemporalModel, b: CanonicalTemporalModel): number {
  const [aTier, aTime] = canonicalTemporalSortKey(a);
  const [bTier, bTime] = canonicalTemporalSortKey(b);
  return aTier - bTier || aTime - bTime;
}
