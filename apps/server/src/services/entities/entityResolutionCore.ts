/**
 * Entity Resolution Core (Lore-Aware Parsing + Ambiguity Resolution).
 *
 * ONE deterministic resolution brain that the scattered resolvers
 * (characterRegistry.classifyForCreation, entityResolutionService, entityResolver,
 * EntityRegistry, certifiedEntityIndexService, peoplePlacesService dedup) should
 * collapse into — see docs/episodes-to-life-graph.md deletion plan. Adding a 7th
 * parallel resolver would worsen the sprawl this sprint exists to remove, so this
 * is a pure, testable CORE the existing call sites route through, not a new pipeline.
 *
 * Capabilities (Phases 4 + 5):
 *  - Lore-aware: "grandma" resolves to the existing "Abuela" via kinship/alias —
 *    never creates a duplicate when a high-confidence existing entity exists.
 *  - Context-aware disambiguation: among same-name candidates ("Juan"), rank by
 *    thread co-occurrence, recent episodes, relationship overlap, recency, and
 *    importance — not string distance. Only disambiguate below a confidence margin.
 */

import { classifyEntity, isCharacterEligible, type EntityClass } from './entityClassifier';

export interface ResolutionCandidate {
  id: string;
  name: string;
  aliases?: string[];
  type?: string;
  mentions?: number;             // importance proxy
  lastMentionedAt?: string | null; // recency
  relatedEntityIds?: string[];   // relationship graph neighbours
}

export interface ResolutionContext {
  /** Entity ids active in the current thread (strongest signal). */
  threadEntityIds?: string[];
  /** Entity ids from recent episodes (medium signal). */
  recentEntityIds?: string[];
  /** When the current message occurred (for recency scoring). */
  now?: number;
}

export type ResolutionAction = 'resolve' | 'disambiguate' | 'create' | 'skip';

export interface ScoredCandidate { id: string; name: string; score: number; reasons: string[]; }

export interface ResolutionResult {
  action: ResolutionAction;
  resolvedId: string | null;
  confidence: number;          // 0..1
  classification: EntityClass;
  ranked: ScoredCandidate[];   // best-first
}

const DAY_MS = 86_400_000;
const DISAMBIGUATION_MARGIN = 0.18; // if top − second < this, ask instead of guess

// Kinship synonyms → canonical role, so "grandma" matches an existing "Abuela".
const KINSHIP_ROLE: Array<{ re: RegExp; role: string }> = [
  { re: /\b(grandma|grandmother|abuela|nana|nonna|granny)\b/i, role: 'grandmother' },
  { re: /\b(grandpa|grandfather|abuelo|nono)\b/i, role: 'grandfather' },
  { re: /\b(mom|mother|mamá|mama|mommy)\b/i, role: 'mother' },
  { re: /\b(dad|father|papá|papa|daddy)\b/i, role: 'father' },
  { re: /\b(t[íi]o|uncle)\b/i, role: 'uncle' },
  { re: /\b(t[íi]a|aunt|auntie)\b/i, role: 'aunt' },
  { re: /\b(brother|hermano)\b/i, role: 'brother' },
  { re: /\b(sister|hermana)\b/i, role: 'sister' },
];

function kinshipRole(text: string): string | null {
  for (const { re, role } of KINSHIP_ROLE) if (re.test(text)) return role;
  return null;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Does a candidate lexically match the mention (exact name, alias, or kinship role)? */
function lexicalMatch(mention: string, c: ResolutionCandidate): { matched: boolean; kind: 'exact' | 'alias' | 'kinship' | 'none' } {
  const m = norm(mention);
  if (norm(c.name) === m) return { matched: true, kind: 'exact' };
  if ((c.aliases ?? []).some((a) => norm(a) === m)) return { matched: true, kind: 'alias' };
  // First-name match (mention is one token equal to candidate's first token)
  if (!m.includes(' ')) {
    const cFirst = norm(c.name).split(' ')[0];
    if (cFirst === m) return { matched: true, kind: 'exact' };
  }
  // Kinship-role equivalence: "grandma" ↔ a candidate whose name/aliases carry the same role.
  const mRole = kinshipRole(m);
  if (mRole) {
    const candText = [c.name, ...(c.aliases ?? [])].join(' ');
    if (kinshipRole(candText) === mRole) return { matched: true, kind: 'kinship' };
  }
  return { matched: false, kind: 'none' };
}

function recencyScore(lastMentionedAt: string | null | undefined, now: number): number {
  if (!lastMentionedAt) return 0;
  const ageDays = (now - new Date(lastMentionedAt).getTime()) / DAY_MS;
  return Math.exp(-ageDays / 30); // 0..1, ~half-life one month
}

/**
 * Resolve a mention against existing entities. Pure & deterministic.
 * Returns resolve (high confidence existing), disambiguate (close candidates),
 * create (no match + classifiable), or skip (not an entity worth creating).
 */
export function resolveMention(
  mention: string,
  candidates: ResolutionCandidate[],
  context: ResolutionContext = {}
): ResolutionResult {
  const classification = classifyEntity(mention).type;
  const now = context.now ?? Date.now();
  const threadSet = new Set(context.threadEntityIds ?? []);
  const recentSet = new Set(context.recentEntityIds ?? []);

  // Candidates that lexically match the mention.
  const matches = candidates
    .map((c) => ({ c, lex: lexicalMatch(mention, c) }))
    .filter((x) => x.lex.matched);

  if (matches.length === 0) {
    // Nothing to resolve to. Create only if we can classify it positively;
    // unknown/unclassified mentions are skipped (they require more evidence).
    const action: ResolutionAction = classification === 'UNKNOWN' || classification === 'UNCLASSIFIED' ? 'skip' : 'create';
    return { action, resolvedId: null, confidence: action === 'create' ? 0.6 : 0.1, classification, ranked: [] };
  }

  const maxMentions = Math.max(1, ...matches.map((x) => x.c.mentions ?? 0));
  const ranked: ScoredCandidate[] = matches.map(({ c, lex }) => {
    const reasons: string[] = [];
    let score = 0;
    // Base from match kind. The spread is small: for the same surface token
    // ("Juan"), exact-vs-alias should NOT dominate context.
    const base = lex.kind === 'exact' ? 0.36 : lex.kind === 'alias' ? 0.34 : 0.32;
    score += base; reasons.push(`${lex.kind}-match`);
    // Context is the strongest discriminator (this is what fixes "wrong Juan").
    if (threadSet.has(c.id)) { score += 0.4; reasons.push('in-thread'); }
    else if (recentSet.has(c.id)) { score += 0.22; reasons.push('recent-episode'); }
    // Relationship overlap with thread entities — a strong contextual signal.
    const relOverlap = (c.relatedEntityIds ?? []).filter((id) => threadSet.has(id)).length;
    if (relOverlap > 0) { score += Math.min(0.3, 0.22 * relOverlap); reasons.push(`related-to-thread(${relOverlap})`); }
    // Recency + importance (gentle priors, not discriminators).
    const rec = recencyScore(c.lastMentionedAt, now);
    if (rec > 0.05) { score += 0.1 * rec; reasons.push('recent'); }
    const imp = Math.log1p(c.mentions ?? 0) / Math.log1p(maxMentions);
    if (imp > 0) { score += 0.07 * imp; reasons.push('important'); }
    return { id: c.id, name: c.name, score: Number(score.toFixed(4)), reasons };
  }).sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1];

  // Single match, or a clear winner → resolve. Otherwise ask.
  if (!second || top.score - second.score >= DISAMBIGUATION_MARGIN) {
    return { action: 'resolve', resolvedId: top.id, confidence: Math.min(0.99, top.score), classification, ranked };
  }
  return { action: 'disambiguate', resolvedId: null, confidence: top.score, classification, ranked };
}

/** Convenience: would this mention create a NEW character? (lore-aware guard) */
export function wouldCreateCharacter(mention: string, candidates: ResolutionCandidate[], context?: ResolutionContext): boolean {
  const r = resolveMention(mention, candidates, context);
  return r.action === 'create' && isCharacterEligible(r.classification);
}
