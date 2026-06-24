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
