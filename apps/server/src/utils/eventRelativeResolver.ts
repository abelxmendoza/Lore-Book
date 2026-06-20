/**
 * Event-relative temporal resolver.
 *
 * Resolves "before/after/around <a known event>" against the user's already-dated
 * resolved events. "I quit my job before the move" → if a dated "move" event
 * exists, this statement is bounded to BEFORE that date. Complements honest-
 * occurrence: a statement that would otherwise be occurrence-unknown becomes a
 * one-sided ORDERING bound (occurred_before / occurred_after), which is exactly
 * what biography sequencing needs.
 *
 * Pure & deterministic. Matching is deliberately conservative — a WRONG bound is
 * worse than none (same principle as the honest-occurrence work), so we require a
 * strong token overlap between the phrase and an event before committing.
 */

export interface DatedEvent {
  id: string;
  title?: string | null;
  summary?: string | null;
  start_time: string;
  end_time?: string | null;
}

export interface EventRelativeAnchor {
  relation: 'before' | 'after' | 'around';
  matchedEventId: string;
  matchedEventTitle: string;
  cue: string;
  /** Statement occurred at/after this instant (relation 'after'/'around'). */
  occurredAfter?: string;
  /** Statement occurred at/before this instant (relation 'before'/'around'). */
  occurredBefore?: string;
  confidence: number;
}

const norm = (s: string): string =>
  (s ?? '').toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ').trim();

// Words that carry no matching signal — excluded from phrase↔event token overlap.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'my', 'our', 'his', 'her', 'their', 'that', 'this', 'of', 'to',
  'and', 'with', 'in', 'on', 'at', 'for', 'we', 'i', 'whole', 'big', 'last', 'first',
  'time', 'thing', 'happened', 'was', 'were', 'had', 'got',
]);

// "before the move", "right after the wedding", "the summer before graduation"…
const REL_RE =
  /\b(right before|right after|just before|just after|the (?:summer|spring|fall|autumn|winter|year|day|night|week|month) (?:before|after)|before|after|during|around)\s+(?:the|my|our|that|his|her|their)?\s*([a-zà-ÿ][\wà-ÿ' ]{1,40}?)(?=[.,;!?]|$|\s+(?:and|but|so|when|because|which|where))/i;

function relationOf(cue: string): 'before' | 'after' | 'around' {
  const c = cue.toLowerCase();
  if (c.includes('after')) return 'after';
  if (c.includes('before')) return 'before';
  return 'around'; // during / around
}

function significantTokens(text: string): string[] {
  return norm(text)
    .split(/[^a-zà-ÿ0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Resolve an event-relative phrase to an ordering bound against known dated events.
 * Returns null when no relative phrase is present or no event matches confidently.
 */
export function resolveEventRelativeAnchor(
  text: string,
  events: DatedEvent[],
): EventRelativeAnchor | null {
  if (!text?.trim() || events.length === 0) return null;

  const m = norm(text).match(REL_RE);
  if (!m) return null;

  const cue = m[1];
  const phrase = m[2]?.trim();
  if (!phrase) return null;

  const phraseTokens = significantTokens(phrase);
  if (phraseTokens.length === 0) return null;
  const phraseSet = new Set(phraseTokens);

  // Best event by shared significant tokens with title (weighted) + summary.
  let best: { event: DatedEvent; score: number } | null = null;
  for (const event of events) {
    const titleTokens = new Set(significantTokens(event.title ?? ''));
    const summaryTokens = new Set(significantTokens(event.summary ?? ''));
    let score = 0;
    for (const t of phraseSet) {
      if (titleTokens.has(t)) score += 2;
      else if (summaryTokens.has(t)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { event, score };
  }

  // Require a real overlap: at least one title hit (score ≥ 2) OR two summary hits.
  if (!best || best.score < 2) return null;

  const relation = relationOf(cue);
  const eventStart = best.event.start_time;
  const eventEnd = best.event.end_time ?? best.event.start_time;
  // Confidence scales with overlap strength but stays modest — this is an
  // inferred ordering, not an explicit date.
  const confidence = Math.min(0.7, 0.4 + best.score * 0.1);

  const anchor: EventRelativeAnchor = {
    relation,
    matchedEventId: best.event.id,
    matchedEventTitle: best.event.title ?? '(untitled event)',
    cue,
    confidence,
  };

  if (relation === 'before') {
    anchor.occurredBefore = eventStart;
  } else if (relation === 'after') {
    anchor.occurredAfter = eventEnd;
  } else {
    // around / during — bound both sides by the event span.
    anchor.occurredAfter = eventStart;
    anchor.occurredBefore = eventEnd;
  }

  return anchor;
}

/** Cheap pre-check: is there an event-relative phrase worth resolving? */
export function hasEventRelativeCue(text: string): boolean {
  return REL_RE.test(norm(text));
}
