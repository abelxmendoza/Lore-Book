export type LocationMergeHistoryItem = {
  sourceId?: string;
  sourceName: string;
  targetId?: string;
  targetNameBefore?: string;
  canonicalNameAfter?: string;
  mergedAt?: string;
};

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export function locationAliasesForDisplay(metadata?: Record<string, unknown> | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const alias of stringList(metadata?.aliases)) {
    const key = alias.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(alias.trim());
  }
  return out;
}

export function locationMergeHistoryForDisplay(metadata?: Record<string, unknown> | null): LocationMergeHistoryItem[] {
  const raw = Array.isArray(metadata?.merge_history) ? metadata!.merge_history : [];
  return raw
    .map((item): LocationMergeHistoryItem | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const sourceName = typeof row.source_name === 'string'
        ? row.source_name
        : typeof row.merged_from === 'string'
          ? row.merged_from
          : '';
      if (!sourceName.trim()) return null;
      return {
        sourceId: typeof row.source_id === 'string' ? row.source_id : undefined,
        sourceName,
        targetId: typeof row.target_id === 'string' ? row.target_id : undefined,
        targetNameBefore: typeof row.target_name_before === 'string' ? row.target_name_before : undefined,
        canonicalNameAfter: typeof row.canonical_name_after === 'string' ? row.canonical_name_after : undefined,
        mergedAt: typeof row.merged_at === 'string' ? row.merged_at : undefined,
      };
    })
    .filter((item): item is LocationMergeHistoryItem => Boolean(item));
}

export function locationEvidenceSourcesForDisplay(metadata?: Record<string, unknown> | null): string[] {
  return [
    ...stringList(metadata?.evidence),
    ...stringList(metadata?.source_messages),
    ...stringList(metadata?.source_message_ids),
  ].slice(0, 12);
}

export type LocationMediaItem = {
  url: string;
  type: 'photo' | 'video' | 'animated_gif';
  alt?: string;
  source?: string;
  sourceUrl?: string;
  capturedAt?: string;
};

/** Photos attached to the card (tweet media, folded-in cards). */
export function locationMediaForDisplay(metadata?: Record<string, unknown> | null): LocationMediaItem[] {
  const raw = Array.isArray(metadata?.media) ? metadata!.media : [];
  return raw
    .map((item): LocationMediaItem | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      if (typeof row.url !== 'string' || !row.url.trim()) return null;
      return {
        url: row.url,
        type: row.type === 'video' || row.type === 'animated_gif' ? row.type : 'photo',
        alt: typeof row.alt === 'string' ? row.alt : undefined,
        source: typeof row.source === 'string' ? row.source : undefined,
        sourceUrl: typeof row.source_url === 'string' ? row.source_url : undefined,
        capturedAt: typeof row.captured_at === 'string' ? row.captured_at : undefined,
      };
    })
    .filter((item): item is LocationMediaItem => Boolean(item))
    .slice(0, 24);
}

export type LocationSourceRef = {
  source: string;
  url?: string;
  entryId?: string;
  threadId?: string;
  excerpt?: string;
  at?: string;
};

/** Mention provenance — where this place (or an alias of it) was referenced. */
export function locationSourceRefsForDisplay(metadata?: Record<string, unknown> | null): LocationSourceRef[] {
  const raw = Array.isArray(metadata?.sources) ? metadata!.sources : [];
  return raw
    .map((item): LocationSourceRef | null => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const source = typeof row.source === 'string' ? row.source : '';
      if (!source) return null;
      return {
        source,
        url: typeof row.url === 'string' ? row.url : undefined,
        entryId: typeof row.entry_id === 'string' ? row.entry_id : undefined,
        threadId: typeof row.thread_id === 'string' ? row.thread_id : undefined,
        excerpt: typeof row.excerpt === 'string' ? row.excerpt : undefined,
        at: typeof row.at === 'string' ? row.at : undefined,
      };
    })
    .filter((item): item is LocationSourceRef => Boolean(item))
    .slice(-12)
    .reverse();
}
