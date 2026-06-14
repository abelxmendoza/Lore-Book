import { normalizeNameKey, namesOverlapByContainment } from './nameNormalization';

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when the user's message actually references the stored mention text (whole words only). */
export function messageReferencesMention(message: string, mention: string): boolean {
  const mentionTrimmed = mention.trim();
  if (!mentionTrimmed || !message.trim()) return false;

  const mentionTokens = mentionTrimmed.toLowerCase().split(/\s+/).filter(Boolean);

  if (mentionTokens.length === 1) {
    // Whole-word match only — "features" must NOT match mention "Fairy".
    return new RegExp(`\\b${escapeRegex(mentionTokens[0])}\\b`, 'i').test(message);
  }

  return new RegExp(
    `\\b${mentionTokens.map(escapeRegex).join('\\s+')}\\b`,
    'i'
  ).test(message);
}

/** True when any USER turn in this thread's history references the mention. */
export function threadUserHistoryReferencesMention(
  conversationHistory: Array<{ role: string; content: string }> | undefined,
  currentMessage: string | undefined,
  mention: string
): boolean {
  if (currentMessage && messageReferencesMention(currentMessage, mention)) return true;
  for (const msg of conversationHistory ?? []) {
    if (msg.role === 'user' && messageReferencesMention(msg.content, mention)) return true;
  }
  return false;
}

export type DisambiguationCandidate = {
  character_id?: string;
  entity_id?: string;
  name: string;
  subtitle?: string;
};

type CharacterRow = {
  id: string;
  name: string;
  alias: string[] | null;
};

export function dedupeCandidatesById<T extends DisambiguationCandidate>(candidates: T[]): T[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const id = c.character_id ?? c.entity_id ?? '';
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Drop candidates that share the same normalized display name. */
export function collapseSameNameCandidates<T extends DisambiguationCandidate>(candidates: T[]): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const c of candidates) {
    const key = normalizeNameKey(c.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(c);
  }
  return kept;
}

function charactersShareIdentity(a: CharacterRow, b: CharacterRow): boolean {
  if (a.id === b.id) return true;
  const aNorm = normalizeNameKey(a.name);
  const bNorm = normalizeNameKey(b.name);
  if (aNorm === bNorm) return true;

  const aAliases = (a.alias ?? []).map(normalizeNameKey);
  const bAliases = (b.alias ?? []).map(normalizeNameKey);

  if (aAliases.includes(bNorm) || bAliases.includes(aNorm)) return true;

  for (const alias of aAliases) {
    if (alias === bNorm || namesOverlapByContainment(alias, bNorm)) return true;
  }
  for (const alias of bAliases) {
    if (alias === aNorm || namesOverlapByContainment(alias, aNorm)) return true;
  }

  return false;
}

/** Collapse candidates that refer to the same character via name/alias links. */
export function collapseAliasLinkedCandidates<T extends DisambiguationCandidate>(
  candidates: T[],
  rows: CharacterRow[]
): T[] {
  const deduped = dedupeCandidatesById(candidates);
  if (deduped.length <= 1) return deduped;

  const rowById = new Map(rows.map((r) => [r.id, r]));
  const kept: T[] = [];

  for (const c of deduped) {
    const id = c.character_id ?? c.entity_id;
    const row = id ? rowById.get(id) : undefined;
    if (!row) {
      kept.push(c);
      continue;
    }

    const linked = kept.some((k) => {
      const kId = k.character_id ?? k.entity_id;
      const kRow = kId ? rowById.get(kId) : undefined;
      return kRow ? charactersShareIdentity(row, kRow) : false;
    });

    if (!linked) kept.push(c);
  }

  return kept;
}

export function normalizeDisambiguationCandidates<T extends DisambiguationCandidate>(
  candidates: T[],
  characterRows: CharacterRow[] = []
): T[] {
  let result = dedupeCandidatesById(candidates);
  if (characterRows.length > 0) {
    result = collapseAliasLinkedCandidates(result, characterRows);
  }
  return collapseSameNameCandidates(result);
}
