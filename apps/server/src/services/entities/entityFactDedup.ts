/**
 * Cost-effective entity-fact dedupe / lifecycle helpers.
 *
 * Pure heuristics only — no LLM calls. Used at write time (upsert) and read
 * time (knowledge base display) so similar facts collapse, confirmations bump
 * timestamps/counts, and state changes keep history instead of spawning twins.
 */

export type FactRelationKind =
  | 'exact_confirmation'
  | 'near_confirmation'
  | 'state_change'
  | 'distinct';

export type FactLike = {
  id?: string;
  fact: string;
  category: string;
  confidence?: number;
  mention_count?: number;
  status?: string;
  previous_value?: string | null;
  first_seen_at?: string | null;
  last_confirmed_at?: string | null;
  updated_at?: string | null;
};

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'at',
  'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'am', 'has',
  'have', 'had', 'does', 'do', 'did', 'that', 'this', 'these', 'those', 'it',
  'its', 'his', 'her', 'their', 'my', 'your', 'our',
]);

const PAST_MARKERS =
  /\b(used to|in the past|formerly|previously|no longer|anymore|once|back then|years? ago|had been)\b/i;
const PRESENT_MARKERS =
  /\b(currently|now|these days|still|today|presently|right now)\b/i;

/** Map common past/present verb forms onto a shared stem for content keys. */
const TENSE_NORMALIZE: Array<[RegExp, string]> = [
  [/\bhad\b/g, 'has'],
  [/\bwas\b/g, 'is'],
  [/\bwere\b/g, 'is'],
  [/\bworked\b/g, 'work'],
  [/\bworks\b/g, 'work'],
  [/\blived\b/g, 'live'],
  [/\blives\b/g, 'live'],
  [/\bdated\b/g, 'date'],
  [/\bdates\b/g, 'date'],
  [/\bdyed\b/g, 'dye'],
  [/\bdyes\b/g, 'dye'],
  [/\bplayed\b/g, 'play'],
  [/\bplays\b/g, 'play'],
  [/\bstudied\b/g, 'study'],
  [/\bstudies\b/g, 'study'],
  [/\bmoved\b/g, 'move'],
  [/\bmoves\b/g, 'move'],
  [/\bowned\b/g, 'own'],
  [/\bowns\b/g, 'own'],
  [/\bwent\b/g, 'go'],
  [/\bgoes\b/g, 'go'],
];

export function normalizeFactText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Content fingerprint that ignores tense / temporal adverbs. */
export function factContentKey(raw: string): string {
  let s = normalizeFactText(raw);
  s = s
    .replace(PAST_MARKERS, ' ')
    .replace(PRESENT_MARKERS, ' ');
  for (const [re, repl] of TENSE_NORMALIZE) {
    s = s.replace(re, repl);
  }

  // Collapse employer / project paraphrases onto shared proposition keys.
  const cluster = employmentOrProjectClusterKey(s);
  if (cluster) return cluster;

  const tokens = s
    .split(/\s+/)
    .map((t) => t.replace(/(ing|ed|es|s)$/i, ''))
    .filter((t) => t.length > 2 && !STOP.has(t));
  return [...new Set(tokens)].sort().join(' ');
}

/**
 * Canonical keys for employment / product-work paraphrases so
 * "Works at Amazon as QA", "Works at Ring", "Is currently working at Amazon"
 * collapse to one career proposition.
 */
export function employmentOrProjectClusterKey(normalized: string): string | null {
  const s = normalized.toLowerCase();

  if (/\b(?:lorebook|lore book|memovault)\b/.test(s) &&
      /\b(?:build|building|work|working|active|creat|ship|develop)\b/.test(s)) {
    return 'cluster:project:lorebook';
  }

  const employers: Array<{ re: RegExp; key: string }> = [
    { re: /\b(?:amazon\s*ring|ring(?:\s+at\s+amazon)?|amazon)\b/, key: 'cluster:employer:amazon_ring' },
    { re: /\bvanguard(?:\s+robotics)?\b/, key: 'cluster:employer:vanguard' },
    { re: /\bdennys?\b/, key: 'cluster:employer:dennys' },
    { re: /\bnorthwind\b/, key: 'cluster:employer:northwind' },
  ];

  for (const emp of employers) {
    if (!emp.re.test(s)) continue;
    if (/\b(?:work|job|employ|technician|qa|quality|onboard|offer|unemploy)\b/.test(s) ||
        /\b(?:at|for)\s+(?:amazon|ring|vanguard|dennys|northwind)\b/.test(s)) {
      return emp.key;
    }
  }

  if (/\bunemploy/.test(s) || /\bbetween jobs\b/.test(s)) {
    return 'cluster:employment:unemployed';
  }

  return null;
}

export function factTemporalPolarity(raw: string): 'past' | 'present' | 'neutral' {
  const text = raw.toLowerCase();
  const past =
    PAST_MARKERS.test(text) ||
    /\b(had|was|were|used to|worked|lived|dated|dyed|played|studied|moved|owned)\b/.test(text);
  const present =
    PRESENT_MARKERS.test(text) ||
    /\b(has|is|are|works|lives|dates|dyes|plays|studies|moves|owns)\b/.test(text);
  if (past && !present) return 'past';
  if (present && !past) return 'present';
  if (past && present) {
    // "had … now" etc. — lean on markers
    if (PAST_MARKERS.test(text) && !PRESENT_MARKERS.test(text)) return 'past';
    if (PRESENT_MARKERS.test(text) && !PAST_MARKERS.test(text)) return 'present';
  }
  return 'neutral';
}

/** Whether a fact should render under History (demoted) vs Current. */
export function isHistoryFact(fact: {
  fact: string;
  status?: string;
  previous_value?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  if (fact.status === 'contradicted') return true;
  const polarity = factTemporalPolarity(fact.fact);
  if (polarity === 'past') return true;
  const changes = fact.metadata && Array.isArray(fact.metadata.state_changes)
    ? fact.metadata.state_changes
    : [];
  // Superseded wording kept only as previous_value on an updated present fact stays Current;
  // a row whose last relation was state_change into past tense is History via polarity above.
  if (changes.length > 0 && polarity === 'neutral' && fact.previous_value) {
    // Ambiguous: keep as current if present markers elsewhere; else history if status updated
    if (fact.status === 'updated' && PAST_MARKERS.test(String(fact.previous_value))) {
      return false;
    }
  }
  return false;
}

/** Distinct confirmation count for display (evidence_ids preferred). */
export function confirmationDisplayCount(fact: {
  mention_count?: number;
  metadata?: Record<string, unknown> | null;
}): number {
  const ids = fact.metadata && Array.isArray(fact.metadata.evidence_ids)
    ? fact.metadata.evidence_ids
    : null;
  if (ids && ids.length > 0) return ids.length;
  const metaCount = fact.metadata?.confirmation_count;
  if (typeof metaCount === 'number' && metaCount > 0) return metaCount;
  return fact.mention_count ?? 0;
}

function tokenSet(raw: string): Set<string> {
  const key = factContentKey(raw);
  return new Set(key ? key.split(' ') : []);
}

export function factTokenOverlapRatio(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  const [shorter, longer] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  let overlap = 0;
  for (const t of shorter) if (longer.has(t)) overlap += 1;
  return overlap / shorter.size;
}

/**
 * Classify how an incoming fact relates to an existing one.
 * Same category is assumed by the caller.
 */
export function classifyFactRelation(existingFact: string, incomingFact: string): FactRelationKind {
  const na = normalizeFactText(existingFact);
  const nb = normalizeFactText(incomingFact);
  if (!na || !nb) return 'distinct';
  if (na === nb) return 'exact_confirmation';

  const keyA = factContentKey(existingFact);
  const keyB = factContentKey(incomingFact);
  const overlap = factTokenOverlapRatio(existingFact, incomingFact);

  if (keyA && keyA === keyB) {
    const polA = factTemporalPolarity(existingFact);
    const polB = factTemporalPolarity(incomingFact);
    if (polA !== 'neutral' && polB !== 'neutral' && polA !== polB) {
      return 'state_change';
    }
    return 'near_confirmation';
  }

  // High lexical overlap with opposing temporal polarity → treat as state change
  // (e.g. "Has pink hair" vs "Had pink hair in the past" if stemming diverged).
  if (overlap >= 0.7) {
    const polA = factTemporalPolarity(existingFact);
    const polB = factTemporalPolarity(incomingFact);
    if (polA !== 'neutral' && polB !== 'neutral' && polA !== polB) {
      return 'state_change';
    }
    return 'near_confirmation';
  }

  if (overlap >= 0.6) return 'near_confirmation';
  return 'distinct';
}

export function findBestMatchingFact<T extends FactLike>(
  incoming: { fact: string; category: string },
  existing: T[],
): { match: T; relation: FactRelationKind } | null {
  let best: { match: T; relation: FactRelationKind; score: number } | null = null;

  for (const row of existing) {
    if (row.category !== incoming.category) continue;
    const relation = classifyFactRelation(row.fact, incoming.fact);
    if (relation === 'distinct') continue;
    const score =
      (relation === 'exact_confirmation' ? 3 : relation === 'near_confirmation' ? 2 : 1) +
      factTokenOverlapRatio(row.fact, incoming.fact) +
      Math.min(1, (row.mention_count ?? 1) / 10);
    if (!best || score > best.score) best = { match: row, relation, score };
  }

  return best ? { match: best.match, relation: best.relation } : null;
}

/** Prefer the more informative / recent row when collapsing display duplicates. */
export function pickPreferredFact<T extends FactLike>(a: T, b: T): T {
  const confA = a.confidence ?? 0;
  const confB = b.confidence ?? 0;
  const mentionsA = a.mention_count ?? 1;
  const mentionsB = b.mention_count ?? 1;
  if (mentionsA !== mentionsB) return mentionsA > mentionsB ? a : b;
  if (confA !== confB) return confA > confB ? a : b;
  const timeA = Date.parse(a.last_confirmed_at || a.updated_at || a.first_seen_at || '') || 0;
  const timeB = Date.parse(b.last_confirmed_at || b.updated_at || b.first_seen_at || '') || 0;
  if (timeA !== timeB) return timeA > timeB ? a : b;
  // Prefer corrected/updated wording over stale active twins
  const rank = (s?: string) => (s === 'corrected' ? 3 : s === 'updated' ? 2 : 1);
  if (rank(a.status) !== rank(b.status)) return rank(a.status) > rank(b.status) ? a : b;
  return (a.fact?.length ?? 0) >= (b.fact?.length ?? 0) ? a : b;
}

/**
 * Collapse redundant similar facts in the same category for UI / clipboard.
 * Losers are dropped (read path only); write path should prevent new twins.
 */
export function dedupeEntityFactsForDisplay<T extends FactLike>(facts: T[]): T[] {
  const kept: T[] = [];
  for (const fact of facts) {
    let absorbed = false;
    for (let i = 0; i < kept.length; i++) {
      const other = kept[i]!;
      if (other.category !== fact.category) continue;
      const relation = classifyFactRelation(other.fact, fact.fact);
      if (relation === 'distinct') continue;
      const winner = pickPreferredFact(other, fact);
      const loser = winner === other ? fact : other;
      kept[i] = {
        ...winner,
        mention_count: (winner.mention_count ?? 1) + (loser.mention_count ?? 1),
        confidence: Math.max(winner.confidence ?? 0, loser.confidence ?? 0),
        first_seen_at: earlierIso(winner.first_seen_at, loser.first_seen_at) ?? winner.first_seen_at,
        last_confirmed_at:
          laterIso(winner.last_confirmed_at, loser.last_confirmed_at) ?? winner.last_confirmed_at,
        previous_value: winner.previous_value || loser.previous_value || null,
      } as T;
      absorbed = true;
      break;
    }
    if (!absorbed) kept.push(fact);
  }
  return kept;
}

function earlierIso(a?: string | null, b?: string | null): string | null {
  const ta = Date.parse(a || '') || 0;
  const tb = Date.parse(b || '') || 0;
  if (!ta && !tb) return null;
  if (!ta) return b ?? null;
  if (!tb) return a ?? null;
  return ta <= tb ? (a ?? null) : (b ?? null);
}

function laterIso(a?: string | null, b?: string | null): string | null {
  const ta = Date.parse(a || '') || 0;
  const tb = Date.parse(b || '') || 0;
  if (!ta && !tb) return null;
  if (!ta) return b ?? null;
  if (!tb) return a ?? null;
  return ta >= tb ? (a ?? null) : (b ?? null);
}

/** Prefer keeping a clearer existing wording on near-confirmations. */
export function preferFactWording(existing: string, incoming: string, relation: FactRelationKind): string {
  if (relation === 'state_change') return incoming.trim();
  if (relation === 'exact_confirmation') return existing.trim();
  // Near confirm: keep longer / more specific existing unless incoming is clearly richer
  if (incoming.trim().length > existing.trim().length + 12) return incoming.trim();
  return existing.trim();
}
