/** Client projection of journal/memory timestamps. Mirrors server classifyJournalMemoryTemporal. */

export type ClientTemporalView = {
  occurredAt: string | null;
  mentionedAt: string | null;
  recordedAt: string | null;
  occurrenceStatus: 'confirmed' | 'range' | 'unresolved';
  canonicalEventId: string | null;
  recordingFallbackRejected: boolean;
};

function utcDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso.slice(0, 10) || null;
  return new Date(parsed).toISOString().slice(0, 10);
}

export function projectMemoryCardTemporal(input: {
  date?: string | null;
  createdAt?: string | null;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: string | null;
  mentionedAt?: string | null;
  recordedAt?: string | null;
  occurrenceStatus?: 'confirmed' | 'range' | 'unresolved';
  canonicalEventId?: string | null;
  recordingFallbackRejected?: boolean;
}): ClientTemporalView {
  if (input.occurredAt !== undefined || input.occurrenceStatus) {
    return {
      occurredAt: input.occurredAt ?? null,
      mentionedAt: input.mentionedAt ?? input.recordedAt ?? input.createdAt ?? null,
      recordedAt: input.recordedAt ?? input.createdAt ?? null,
      occurrenceStatus: input.occurrenceStatus ?? (input.occurredAt ? 'confirmed' : 'unresolved'),
      canonicalEventId: input.canonicalEventId ?? null,
      recordingFallbackRejected: Boolean(input.recordingFallbackRejected),
    };
  }
  const claimed = input.date ?? null;
  const recorded = input.createdAt ?? (typeof input.metadata?.recorded_at === 'string' ? input.metadata.recorded_at : null);
  const source = typeof input.metadata?.temporal_source === 'string' ? input.metadata.temporal_source : '';
  const relative = /\b(last month|last summer|a few weeks|don'?t remember when)\b/i.test(input.content ?? '');
  const sameDay = utcDay(claimed) && utcDay(claimed) === utcDay(recorded);
  const recording =
    source === 'recording_fallback' ||
    relative && sameDay ||
    (sameDay && !/\b(i (?:went|saw|met|was at)|we (?:went|saw|met))\b/i.test(input.content ?? ''));
  if (recording || !claimed) {
    return {
      occurredAt: null,
      mentionedAt: recorded,
      recordedAt: recorded,
      occurrenceStatus: 'unresolved',
      canonicalEventId: input.canonicalEventId ?? null,
      recordingFallbackRejected: Boolean(claimed),
    };
  }
  return {
    occurredAt: claimed,
    mentionedAt: recorded,
    recordedAt: recorded,
    occurrenceStatus: 'confirmed',
    canonicalEventId: input.canonicalEventId ?? null,
    recordingFallbackRejected: false,
  };
}
