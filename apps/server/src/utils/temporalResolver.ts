/**
 * Unified temporal resolver — LoreBook anchors first, chrono-node second.
 *
 * Domain-specific windows (seasons, entity-anchored eras, glossary phrases)
 * stay in temporalAnchorResolver. Generic NL dates ("March 15", "3 days ago")
 * fall through to chrono-node.
 */
import * as chrono from 'chrono-node';

import {
  resolveAllTemporalAnchors,
  resolveTemporalAnchor,
  type TemporalWindow,
} from './temporalAnchorResolver';

export type { TemporalWindow };

const CHRONO_CONFIDENCE = 0.72;

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function inferPrecision(start: Date, end: Date): TemporalWindow['precision'] {
  const spanMs = Math.abs(end.getTime() - start.getTime());
  const dayMs = 86_400_000;
  if (spanMs <= dayMs) return 'day';
  if (spanMs <= 7 * dayMs) return 'week';
  if (spanMs <= 31 * dayMs) return 'month';
  if (spanMs <= 120 * dayMs) return 'season';
  return 'year';
}

function chronoResultToWindow(result: chrono.ParsedResult): TemporalWindow | null {
  const start = result.start.date();
  if (!start || Number.isNaN(start.getTime())) return null;

  const rawEnd = result.end?.date();
  const end = rawEnd && !Number.isNaN(rawEnd.getTime()) && rawEnd >= start ? rawEnd : endOfDay(start);
  const matched = (result.text ?? '').trim();
  const label = matched || start.toISOString().slice(0, 10);

  return {
    start,
    end,
    precision: inferPrecision(start, end),
    label,
    confidence: CHRONO_CONFIDENCE,
  };
}

/** Best chrono-only window for a text fragment. */
export function resolveChronoInText(text: string, now: Date = new Date()): TemporalWindow | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;

  const parsed = chrono.parse(trimmed, now);
  if (!parsed.length) return null;

  const windows = parsed
    .map((result) => chronoResultToWindow(result))
    .filter((window): window is TemporalWindow => window !== null);

  return windows.sort((a, b) => b.confidence - a.confidence)[0] ?? null;
}

/** All distinct chrono windows found in text. */
export function parseChronoReferences(text: string, now: Date = new Date()): TemporalWindow[] {
  const trimmed = text?.trim();
  if (!trimmed) return [];

  const parsed = chrono.parse(trimmed, now);
  const seen = new Set<string>();
  const windows: TemporalWindow[] = [];

  for (const result of parsed) {
    const window = chronoResultToWindow(result);
    if (!window || seen.has(window.label)) continue;
    seen.add(window.label);
    windows.push(window);
  }

  return windows.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Resolve the best temporal window for text.
 * LoreBook anchors win over generic chrono parsing.
 */
export function resolveTemporalWindow(
  text: string,
  now: Date = new Date(),
  entityDates?: Map<string, { first: Date; last: Date }>
): TemporalWindow | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;

  const anchor =
    resolveAllTemporalAnchors(trimmed, now, entityDates) ??
    resolveTemporalAnchor(trimmed, now, entityDates);
  if (anchor) return anchor;

  return resolveChronoInText(trimmed, now);
}

export type IngestionTemporalReference = {
  timestamp: Date;
  endTimestamp?: Date;
  precision: 'year' | 'month' | 'day' | 'hour' | 'minute';
  confidence: number;
  originalText?: string;
  label?: string;
};

export type ParsedMessageTimestamp = {
  type: 'absolute' | 'relative' | 'fuzzy';
  timestamp: Date;
  endTimestamp?: Date;
  precision: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';
  originalText?: string;
  confidence: number;
};

function mapWindowToParsedTimestamp(window: TemporalWindow): ParsedMessageTimestamp {
  const precision: ParsedMessageTimestamp['precision'] =
    window.precision === 'hour'
      ? 'hour'
      : window.precision === 'month' || window.precision === 'season'
        ? 'month'
        : window.precision === 'year'
          ? 'year'
          : 'day';

  const type: ParsedMessageTimestamp['type'] =
    window.confidence >= 0.85 && /today|yesterday|last week|this week|recently/i.test(window.label)
      ? 'relative'
      : window.confidence >= CHRONO_CONFIDENCE
        ? 'absolute'
        : 'fuzzy';

  return {
    type,
    timestamp: window.start,
    endTimestamp: window.end,
    precision,
    originalText: window.label,
    confidence: window.confidence,
  };
}

/**
 * Parse a message timestamp using LoreBook anchors first, then chrono-node.
 * Compatible replacement for legacy timeEngine.parseTimestamp call sites.
 */
export function parseMessageTimestamp(
  input: string,
  now: Date = new Date(),
  defaultToNow = false
): ParsedMessageTimestamp {
  const trimmed = input?.trim();
  if (!trimmed) {
    if (defaultToNow) {
      return {
        type: 'relative',
        timestamp: now,
        precision: 'day',
        confidence: 0.7,
      };
    }
    return {
      type: 'fuzzy',
      timestamp: now,
      precision: 'day',
      confidence: 0.1,
    };
  }

  const window = resolveTemporalWindow(trimmed, now);
  if (window) {
    return mapWindowToParsedTimestamp(window);
  }

  if (defaultToNow) {
    return {
      type: 'relative',
      timestamp: now,
      precision: 'day',
      originalText: trimmed,
      confidence: 0.7,
    };
  }

  return {
    type: 'fuzzy',
    timestamp: now,
    precision: 'day',
    originalText: trimmed,
    confidence: 0.1,
  };
}

export function mapTemporalWindowToIngestionRef(
  window: TemporalWindow,
  originalText?: string
): IngestionTemporalReference {
  const precision: IngestionTemporalReference['precision'] =
    window.precision === 'hour'
      ? 'hour'
      : window.precision === 'month' || window.precision === 'season'
        ? 'month'
        : window.precision === 'year'
          ? 'year'
          : 'day';

  return {
    timestamp: window.start,
    endTimestamp: window.end,
    precision,
    confidence: window.confidence,
    originalText: originalText ?? window.label,
    label: window.label,
  };
}

/**
 * Collect temporal references for ingestion — glossary/anchor scan should be
 * applied by the caller; this adds anchor safety-net + chrono coverage.
 */
export function collectAdditionalTemporalReferences(
  text: string,
  now: Date = new Date(),
  seenLabels: Set<string> = new Set()
): IngestionTemporalReference[] {
  const refs: IngestionTemporalReference[] = [];

  const anchor = resolveAllTemporalAnchors(text, now);
  if (anchor && !seenLabels.has(anchor.label)) {
    seenLabels.add(anchor.label);
    refs.push(mapTemporalWindowToIngestionRef(anchor));
  }

  for (const window of parseChronoReferences(text, now)) {
    if (seenLabels.has(window.label)) continue;
    seenLabels.add(window.label);
    refs.push(mapTemporalWindowToIngestionRef(window));
  }

  return refs;
}
