/**
 * Collapse multiple relationship rows that point at the same person into one.
 * Typed kinship wins over generic `family` / `related_to`.
 */

export type DedupeableRelationship = {
  id?: string | null;
  character_id?: string | null;
  character_name?: string | null;
  relationship_type: string;
  closeness_score?: number | null;
  status?: string | null;
  summary?: string | null;
};

const GENERIC_TYPES = new Set(['family', 'related_to', 'related', 'story_association', 'unknown']);

function normalizeType(type: string): string {
  return String(type ?? '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
}

export function relationshipTypeSpecificity(type: string): number {
  const t = normalizeType(type);
  if (!t) return 0;
  if (t === 'story_association') return 0;
  if (t === 'unknown') return 1;
  if (t === 'family' || t === 'related_to' || t === 'related') return 2;
  if (
    /^(mother|father|mom|dad|son|daughter|grandmother|grandfather|grandson|granddaughter|grandma|grandpa|abuela|abuelo|aunt|uncle|t[ií]o|t[ií]a|niece|nephew|sister|brother)/.test(
      t,
    )
  ) {
    return 12;
  }
  if (
    /^(cousin|parent|child|sibling|spouse|grandparent|grandchild|step_|half_|god|in_law|twin)/.test(
      t,
    )
  ) {
    return 10;
  }
  if (/\b(romantic|dating|partner|boyfriend|girlfriend|spouse|crush|situationship|ex_|fianc)/.test(t)) {
    return 9;
  }
  if (/\b(friend|best_friend|close_friend|coworker|colleague|mentor|boss|classmate|roommate)/.test(t)) {
    return 6;
  }
  return 4;
}

function statusRank(status?: string | null): number {
  const s = String(status ?? 'active').toLowerCase();
  if (s === 'confirmed' || s === 'user_confirmed') return 3;
  if (s === 'active' || s === 'asserted') return 2;
  if (s === 'inferred') return 1;
  return 0;
}

function preferRelationship<T extends DedupeableRelationship>(a: T, b: T): T {
  const specDiff = relationshipTypeSpecificity(b.relationship_type) - relationshipTypeSpecificity(a.relationship_type);
  if (specDiff !== 0) return specDiff > 0 ? b : a;

  const closeDiff = (b.closeness_score ?? 0) - (a.closeness_score ?? 0);
  if (closeDiff !== 0) return closeDiff > 0 ? b : a;

  const statusDiff = statusRank(b.status) - statusRank(a.status);
  if (statusDiff !== 0) return statusDiff > 0 ? b : a;

  const aGeneric = GENERIC_TYPES.has(normalizeType(a.relationship_type));
  const bGeneric = GENERIC_TYPES.has(normalizeType(b.relationship_type));
  if (aGeneric !== bGeneric) return aGeneric ? b : a;

  return a;
}

export function dedupeRelationshipsByPerson<T extends DedupeableRelationship>(
  relationships: T[],
  options: { excludeNames?: string[] } = {},
): T[] {
  const exclude = new Set(
    (options.excludeNames ?? ['You', 'Me']).map((n) => n.trim().toLowerCase()),
  );
  const byKey = new Map<string, T>();

  for (const rel of relationships) {
    const name = String(rel.character_name ?? '').trim();
    if (name && exclude.has(name.toLowerCase())) continue;
    const key =
      (rel.character_id && String(rel.character_id)) ||
      (name ? `name:${name.toLowerCase()}` : rel.id ? `id:${rel.id}` : '');
    if (!key) continue;

    const prev = byKey.get(key);
    byKey.set(key, prev ? preferRelationship(prev, rel) : rel);
  }

  return Array.from(byKey.values());
}
