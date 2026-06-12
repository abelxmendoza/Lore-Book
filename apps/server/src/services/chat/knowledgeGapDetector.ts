/**
 * Knowledge Gap Detector — explicit unknowns for the chat prompt.
 *
 * When a user asks an entity question ("tell me about Marcus") and the name
 * matches nothing in the registry — or matches an entity with no events and
 * no attributes — the emptiness used to collapse silently into the prompt.
 * This detector turns that absence into a structured KNOWLEDGE GAPS block so
 * the model reliably answers with TIER 3 honesty ("we haven't talked about
 * Marcus yet — tell me about him") instead of guessing.
 *
 * Pure functions only — all data is supplied by ragBuilderService, which is
 * the single call site. Detection is deliberately conservative: it only runs
 * for entity-query shaped messages (isEntityQuery gate at the call site).
 */

export interface KnowledgeGap {
  type: 'unknown_entity' | 'sparse_entity';
  name: string;
  entityId?: string;
  entityType?: 'character' | 'location';
}

/** Max gaps surfaced per message — keeps the prompt block small. */
const MAX_GAPS = 2;

// Capitalized words that are never entity names. Mirrors (and extends) the
// skip list in entityAmbiguityService.extractEntityMentions, plus the verbs
// that lead the ENTITY_QUERY_PATTERNS so sentence-initial capitals don't fire.
const SKIP_WORDS = new Set([
  'i', 'the', 'this', 'that', 'there', 'here', 'when', 'where', 'what', 'who', 'why', 'how',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'tell', 'remind', 'catch', 'fill', 'walk', 'update', 'summary', 'everything',
  'give', 'show', 'hey', 'okay', 'also', 'and', 'but', 'about', 'me', 'you',
  'lorebook', 'lore', 'book', 'do', 'does', 'did', 'is', 'was', 'are', 'were',
]);

/**
 * Extract capitalized candidate names from a message
 * (same heuristic family as entityAmbiguityService.extractEntityMentions).
 */
export function extractCandidateNames(message: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = namePattern.exec(message)) !== null) {
    const text = match[1];
    // Multi-word candidates: drop leading skip words ("Tell Marcus" → "Marcus")
    const words = text.split(/\s+/).filter(w => !SKIP_WORDS.has(w.toLowerCase()));
    const candidate = words.join(' ');
    const key = candidate.toLowerCase();
    if (candidate.length > 2 && !SKIP_WORDS.has(key) && !seen.has(key)) {
      seen.add(key);
      names.push(candidate);
    }
  }
  return names;
}

type KnownCharacter = { id: string; name: string; alias?: string[] | null };
type KnownLocation = { id: string; name: string };

/** Case-insensitive containment in either direction ("Sarah" ↔ "Sarah Chen"). */
function namesOverlap(a: string, b: string): boolean {
  if (a.length < 3 || b.length < 3) return false;
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return la.includes(lb) || lb.includes(la);
}

function isKnownName(candidate: string, characters: KnownCharacter[], locations: KnownLocation[]): boolean {
  for (const c of characters) {
    if (c.name && namesOverlap(candidate, c.name)) return true;
    if ((c.alias ?? []).some(a => a && namesOverlap(candidate, a))) return true;
  }
  return locations.some(l => l.name && namesOverlap(candidate, l.name));
}

export function detectKnowledgeGaps(params: {
  message: string;
  characters: KnownCharacter[];
  locations: KnownLocation[];
  /** Entities detectMentionedEntities matched in the message (best first). */
  matchedEntities: Array<{ id: string; type: 'character' | 'location'; name: string }>;
  /** Whether loadEntityArc returned a usable arc for the primary match. */
  arcLoadedForPrimary: boolean;
  /** Whether the primary match has any current attributes on record. */
  primaryHasAttributes: boolean;
}): KnowledgeGap[] {
  const { message, characters, locations, matchedEntities, arcLoadedForPrimary, primaryHasAttributes } = params;
  const gaps: KnowledgeGap[] = [];

  // Sparse: the name resolved to a real entity, but the record is just a name
  // (no events worth an arc, no attributes).
  const primary = matchedEntities[0];
  if (primary && !arcLoadedForPrimary && !primaryHasAttributes) {
    gaps.push({ type: 'sparse_entity', name: primary.name, entityId: primary.id, entityType: primary.type });
  }

  // Unknown: capitalized names in the question that match nothing on record.
  for (const candidate of extractCandidateNames(message)) {
    if (gaps.length >= MAX_GAPS) break;
    if (isKnownName(candidate, characters, locations)) continue;
    if (gaps.some(g => namesOverlap(g.name, candidate))) continue;
    gaps.push({ type: 'unknown_entity', name: candidate });
  }

  return gaps.slice(0, MAX_GAPS);
}

/** Format gaps as the system-prompt block. Returns null when there are none. */
export function formatKnowledgeGapBlock(gaps: KnowledgeGap[]): string | null {
  if (gaps.length === 0) return null;
  const lines = gaps.map(g =>
    g.type === 'unknown_entity'
      ? `- User asked about "${g.name}" — nothing in the record matches this name. Respond with TIER 3: say you two haven't talked about ${g.name} yet and invite them to share. Do NOT speculate, do NOT imply partial memory.`
      : `- "${g.name}" is on record but has no events or facts yet — you know the name only. Respond with TIER 2/3: acknowledge you've heard the name, say you don't know more yet, and invite detail.`
  );
  return [
    '**KNOWLEDGE GAPS — explicit unknowns detected for this message:**',
    ...lines,
    'If the user may be using a nickname for someone you DO know, ask to confirm rather than asserting total absence.',
  ].join('\n');
}
