/**
 * Epistemic Stance Detector — deterministic belief / doubt / question / realization.
 *
 * Part of the Stance & Affect lexical layer (see docs/stance-affect-lexical-plan.md).
 * Pure functions only — feeds `event_cognitions` via the event extraction bridge.
 * Cue vocabulary lives in glossary.ts (STANCE_EPISTEMIC); this module owns matching
 * and pollution guards.
 */

import { stancePhraseSpecs, stanceVerbSpecs } from './glossary';

export type EpistemicKind = 'BELIEVE' | 'DISBELIEVE' | 'QUESTION' | 'REALIZE';

export type CognitionType = 'belief' | 'insecurity_triggered' | 'realization' | 'question' | 'doubt';

export interface EpistemicStance {
  kind: EpistemicKind;
  /** The proposition the stance is about. */
  proposition: string;
  propositionRaw: string;
  cue: string;
  intensity: number;
  confidence: number;
  negated: boolean;
  attributedToSelf: boolean;
  sentenceIndex: number;
  evidence: string;
}

export interface LexicalCognitionDraft {
  cognition_type: CognitionType;
  content: string;
  confidence: number;
  cue: string;
  source: 'lexical';
}

const SENTENCE_SPLIT = /[.!?\n]+/;

const norm = (s: string): string =>
  (s ?? '').toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ').trim();

type BaseCue = { kind: EpistemicKind; intensity: number };

type PhraseCue = BaseCue & { phrase: string };

const PHRASE_CUES: PhraseCue[] = stancePhraseSpecs('STANCE_EPISTEMIC').map((p) => ({
  phrase: p.phrase,
  kind: p.kind as EpistemicKind,
  intensity: p.intensity,
}));

const VERB_CUES: Record<string, BaseCue> = Object.fromEntries(
  Object.entries(stanceVerbSpecs('STANCE_EPISTEMIC')).map(([verb, spec]) => [
    verb,
    { kind: spec.kind as EpistemicKind, intensity: spec.intensity },
  ])
);

const SELF_SUBJECT = /\b(i|we|i'm|im|we're)\b/;
const OTHER_SUBJECT =
  /\b(she|he|they|her|him|them|his|their|my (?:mom|mother|dad|father|sister|brother|friend|boss|manager|coworker|co-worker|partner|wife|husband|girlfriend|boyfriend|son|daughter|kid|kids|parents))\b/;

const NEGATORS = /\b(not|no|never|n't|dont|don't|didnt|didn't|doesnt|doesn't|hardly|barely)\b/;
const REVOCATION = /\b(used to|no longer|anymore|stopped)\b/;
const IRREALIS = /\b(would|'d|wanna|want to|wish|hope to|if|might|maybe|could|should|going to|gonna|plan to)\b/;
const INTENSIFIERS = /\b(really|absolutely|totally|genuinely|honestly|so|super|truly|seriously)\b/;

const PROPOSITION_BOUNDARY =
  /[,;]|\s\b(and then|but then|because|so when|when|while|though|although|however|since|unless)\b/;

const LEADING_THAT = /^that\s+/;
const LEADING_DET = /^(the|a|an|my|our|this|that|these|those|some|any|all|really|very|such|so)\s+/;
const PRONOUN_START = /^(it|that|this|them|those|these|him|her|so|yes|no|maybe|ok|okay)$/;

function cleanProposition(raw: string): string {
  let t = norm(raw).replace(/[.,;:!?]+$/, '').trim();
  t = t.replace(LEADING_THAT, '');
  const stop = t.match(PROPOSITION_BOUNDARY);
  if (stop && stop.index !== undefined && stop.index > 0) {
    t = t.slice(0, stop.index).trim();
  }
  let prev: string;
  do {
    prev = t;
    t = t.replace(LEADING_DET, '');
  } while (t !== prev);
  const words = t.split(' ').filter(Boolean).slice(0, 12);
  return words.join(' ').trim();
}

function resolveAttribution(pre: string): boolean {
  const otherIdx = lastMatchIndex(pre, OTHER_SUBJECT);
  const selfIdx = lastMatchIndex(pre, SELF_SUBJECT);
  if (otherIdx > selfIdx) return false;
  if (selfIdx >= 0) return true;
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

function kindToCognition(kind: EpistemicKind): CognitionType {
  switch (kind) {
    case 'BELIEVE': return 'belief';
    case 'DISBELIEVE': return 'doubt';
    case 'QUESTION': return 'question';
    case 'REALIZE': return 'realization';
  }
}

function buildStance(args: {
  base: BaseCue;
  cue: string;
  pre: string;
  rawProp: string;
  sentence: string;
  sentenceIndex: number;
}): EpistemicStance | null {
  const { base, cue, pre, rawProp, sentence, sentenceIndex } = args;
  const localPre = pre.slice(-45);
  if (REVOCATION.test(pre)) return null;
  if (IRREALIS.test(localPre)) return null;

  const proposition = cleanProposition(rawProp);
  if (!proposition || proposition.split(' ').length < 2) return null;
  if (PRONOUN_START.test(proposition.split(' ')[0])) return null;

  const negated = NEGATORS.test(localPre);
  if (negated && base.kind === 'DISBELIEVE') return null;

  let kind: EpistemicKind = base.kind;
  if (negated && base.kind === 'BELIEVE') kind = 'DISBELIEVE';

  let confidence = base.intensity;
  if (INTENSIFIERS.test(localPre)) confidence = Math.min(1, confidence + 0.05);
  if (negated) confidence = Math.round(confidence * 0.7 * 100) / 100;
  confidence = Math.round(confidence * 100) / 100;

  return {
    kind,
    proposition,
    propositionRaw: rawProp.trim(),
    cue,
    intensity: base.intensity,
    confidence,
    negated,
    attributedToSelf: resolveAttribution(pre),
    sentenceIndex,
    evidence: sentence.trim(),
  };
}

/**
 * Extract epistemic stances from text. Pure & deterministic.
 */
export function detectEpistemicStances(text: string): EpistemicStance[] {
  if (!text || !text.trim()) return [];
  const sentences = text.split(SENTENCE_SPLIT);
  const out: EpistemicStance[] = [];

  sentences.forEach((rawSentence, sentenceIndex) => {
    const sentence = rawSentence.trim();
    if (!sentence) return;
    const s = norm(sentence);
    const consumed: Array<[number, number]> = [];
    const overlaps = (start: number, end: number) =>
      consumed.some(([a, b]) => start < b && end > a);

    for (const pc of PHRASE_CUES) {
      const re = new RegExp(`\\b${escapeRe(pc.phrase)}\\b\\s*`, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(s)) !== null) {
        const start = m.index;
        const end = m.index + m[0].length;
        if (overlaps(start, end)) continue;
        const stance = buildStance({
          base: pc, cue: pc.phrase, pre: s.slice(0, start),
          rawProp: s.slice(end), sentence, sentenceIndex,
        });
        if (stance) { out.push(stance); consumed.push([start, end]); }
      }
    }

    const verbAlt = Object.keys(VERB_CUES).join('|');
    const NEG_TOKENS = "don't|do not|dont|didn't|did not|didnt|doesn't|does not|doesnt|never|not";
    const INTENS_TOKENS = 'really|absolutely|totally|genuinely|honestly|so|super|truly|seriously';
    const verbRe = new RegExp(
      `\\b(i|we|she|he|they|i'm|im|we're)\\s+(?:(?:${NEG_TOKENS})\\s+)?(?:(?:${INTENS_TOKENS})\\s+)?(${verbAlt})\\b(?:\\s+that)?\\s+`,
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
        rawProp: s.slice(cueEnd), sentence, sentenceIndex,
      });
      if (stance) { out.push(stance); consumed.push([cueStart, cueEnd]); }
    }
  });

  return out;
}

/** True when the text carries at least one self-attributed epistemic cue. */
export function hasEpistemicCue(text: string): boolean {
  return detectEpistemicStances(text).some((s) => s.attributedToSelf);
}

/** Map self-attributed stances → cognition drafts for event_cognitions. */
export function epistemicCognitionDrafts(text: string): LexicalCognitionDraft[] {
  const seen = new Set<string>();
  const out: LexicalCognitionDraft[] = [];
  for (const stance of detectEpistemicStances(text)) {
    if (!stance.attributedToSelf) continue;
    const cognition_type = kindToCognition(stance.kind);
    const content = stance.proposition;
    const key = `${cognition_type}:${content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      cognition_type,
      content,
      confidence: stance.confidence,
      cue: stance.cue,
      source: 'lexical',
    });
  }
  return out;
}

export interface MergedCognition {
  cognition_type: CognitionType;
  content: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

function normContent(c: string): string {
  return norm(c).replace(/\s+/g, ' ').trim();
}

function contentsOverlap(a: string, b: string): boolean {
  const na = normContent(a);
  const nb = normContent(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(' ').filter((w) => w.length > 2));
  const tb = new Set(nb.split(' ').filter((w) => w.length > 2));
  if (ta.size === 0 || tb.size === 0) return false;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / ta.size >= 0.6;
}

/**
 * Merge lexical + LLM cognitions. Lexical fills gaps; agreement boosts confidence.
 * Pure — fully unit-testable.
 */
export function mergeEpistemicCognitions(
  lexical: LexicalCognitionDraft[],
  llm: Array<{ cognition_type: CognitionType; content: string }>
): MergedCognition[] {
  const out: MergedCognition[] = [];
  const usedLlm = new Set<number>();

  for (const lx of lexical) {
    let matchedIdx = -1;
    for (let i = 0; i < llm.length; i++) {
      if (usedLlm.has(i)) continue;
      const ll = llm[i];
      if (ll.cognition_type !== lx.cognition_type) continue;
      if (contentsOverlap(lx.content, ll.content)) {
        matchedIdx = i;
        break;
      }
    }
    if (matchedIdx >= 0) {
      usedLlm.add(matchedIdx);
      const ll = llm[matchedIdx];
      out.push({
        cognition_type: lx.cognition_type,
        content: ll.content.length >= lx.content.length ? ll.content : lx.content,
        confidence: Math.min(1, Number((lx.confidence + 0.15).toFixed(2))),
        metadata: { source: 'lexical+llm', cue: lx.cue, lexicalConfirmed: true },
      });
    } else {
      out.push({
        cognition_type: lx.cognition_type,
        content: lx.content,
        confidence: lx.confidence,
        metadata: { source: 'lexical', cue: lx.cue },
      });
    }
  }

  for (let i = 0; i < llm.length; i++) {
    if (usedLlm.has(i)) continue;
    const ll = llm[i];
    out.push({
      cognition_type: ll.cognition_type,
      content: ll.content,
      confidence: 0.55,
      metadata: { source: 'llm' },
    });
  }

  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
