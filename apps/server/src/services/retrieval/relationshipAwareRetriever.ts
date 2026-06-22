import type { RetrievalEntityRef, RetrievalMemoryRecord } from './retrievalTypes';
import { resolveEntityMentions } from './entityAwareRetriever';

const WHO_IS_RE = /\bwho\s+(?:is|was)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;
const RELATIONSHIP_RE = /\b(?:best friend|schoolmate|bandmate|coworker|brother|sister|partner)\b/i;

export function detectRelationshipQuery(query: string): boolean {
  return WHO_IS_RE.test(query) || RELATIONSHIP_RE.test(query);
}

export function extractWhoIsName(query: string): string | null {
  const m = WHO_IS_RE.exec(query);
  return m?.[1]?.trim() ?? null;
}

export function retrieveByRelationship(
  records: RetrievalMemoryRecord[],
  query: string,
  entities: RetrievalEntityRef[],
): RetrievalMemoryRecord[] {
  if (!detectRelationshipQuery(query)) return [];

  const name = extractWhoIsName(query);
  const mentioned = name
    ? entities.filter((e) => e.name.toLowerCase().includes(name.toLowerCase()))
    : resolveEntityMentions(query, entities);

  if (mentioned.length === 0) return [];

  const ids = new Set(mentioned.map((e) => e.id));
  return records.filter(
    (r) =>
      r.kind === 'relationship' ||
      r.relationshipLabels.length > 0 ||
      r.entityIds.some((id) => ids.has(id)),
  );
}

export function relationshipMatchScore(
  record: RetrievalMemoryRecord,
  query: string,
): number {
  if (!detectRelationshipQuery(query)) return 0;
  let score = 0;
  if (record.kind === 'relationship') score += 0.35;
  for (const label of record.relationshipLabels) {
    if (query.toLowerCase().includes(label.toLowerCase())) score += 0.2;
  }
  if (record.relationshipStrength > 0) score += Math.min(0.25, record.relationshipStrength * 0.25);
  return Math.min(1, score);
}
