import type { MemoryEntry } from '../types';
import type { EntitySearchResult } from '../services/search/entitySearchTypes';
import type { TimelineEvent } from '../services/timeline/normalizers/base';

import type { ProvenanceBundle, ProvenanceSource } from './types';

export function sourceFromJournalEntry(entry: MemoryEntry, relation = 'retrieved'): ProvenanceSource {
  const excerpt = (entry.summary ?? entry.content ?? '').slice(0, 280);
  return {
    artifact_type: 'journal_entry',
    artifact_id: entry.id,
    relation,
    confidence: entry.similarity,
    excerpt: excerpt || undefined,
    occurred_at: entry.date,
  };
}

export function sourceFromEntity(result: EntitySearchResult): ProvenanceSource {
  return {
    artifact_type: result.entityType,
    artifact_id: result.entityId,
    relation: 'matched',
    confidence: result.confidence,
    excerpt: result.displayName,
  };
}

export function sourceFromTimelineEvent(event: TimelineEvent): ProvenanceSource {
  return {
    artifact_type: 'timeline_event',
    artifact_id: event.id,
    relation: 'timeline',
    excerpt: event.title,
    occurred_at: event.eventDate.toISOString(),
  };
}

export function bundleFromSources(sources: ProvenanceSource[], truthState?: string): ProvenanceBundle {
  return {
    sources,
    ...(truthState ? { truth_state: truthState } : {}),
  };
}

export function emptyProvenance(): ProvenanceBundle {
  return { sources: [] };
}
