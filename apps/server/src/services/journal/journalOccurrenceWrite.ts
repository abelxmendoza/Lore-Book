/**
 * Write-time journal occurrence helpers.
 *
 * journal_entries.date is occurrence only. Import/upload/save time belongs in
 * metadata (importedAt / sourceCreatedAt / mentionedAt) and created_at.
 * Do not invent now() when evidence is missing.
 */
import { resolveChronoInText } from '../../utils/temporalResolver';
import { resolveAllTemporalAnchors } from '../../utils/temporalAnchorResolver';
import type { TemporalSource } from '../temporal/temporalEvidence';

export type JournalOccurrenceWrite = {
  date?: string;
  temporalSource?: TemporalSource;
  mentionedAt?: string | null;
  sourceCreatedAt?: string | null;
  importedAt?: string | null;
  occurrencePrecision?: string;
};

export function mergeOccurrenceMetadata(
  metadata: Record<string, unknown> | undefined,
  occ: JournalOccurrenceWrite,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(metadata ?? {}) };
  if (occ.mentionedAt) next.mentionedAt = occ.mentionedAt;
  if (occ.sourceCreatedAt) next.sourceCreatedAt = occ.sourceCreatedAt;
  if (occ.importedAt) next.importedAt = occ.importedAt;
  if (occ.temporalSource) next.temporalSource = occ.temporalSource;
  if (occ.occurrencePrecision) next.occurrencePrecision = occ.occurrencePrecision;
  if (!occ.date) next.occurrenceUnresolved = true;
  else delete next.occurrenceUnresolved;
  return next;
}

/** EXIF / trusted capture time only — never upload time. */
export function photoCaptureOccurrence(
  metadata: { dateTimeOriginal?: string | null; dateTime?: string | null },
): string | undefined {
  const raw = metadata.dateTimeOriginal || metadata.dateTime;
  return raw && String(raw).trim() ? String(raw) : undefined;
}

/**
 * Extract occurrence from imported autobiographical text.
 * Relative “today” without a source timestamp is not occurrence evidence.
 */
export function occurrenceFromImportedText(
  text: string,
  options: { sourceCreatedAt?: string | null; now?: Date } = {},
): JournalOccurrenceWrite {
  const now = options.sourceCreatedAt
    ? new Date(options.sourceCreatedAt)
    : (options.now ?? new Date());
  if (Number.isNaN(now.getTime())) {
    return { temporalSource: 'recording_fallback' };
  }

  const window = resolveAllTemporalAnchors(text, now) ?? resolveChronoInText(text, now);
  if (!window) {
    return {
      temporalSource: 'recording_fallback',
      sourceCreatedAt: options.sourceCreatedAt ?? null,
    };
  }

  const sameCalendarDayAsNow =
    window.start.toISOString().slice(0, 10) === (options.now ?? new Date()).toISOString().slice(0, 10);
  if (!options.sourceCreatedAt && window.precision === 'day' && sameCalendarDayAsNow) {
    return {
      temporalSource: 'recording_fallback',
      sourceCreatedAt: options.sourceCreatedAt ?? null,
    };
  }

  return {
    date: window.start.toISOString(),
    temporalSource: 'relative_expression',
    occurrencePrecision: window.precision,
    sourceCreatedAt: options.sourceCreatedAt ?? null,
  };
}
