/**
 * Callers may pass an occurrence date only when they actually know occurrence.
 * Unknown must stay omitted — never substitute wall-clock now().
 */

export function occurrenceDate(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function photoCaptureOccurrenceDate(
  metadata: { dateTimeOriginal?: string | null; dateTime?: string | null },
  extra?: string | null,
): string | undefined {
  return occurrenceDate(metadata.dateTimeOriginal)
    ?? occurrenceDate(metadata.dateTime)
    ?? occurrenceDate(extra);
}

/** Source/message timestamps (unix seconds or ISO). Never treat as occurrence by default. */
export function parseSourceTimestamp(raw: unknown): string | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const millis = raw < 1e12 ? raw * 1000 : raw;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof raw === 'string' && raw.trim()) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}
