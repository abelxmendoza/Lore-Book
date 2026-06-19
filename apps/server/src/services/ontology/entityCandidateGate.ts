/**
 * Deterministic pre-LLM gate for entity extraction.
 *
 * `omegaMemoryService.extractEntities` fires a full LLM call on EVERY ingested
 * message — it was the last always-on, ungated LLM call in the ingestion
 * pipeline (every domain detector already self-gates: see extractionSignals.ts,
 * multiEventSplittingService.isMultiEvent, hybridExtractor's rule-based router).
 *
 * The LLM's job is to find people/places/orgs/events. Those are either:
 *   1. proper nouns        ("Maria", "Blue Bottle", "Moreno Valley"), or
 *   2. glossary entities   ("abuela", "abuela's house" — discovered deterministically), or
 *   3. describable unnamed  ("the barista", "my coworker", "a guy from the show")
 *      — the one class with no proper noun, surfaced by common-noun cues here.
 *
 * If a message exhibits NONE of these, the LLM has nothing to extract and the
 * call is pure waste. The gate fails OPEN: any doubt → report candidates and let
 * the LLM run. A too-tight gate would drop an entity; a too-loose gate only
 * keeps the current (correct) behavior, so the bias is deliberately loose.
 */
import { discoverEntities } from './lexicalIntelligence';

// Proper-noun shape mirrors omegaMemoryService.extractDeterministicEntities so the
// gate and the extractor agree on what counts as a named candidate.
const PROPER_NOUN_RE =
  /\b([A-ZÀ-Ý][a-zÀ-ÿ0-9'’.-]+(?:\s+[A-ZÀ-Ý][a-zÀ-ÿ0-9'’.-]+){0,3})\b/;

// Common nouns that denote an unnamed-but-describable PERSON the LLM should
// nickname (the only entity class with no proper noun and no glossary hit).
const PERSON_COMMON_NOUN_RE =
  /\b(guy|girl|man|woman|dude|kid|boy|lady|friend|buddy|coworker|colleague|boss|manager|neighbou?r|stranger|barista|bartender|waiter|waitress|server|driver|teacher|professor|coach|trainer|nurse|doctor|cousin|roommate|landlord|client|customer|cashier|recruiter|interviewer|date|crush|ex|partner|teammate|classmate|mentor|therapist|bouncer|dealer|dj|owner)s?\b/i;

// Common nouns that denote an unnamed-but-describable PLACE/ORG.
const PLACE_COMMON_NOUN_RE =
  /\b(gym|bar|club|cafe|caf[eé]|restaurant|store|shop|office|school|church|hospital|clinic|park|beach|airport|hotel|studio|venue|warehouse|company|startup|team|band|crew|squad)s?\b/i;

export interface EntityCandidateVerdict {
  hasCandidates: boolean;
  properNounCount: number;
  glossaryHitCount: number;
  describableCue: boolean;
  reason: string;
}

/**
 * Decide whether `text` plausibly contains any extractable entity. Cheap,
 * deterministic, no I/O. Used to skip the entity-extraction LLM on entity-free
 * messages ("had a great workout", "feeling tired today", "thanks!").
 */
export function evaluateEntityCandidates(text: string): EntityCandidateVerdict {
  const t = (text ?? '').trim();
  if (!t) {
    return { hasCandidates: false, properNounCount: 0, glossaryHitCount: 0, describableCue: false, reason: 'empty' };
  }

  // Count proper nouns, but ignore a leading-capital first word that is only
  // capitalized by sentence position (e.g. "Had coffee" → "Had"). We require
  // either a multi-token proper noun or a proper noun not at sentence start.
  let properNounCount = 0;
  const re = new RegExp(PROPER_NOUN_RE, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const isSentenceStart = m.index === 0 || /[.!?]\s+$/.test(t.slice(0, m.index));
    const multiToken = /\s/.test(m[1]);
    if (multiToken || !isSentenceStart) properNounCount++;
  }

  const glossaryHitCount = discoverEntities(t).length;
  const describableCue = PERSON_COMMON_NOUN_RE.test(t) || PLACE_COMMON_NOUN_RE.test(t);

  const hasCandidates = properNounCount > 0 || glossaryHitCount > 0 || describableCue;
  const reason = hasCandidates
    ? `proper:${properNounCount} glossary:${glossaryHitCount} describable:${describableCue}`
    : 'no proper noun, glossary entity, or describable cue';

  return { hasCandidates, properNounCount, glossaryHitCount, describableCue, reason };
}

/** Convenience boolean for call sites that only need the gate decision. */
export function hasEntityCandidates(text: string): boolean {
  return evaluateEntityCandidates(text).hasCandidates;
}
