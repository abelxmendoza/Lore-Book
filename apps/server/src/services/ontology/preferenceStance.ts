/**
 * Preference Stance Detector — deterministic like/dislike extraction.
 *
 * Part of the Stance & Affect lexical layer (see docs/stance-affect-lexical-plan.md).
 * Cue vocabulary lives in glossary.ts (STANCE_PREFERENCE); this module owns regex
 * matching and pollution guards. No LLM, no DB — every function here is pure.
 *
 * Precision over recall. A journal sentence only yields a stance when the cue, the
 * subject (self vs other), and a usable target all line up, and when none of the
 * pollution guards fire:
 *   - negation       "I don't love olives"      → DISLIKE (flipped), lower confidence
 *   - irrealis       "I'd love to go"           → dropped (not an actual stance)
 *   - revocation     "I used to love it"        → dropped (no longer holds)
 *   - attribution    "She loves sushi"          → attributedToSelf = false
 *   - empty target   "I like that"              → dropped (pronoun/no target)
 */

import { stancePhraseSpecs, stanceVerbSpecs } from './glossary';

export type StancePolarity = 'LIKE' | 'DISLIKE';

export interface PreferenceStance {
  polarity: StancePolarity;
  /** Normalized target phrase the stance is about ("the gym", "my manager", "sushi"). */
  target: string;
  /** Target as it appeared in the source text. */
  targetRaw: string;
  /** The matched cue phrase ("can't stand", "obsessed with", "i love"). */
  cue: string;
  /** Lexical strength of the cue before modifiers (0..1). */
  intensity: number;
  /** Final confidence after negation/intensifier adjustments (0..1). */
  confidence: number;
  /** True when a negator flipped the cue's polarity. */
  negated: boolean;
  /** False when the experiencer is a third party ("she loves X"). */
  attributedToSelf: boolean;
  /** Index of the sentence the stance was found in. */
  sentenceIndex: number;
  /** The sentence the stance was extracted from. */
  evidence: string;
}

const SENTENCE_SPLIT = /[.!?\n]+/;

const norm = (s: string): string =>
  (s ?? '').toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ').trim();

// ── Cue lexicon (derived from glossary STANCE_PREFERENCE) ────────────────────
type BaseCue = { polarity: StancePolarity; intensity: number };

/**
 * VERB cues require a governing subject immediately before them (so "feels like" and
 * "looks like" never match — only "I like", "we love", "she hates").
 */
const VERB_CUES: Record<string, BaseCue> = Object.fromEntries(
  Object.entries(stanceVerbSpecs('STANCE_PREFERENCE')).map(([verb, spec]) => [
    verb,
    { polarity: spec.kind as StancePolarity, intensity: spec.intensity },
  ])
);

/**
 * PHRASE cues carry their own object preposition and strength. The experiencer is
 * resolved by looking back for the nearest subject.
 */
type PhraseCue = BaseCue & { phrase: string; prep?: string };
const PHRASE_CUES: PhraseCue[] = stancePhraseSpecs('STANCE_PREFERENCE').map((p) => ({
  phrase: p.phrase,
  polarity: p.kind as StancePolarity,
  intensity: p.intensity,
}));

const SELF_SUBJECT = /\b(i|we|i'm|im|we're)\b/;
const OTHER_SUBJECT =
  /\b(she|he|they|her|him|them|his|their|my (?:mom|mother|dad|father|sister|brother|friend|boss|manager|coworker|co-worker|partner|wife|husband|girlfriend|boyfriend|son|daughter|kid|kids|parents))\b/;

const NEGATORS = /\b(not|no|never|n't|dont|don't|didnt|didn't|doesnt|doesn't|hardly|barely)\b/;
const REVOCATION = /\b(used to|no longer|anymore|stopped)\b/;
const IRREALIS = /\b(would|'d|wanna|want to|wish|hope to|if|might|maybe|could|should|going to|gonna|plan to)\b/;
const INTENSIFIERS = /\b(really|absolutely|totally|genuinely|honestly|so|super|truly|seriously)\b/;

// Boundaries that terminate a target noun-phrase (clause/coordination breaks).
const TARGET_BOUNDARY =
  /[,;]|\s\b(and|or|but|because|so|when|while|though|although|however|since|as|after|before|until|unless|then|is|are|was|were)\b/;

const LEADING_DET = /^(the|a|an|my|our|this|that|these|those|some|any|all|really|very|such|so)\s+/;
const PRONOUN_TARGET = /^(it|that|this|them|those|these|him|her|things?|stuff|everything|anything|nothing)$/;

function cleanTarget(raw: string): string {
  let t = norm(raw).replace(/[.,;:!?]+$/, '').trim();
  // Cut at the first clause/coordination boundary.
  const stop = t.match(TARGET_BOUNDARY);
  if (stop && stop.index !== undefined && stop.index > 0) {
    t = t.slice(0, stop.index).trim();
  }
  // Strip leading determiners/intensifiers (repeatedly: "all the really good ...").
  let prev: string;
  do {
    prev = t;
    t = t.replace(LEADING_DET, '');
  } while (t !== prev);
  // Drop trailing temporal adverbials ("these days", "lately", "right now").
  t = t.replace(/\s*\b(these days|nowadays|lately|recently|right now|today|this (?:week|month|year))\b\s*$/g, '').trim();
  // Keep the target compact (a noun phrase, not a whole clause).
  const words = t.split(' ').filter(Boolean).slice(0, 6);
  return words.join(' ').trim();
}

/** Resolve whether the experiencer governing a cue at `cueStart` is the self. */
function resolveAttribution(pre: string): boolean {
  // The closest subject before the cue wins. Search the tail of the pre-window.
  const otherIdx = lastMatchIndex(pre, OTHER_SUBJECT);
  const selfIdx = lastMatchIndex(pre, SELF_SUBJECT);
  if (otherIdx > selfIdx) return false; // a third party is the nearer subject
  if (selfIdx >= 0) return true;
  // No explicit subject (e.g. "Obsessed with this lately") — journals are first-person.
  return true;
}

function lastMatchIndex(haystack: string, re: RegExp): number {
  const g = new RegExp(re.source, 'g');
  let idx = -1;
  let m: RegExpExecArray | null;
  while ((m = g.exec(haystack)) !== null) {
    idx = m.index;
    if (m.index === g.lastIndex) g.lastIndex++;
  }
  return idx;
}

function buildStance(args: {
  base: BaseCue;
  cue: string;
  pre: string;
  rawTarget: string;
  sentence: string;
  sentenceIndex: number;
}): PreferenceStance | null {
  const { base, cue, pre, rawTarget, sentence, sentenceIndex } = args;

  // Pollution guards on the local window before the cue.
  const localPre = pre.slice(-40);
  if (REVOCATION.test(pre)) return null;
  if (IRREALIS.test(localPre)) return null;

  const target = cleanTarget(rawTarget);
  if (!target || PRONOUN_TARGET.test(target.split(' ')[0])) return null;

  const negated = NEGATORS.test(localPre);
  // Negated negative ("don't hate", "not sick of") is litotes — too weak to assert.
  if (negated && base.polarity === 'DISLIKE') return null;
  const polarity: StancePolarity = negated ? 'DISLIKE' : base.polarity;

  const attributedToSelf = resolveAttribution(pre);

  let confidence = base.intensity;
  if (INTENSIFIERS.test(localPre)) confidence = Math.min(1, confidence + 0.05);
  if (negated) confidence = Math.round(confidence * 0.7 * 100) / 100;
  confidence = Math.round(confidence * 100) / 100;

  return {
    polarity,
    target,
    targetRaw: rawTarget.trim(),
    cue,
    intensity: base.intensity,
    confidence,
    negated,
    attributedToSelf,
    sentenceIndex,
    evidence: sentence.trim(),
  };
}

/**
 * Extract preference (LIKE/DISLIKE) stances from text. Pure & deterministic.
 * Returns one stance per (cue occurrence) that survives the pollution guards.
 */
export function detectPreferenceStances(text: string): PreferenceStance[] {
  if (!text || !text.trim()) return [];
  const sentences = text.split(SENTENCE_SPLIT);
  const out: PreferenceStance[] = [];

  sentences.forEach((rawSentence, sentenceIndex) => {
    const sentence = rawSentence.trim();
    if (!sentence) return;
    const s = norm(sentence);
    // Track consumed spans so "really like" isn't also matched as "like".
    const consumed: Array<[number, number]> = [];
    const overlaps = (start: number, end: number) =>
      consumed.some(([a, b]) => start < b && end > a);

    // ── Phrase cues (longest first) ──
    for (const pc of PHRASE_CUES) {
      const re = new RegExp(escapeRe(pc.phrase) + '\\s+(?:with\\s+|of\\s+)?', 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(s)) !== null) {
        const start = m.index;
        const end = m.index + m[0].length;
        if (overlaps(start, end)) continue;
        const pre = s.slice(0, start);
        const rawTarget = s.slice(end);
        const stance = buildStance({
          base: pc, cue: pc.phrase, pre, rawTarget, sentence, sentenceIndex,
        });
        if (stance) {
          out.push(stance);
          consumed.push([start, end]);
        }
      }
    }

    // ── "into X" (only when self/intensifier-anchored, never "got into a fight") ──
    const intoRe = /\b(i'm|im|i am|we're|we are|really|been)\s+into\s+/g;
    let im: RegExpExecArray | null;
    while ((im = intoRe.exec(s)) !== null) {
      const cueEnd = im.index + im[0].length;
      const cueStart = im.index + im[0].indexOf('into');
      if (overlaps(cueStart, cueEnd)) continue;
      const stance = buildStance({
        base: { polarity: 'LIKE', intensity: 0.65 },
        cue: 'into', pre: s.slice(0, cueStart), rawTarget: s.slice(cueEnd),
        sentence, sentenceIndex,
      });
      if (stance) { out.push(stance); consumed.push([cueStart, cueEnd]); }
    }

    // ── "favorite <noun>" → LIKE the noun ──
    const favRe = /\bfavou?rite\s+/g;
    let fm: RegExpExecArray | null;
    while ((fm = favRe.exec(s)) !== null) {
      const start = fm.index;
      const end = fm.index + fm[0].length;
      if (overlaps(start, end)) continue;
      const stance = buildStance({
        base: { polarity: 'LIKE', intensity: 0.8 },
        cue: 'favorite', pre: s.slice(0, start), rawTarget: s.slice(end),
        sentence, sentenceIndex,
      });
      if (stance) { out.push(stance); consumed.push([start, end]); }
    }

    // ── Verb cues (subject-anchored; allow an interposed negator/intensifier) ──
    const verbAlt = Object.keys(VERB_CUES).join('|');
    const NEG_TOKENS = "don't|do not|dont|didn't|did not|didnt|doesn't|does not|doesnt|never|not";
    const INTENS_TOKENS = 'really|absolutely|totally|genuinely|honestly|so|super|truly|seriously';
    const verbRe = new RegExp(
      `\\b(i|we|she|he|they|i'm|im|we're)\\s+(?:(?:${NEG_TOKENS})\\s+)?(?:(?:${INTENS_TOKENS})\\s+)?(${verbAlt})\\b\\s+`,
      'g'
    );
    let vm: RegExpExecArray | null;
    while ((vm = verbRe.exec(s)) !== null) {
      const verb = vm[2];
      const base = VERB_CUES[verb];
      if (!base) continue;
      const cueStart = vm.index;
      const cueEnd = vm.index + vm[0].length;
      if (overlaps(cueStart, cueEnd)) continue;
      const stance = buildStance({
        base, cue: `${vm[1]} ${verb}`.trim(), pre: s.slice(0, cueEnd),
        rawTarget: s.slice(cueEnd), sentence, sentenceIndex,
      });
      if (stance) { out.push(stance); consumed.push([cueStart, cueEnd]); }
    }
  });

  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
