import type {
  AmbiguousEntityCandidate,
  RetrievalAnchorRef,
  RetrievalEntityRef,
  RetrievalMemoryRecord,
} from './retrievalTypes';

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\w\s']/g, '').trim();
}

function matchesName(text: string, name: string): boolean {
  const n = normalize(name);
  if (n.length < 2) return false;
  return normalize(text).includes(n);
}

export function resolveEntityMentions(
  query: string,
  entities: RetrievalEntityRef[],
): RetrievalEntityRef[] {
  const matched: RetrievalEntityRef[] = [];
  for (const entity of entities) {
    const names = [entity.name, ...entity.aliases];
    if (names.some((n) => matchesName(query, n))) {
      matched.push(entity);
    }
  }
  return matched.sort((a, b) => b.name.length - a.name.length);
}

export function findAmbiguousEntities(
  query: string,
  entities: RetrievalEntityRef[],
): AmbiguousEntityCandidate[] {
  const tokens = query.split(/\s+/).filter((t) => /^[A-Z]/.test(t));
  const candidates: AmbiguousEntityCandidate[] = [];

  for (const token of tokens) {
    const hits = entities.filter(
      (e) =>
        matchesName(token, e.name) ||
        e.aliases.some((a) => matchesName(token, a) || normalize(a).includes(normalize(token))),
    );
    if (hits.length > 1) {
      for (const hit of hits) {
        candidates.push({
          entityId: hit.id,
          name: hit.name,
          aliases: hit.aliases,
          reason: `Query "${token}" matches multiple entities`,
          confidence: 0.55,
        });
      }
    }
  }

  const deduped = new Map<string, AmbiguousEntityCandidate>();
  for (const c of candidates) deduped.set(c.entityId, c);
  return [...deduped.values()];
}

export function retrieveByEntity(
  records: RetrievalMemoryRecord[],
  entities: RetrievalEntityRef[],
  query: string,
): RetrievalMemoryRecord[] {
  const mentioned = resolveEntityMentions(query, entities);
  if (mentioned.length === 0) return [];

  const entityIds = new Set(mentioned.map((e) => e.id));
  const entityNames = mentioned.flatMap((e) => [e.name, ...e.aliases]).map(normalize);

  return records.filter((r) => {
    if (r.entityIds.some((id) => entityIds.has(id))) return true;
    return r.entityNames.some((n) => entityNames.includes(normalize(n)));
  });
}

export function entityMatchScore(
  record: RetrievalMemoryRecord,
  query: string,
  entities: RetrievalEntityRef[],
): number {
  const mentioned = resolveEntityMentions(query, entities);
  if (mentioned.length === 0) return 0;

  let score = 0;
  for (const entity of mentioned) {
    if (record.entityIds.includes(entity.id)) score += 0.35;
    if (record.entityNames.some((n) => normalize(n) === normalize(entity.name))) score += 0.25;
    if (entity.aliases.some((a) => record.text.toLowerCase().includes(a.toLowerCase()))) score += 0.15;
  }
  return Math.min(1, score);
}

export function buildClarificationPrompt(candidates: AmbiguousEntityCandidate[]): string {
  if (candidates.length === 0) return '';
  const options = candidates.map((c) => {
    const aliasPart = c.aliases.length ? ` (also: ${c.aliases.join(', ')})` : '';
    return `${c.name}${aliasPart}`;
  });
  return `Which did you mean: ${options.join(' · ')}?`;
}

export function retrieveEntityProfiles(
  entities: RetrievalEntityRef[],
  query: string,
): RetrievalEntityRef[] {
  return resolveEntityMentions(query, entities);
}

export function retrieveAnchorsForEntities(
  anchors: RetrievalAnchorRef[],
  entityIds: string[],
): RetrievalAnchorRef[] {
  const idSet = new Set(entityIds);
  return anchors.filter((a) => a.entityIds.some((id) => idSet.has(id)));
}
