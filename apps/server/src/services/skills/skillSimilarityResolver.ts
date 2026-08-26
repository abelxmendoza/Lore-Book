/**
 * Match a candidate against the existing Skills Book registry.
 */

import { buildBookIndexFromLabels, enrichNameWithBookMatch } from '../suggestionMatchEnricher';
import { normalizeSkillKey } from './skillIdentity';
import type { KnownSkillRecord } from './skillCognitionTypes';
import { resolveSkillCanonical } from './skillCanonicalResolver';

export type SkillSimilarityMatch = {
  match?: KnownSkillRecord;
  score: number;
  method: 'exact' | 'alias' | 'canonical' | 'fuzzy' | 'none';
  reasons: string[];
};

const GENERIC_SKILL_TOKENS = new Set([
  'development',
  'developer',
  'engineering',
  'management',
  'skill',
  'skills',
  'training',
  'practice',
  'operations',
  'professional',
]);

function tokenSet(s: string): Set<string> {
  return new Set(
    normalizeSkillKey(s)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1),
  );
}

function contentTokens(s: string): Set<string> {
  return new Set([...tokenSet(s)].filter((t) => !GENERIC_SKILL_TOKENS.has(t)));
}

function contentRelatedScore(a: string, b: string): number {
  const left = contentTokens(a);
  const right = contentTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  const smaller = left.size <= right.size ? left : right;
  const larger = left.size <= right.size ? right : left;
  let inter = 0;
  for (const t of smaller) if (larger.has(t)) inter += 1;
  if (inter === 0) return 0;
  if ([...smaller].every((t) => larger.has(t))) return 0.7;
  return jaccard(left, right);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function findSimilarExistingSkill(
  span: string,
  knownSkills: KnownSkillRecord[] = [],
): SkillSimilarityMatch {
  const reasons: string[] = [];
  if (!knownSkills.length) {
    return { score: 0, method: 'none', reasons: ['no_registry'] };
  }

  const canonical = resolveSkillCanonical(span);
  const spanKey = normalizeSkillKey(span);
  const canonKey = normalizeSkillKey(canonical.canonicalTitle);
  const aliasKeys = new Set([
    spanKey,
    canonKey,
    ...canonical.aliases.map(normalizeSkillKey),
  ]);

  for (const rec of knownSkills) {
    const nameKey = normalizeSkillKey(rec.name);
    const recCanonKey = normalizeSkillKey(resolveSkillCanonical(rec.name).canonicalTitle);
    if (nameKey === spanKey || nameKey === canonKey || recCanonKey === canonKey) {
      reasons.push(`exact:${rec.name}`);
      return { match: rec, score: 1, method: recCanonKey === canonKey && nameKey !== spanKey ? 'canonical' : 'exact', reasons };
    }
    for (const al of rec.aliases ?? []) {
      if (aliasKeys.has(normalizeSkillKey(al)) || normalizeSkillKey(al) === spanKey) {
        reasons.push(`alias:${rec.name}`);
        return { match: rec, score: 0.95, method: 'alias', reasons };
      }
    }
    if (aliasKeys.has(nameKey)) {
      reasons.push(`canonical_match:${rec.name}`);
      return { match: rec, score: 0.92, method: 'canonical', reasons };
    }
  }

  let best: SkillSimilarityMatch = { score: 0, method: 'none', reasons: ['no_match'] };
  const spanTokens = tokenSet(canonical.canonicalTitle);
  for (const rec of knownSkills) {
    const score = jaccard(spanTokens, tokenSet(rec.name));
    if (score > best.score) {
      best = {
        match: rec,
        score,
        method: 'fuzzy',
        reasons: [`fuzzy:${rec.name}:${score.toFixed(2)}`],
      };
    }
  }

  if (best.score >= 0.72) return best;

  let contentBest: SkillSimilarityMatch = { score: 0, method: 'none', reasons: ['no_content_overlap'] };
  for (const rec of knownSkills) {
    const score = Math.max(
      contentRelatedScore(canonical.canonicalTitle, rec.name),
      contentRelatedScore(span, rec.name),
    );
    if (score > contentBest.score) {
      contentBest = {
        match: rec,
        score,
        method: 'fuzzy',
        reasons: [`content:${rec.name}:${score.toFixed(2)}`],
      };
    }
  }
  if (contentBest.score >= 0.5) return contentBest;

  return { score: 0, method: 'none', reasons: ['below_threshold'] };
}

export type SkillBookMatchStatus = 'new' | 'similar' | 'existing';

export type SkillBookMatch = {
  status: SkillBookMatchStatus;
  matchedId: string | null;
  matchedName: string | null;
  method: SkillSimilarityMatch['method'];
};

/** Classify a detected skill against the Skills book: hide true duplicates, hint merge for cousins. */
export function classifySkillBookMatch(
  candidate: string,
  book: Array<{ id?: string; name: string; aliases?: string[] }>,
): SkillBookMatch {
  const similar = findSimilarExistingSkill(
    candidate,
    book.map((row) => ({ name: row.name, aliases: row.aliases })),
  );
  if (!similar.match) {
    return { status: 'new', matchedId: null, matchedName: null, method: 'none' };
  }
  const rec = book.find((row) => normalizeSkillKey(row.name) === normalizeSkillKey(similar.match!.name));
  const matchedId = rec?.id ?? null;
  const matchedName = similar.match.name;
  if (similar.method === 'exact' || similar.method === 'alias' || similar.method === 'canonical') {
    return { status: 'existing', matchedId, matchedName, method: similar.method };
  }
  return { status: 'similar', matchedId, matchedName, method: similar.method };
}

/**
 * Skill-aware match first (canonical/alias/exact → existing, fuzzy → similar),
 * then generic name containment so "Job Search / Interviewing" can still hint Interviewing.
 */
export function matchDetectedSkillToBook(
  name: string,
  bookRows: Array<{ id: string; name: string; aliases?: string[] }>,
  skillBookIndex?: ReturnType<typeof buildBookIndexFromLabels>,
) {
  const skillMatch = classifySkillBookMatch(name, bookRows);
  if (skillMatch.status === 'existing') {
    return {
      match_status: 'existing' as const,
      matched_book_id: skillMatch.matchedId,
      matched_book_name: skillMatch.matchedName,
    };
  }
  const index =
    skillBookIndex ??
    buildBookIndexFromLabels(
      bookRows.map((row) => ({ id: row.id, label: row.name, aliases: row.aliases })),
    );
  const generic = enrichNameWithBookMatch(name, index);
  if (generic.match_status === 'existing') return generic;
  if (skillMatch.status === 'similar') {
    return {
      match_status: 'similar' as const,
      matched_book_id: skillMatch.matchedId,
      matched_book_name: skillMatch.matchedName,
    };
  }
  return generic;
}

export function clusterSkillSuggestionsByCanonical<T extends { skill_name: string; confidence?: number | null }>(
  rows: T[],
): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = normalizeSkillKey(resolveSkillCanonical(row.skill_name).canonicalTitle);
    const prev = byKey.get(key);
    if (!prev || (row.confidence ?? 0) > (prev.confidence ?? 0)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

export function clusterSkillSuggestionsByBookMatch<T extends {
  matched_book_id?: string | null;
  matched_book_name?: string | null;
  confidence?: number | null;
}>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  const unmatched: T[] = [];
  for (const row of rows) {
    const key = row.matched_book_id || (row.matched_book_name ? normalizeSkillKey(row.matched_book_name) : '');
    if (!key) {
      unmatched.push(row);
      continue;
    }
    const prev = byKey.get(key);
    if (!prev || (row.confidence ?? 0) > (prev.confidence ?? 0)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values(), ...unmatched];
}

export type RelatedBookSkill = {
  id: string;
  name: string;
  method: SkillSimilarityMatch['method'];
  score: number;
};

export type RelatedSkillCluster = {
  members: Array<{ id: string; name: string }>;
};

/** Skills in the book that look like the same or a closely related capability. */
export function findRelatedBookSkills(
  skill: { id: string; name: string; aliases?: string[] },
  book: Array<{ id: string; name: string; aliases?: string[] }>,
): RelatedBookSkill[] {
  const hits: RelatedBookSkill[] = [];
  for (const row of book) {
    if (row.id === skill.id) continue;
    if (normalizeSkillKey(row.name) === normalizeSkillKey(skill.name)) continue;
    const match = classifySkillBookMatch(skill.name, [row]);
    const reverse = classifySkillBookMatch(row.name, [skill]);
    const status = match.status !== 'new' ? match : reverse;
    if (status.status === 'new') continue;
    hits.push({
      id: row.id,
      name: row.name,
      method: status.method,
      score: status.status === 'existing' ? 1 : 0.7,
    });
  }
  return hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function clusterRelatedBookSkills(
  book: Array<{ id: string; name: string; aliases?: string[] }>,
): RelatedSkillCluster[] {
  const parent = new Map(book.map((row) => [row.id, row.id]));
  const find = (id: string): string => {
    let current = parent.get(id) ?? id;
    while (current !== (parent.get(current) ?? current)) {
      current = parent.get(current) ?? current;
    }
    return current;
  };
  const union = (left: string, right: string) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(a, b);
  };

  for (const row of book) {
    for (const hit of findRelatedBookSkills(row, book)) {
      union(row.id, hit.id);
    }
  }

  const groups = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of book) {
    const root = find(row.id);
    const members = groups.get(root) ?? [];
    members.push({ id: row.id, name: row.name });
    groups.set(root, members);
  }
  return [...groups.values()]
    .filter((members) => members.length >= 2)
    .map((members) => ({
      members: members.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
