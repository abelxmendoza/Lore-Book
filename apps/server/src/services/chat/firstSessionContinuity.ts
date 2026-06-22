/**
 * First-session continuity callback (Launch-Readiness Step 6: the "aha").
 *
 * A brand-new user only believes "LoreBook remembers me" when it visibly recalls
 * something they just said. This is a deterministic, provenance-backed detector:
 * given the current message and the earlier user turns in the same session, it
 * finds a salient entity the user mentioned before and recurs now, and returns a
 * callback the UI can surface ("Earlier you mentioned Tony — I've got that.").
 *
 * Deterministic and synchronous — it uses in-session messages, NOT the async
 * ingestion pipeline, so it fires reliably within the first few turns regardless
 * of ingestion timing. No LLM call.
 */

export type ContinuityCallback = {
  /** The recurring entity (proper noun) the user mentioned earlier. */
  entity: string;
  /** Snippet of the earlier message — the provenance for the callback. */
  quote: string;
  /** 0-based index into the prior-user-messages array (oldest → newest). */
  priorMessageIndex: number;
  /** Ready-to-render callback line. */
  calloutText: string;
};

// Common capitalized words that start sentences but aren't entities.
const STOPWORDS = new Set([
  'I', 'A', 'An', 'The', 'My', 'We', 'You', 'He', 'She', 'They', 'It', 'This',
  'That', 'These', 'Those', 'And', 'But', 'Or', 'So', 'If', 'When', 'Then',
  'Yes', 'No', 'Ok', 'Okay', 'Hi', 'Hey', 'Hello', 'Thanks', 'Thank', 'Please',
  'What', 'Who', 'Where', 'Why', 'How', 'Do', 'Did', 'Does', 'Is', 'Are', 'Was',
  'Were', 'Will', 'Would', 'Could', 'Should', 'Can', 'Maybe', 'Just', 'Now',
  'Today', 'Tomorrow', 'Yesterday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday',
  'Friday', 'Saturday', 'Sunday',
]);

const PROPER_NOUN_RE = /\b([A-Z][a-zA-Z0-9'&.-]+(?:\s+[A-Z][a-zA-Z0-9'&.-]+)*)\b/g;

/** Extract candidate proper-noun entities (longest/multi-word first). */
export function extractSalientEntities(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(PROPER_NOUN_RE)) {
    const phrase = m[1].trim();
    // Drop phrases that are only stopwords (e.g. sentence-initial "The", "I").
    const tokens = phrase.split(/\s+/);
    const meaningful = tokens.filter((t) => !STOPWORDS.has(t));
    if (meaningful.length === 0) continue;
    const candidate = meaningful.join(' ');
    if (candidate.length < 3) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  // Multi-word entities are more specific → prefer them.
  return out.sort((a, b) => b.length - a.length);
}

function mentions(text: string, entity: string): boolean {
  const re = new RegExp(`\\b${entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return re.test(text);
}

function snippet(text: string, max = 140): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Find a salient entity from the current message that the user also mentioned in
 * an earlier turn this session. `priorUserMessages` is oldest → newest.
 */
export function detectFirstSessionCallback(
  currentMessage: string,
  priorUserMessages: string[],
): ContinuityCallback | null {
  if (!currentMessage.trim() || priorUserMessages.length === 0) return null;

  const entities = extractSalientEntities(currentMessage);
  if (entities.length === 0) return null;

  for (const entity of entities) {
    // Earliest prior mention is the most "I remember from before" moment.
    for (let i = 0; i < priorUserMessages.length; i++) {
      const prior = priorUserMessages[i];
      if (mentions(prior, entity)) {
        return {
          entity,
          quote: snippet(prior),
          priorMessageIndex: i,
          calloutText: `Earlier you mentioned ${entity} — I've got that.`,
        };
      }
    }
  }
  return null;
}

/** Only run the callback during the first-session window to keep it special. */
export const FIRST_SESSION_TURN_LIMIT = 12;

export function shouldRunFirstSessionCallback(sessionTurnCount: number): boolean {
  return sessionTurnCount > 0 && sessionTurnCount <= FIRST_SESSION_TURN_LIMIT;
}
