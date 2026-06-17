export type RelationshipGroupSummary = {
  scope: string;
  entityNames: string[];
  confidence?: number;
  hint?: string;
};

export type RelationshipPersistStats = {
  persisted: number;
  skipped: number;
  characterEdges: number;
  entityEdges: number;
};

/** Extract relationship groups stored on durable message metadata. */
export function extractRelationshipGroups(
  metadata?: Record<string, unknown> | null
): RelationshipGroupSummary[] {
  const enrichment = metadata?.ontology_enrichment;
  if (!enrichment || typeof enrichment !== 'object') return [];
  const groups = (enrichment as Record<string, unknown>).relationship_groups;
  if (!Array.isArray(groups)) return [];
  return groups
    .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
    .map((g) => ({
      scope: String(g.scope ?? 'UNKNOWN'),
      entityNames: Array.isArray(g.entityNames)
        ? g.entityNames.map((n) => String(n)).filter(Boolean)
        : [],
      confidence: typeof g.confidence === 'number' ? g.confidence : undefined,
      hint: typeof g.hint === 'string' ? g.hint : undefined,
    }))
    .filter((g) => g.entityNames.length > 0);
}

/** Extract pipeline relationship persistence stats from message metadata. */
export function extractRelationshipPersistStats(
  metadata?: Record<string, unknown> | null
): RelationshipPersistStats | null {
  const stats = metadata?.relationship_persistence;
  if (!stats || typeof stats !== 'object') return null;
  const row = stats as Record<string, unknown>;
  if (typeof row.persisted !== 'number') return null;
  return {
    persisted: row.persisted,
    skipped: typeof row.skipped === 'number' ? row.skipped : 0,
    characterEdges: typeof row.characterEdges === 'number' ? row.characterEdges : 0,
    entityEdges: typeof row.entityEdges === 'number' ? row.entityEdges : 0,
  };
}
