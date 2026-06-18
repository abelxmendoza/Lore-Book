/**
 * Affect Stance Detector — deterministic felt-emotion extraction.
 *
 * Part of the Stance & Affect lexical layer (see docs/stance-affect-lexical-plan.md).
 * Pure functions only — feeds `event_emotions` via the event extraction bridge.
 * Emotion surfaces live in glossary.ts (STANCE_AFFECT); this module owns feel-cue
 * regex patterns and pollution guards.
 */

import { affectEmotionLexicon } from './glossary';

export interface AffectStance {
  /** Canonical emotion label stored on event_emotions.emotion */
  emotion: string;
  /** Surface form matched in text ("anxious", "drained"). */
  surface: string;
  cue: string;
  intensity: number;
  confidence: number;
  negated: boolean;
  attributedToSelf: boolean;
  sentenceIndex: number;
  evidence: string;
}

export interface LexicalEmotionDraft {
  emotion: string;
  intensity: number;
  confidence: number;
  cue: string;
  source: 'lexical';
}

export interface MergedEmotion {
  emotion: string;
  intensity: number;
  timestamp_offset?: number;
  metadata: Record<string, unknown>;
}

const SENTENCE_SPLIT = /[.!?\n]+/;

const norm = (s: string): string =>
  (s ?? '').toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ').trim();

/** Canonical emotion + default intensity for a surface form (from glossary). */
const EMOTION_LEXICON = affectEmotionLexicon();

const SELF_SUBJECT = /\b(i|we|i'm|im|we're|i was|we were|i've|i have|i am|we are)\b/;
const OTHER_SUBJECT =
  /\b(she|he|they|her|him|them|his|their|my (?:mom|mother|dad|father|sister|brother|friend|boss|manager|partner|wife|husband|girlfriend|boyfriend))\b/;

const NEGATORS = /\b(not|no|never|n't|dont|don't|didnt|didn't|doesnt|doesn't|hardly|barely)\b/;
const REVOCATION = /\b(used to|no longer|anymore|stopped)\b/;
const IRREALIS = /\b(would|'d|wanna|want to|wish|hope to|if|might|maybe|could|should|going to|gonna|plan to)\b/;
const INTENSIFIERS = /\b(really|absolutely|totally|so|super|very|extremely|incredibly|deeply|genuinely)\b/;

/** Cues that introduce a felt emotion (not epistemic "feel that" or "feel like [verb]"). */
const AFFECT_CUE_RES: Array<{ re: RegExp; cue: string }> = [
  { re: /\b(i|we)(?:'m|'re)\s+(?:so|really|very|extremely|super|totally|deeply|incredibly|genuinely\s+)?(?:feeling\s+)?/g, cue: "i'm" },
  { re: /\b(i|we)\s+(?:was|were|am|are|have been|'ve been)\s+(?:so|really|very|extremely|super|totally|deeply|incredibly|genuinely\s+)?(?:feeling\s+)?/g, cue: 'i was' },
  { re: /\b(i|we)\s+feel(?:s|ing|t)?\s+(?:so|really|very|extremely|super|totally|deeply|incredibly|genuinely\s+)?/g, cue: 'i feel' },
  { re: /\b(i|we)\s+felt\s+(?:so|really|very|extremely|super|totally|deeply|incredibly|genuinely\s+)?/g, cue: 'i felt' },
  { re: /\b(?:she|he|they)\s+felt\s+(?:so|really|very|extremely|super|totally|deeply|incredibly|genuinely\s+)?/g, cue: 'they felt' },
  { re: /\bfeeling\s+(?:so|really|very|extremely|super|totally|deeply|incredibly|genuinely\s+)?/g, cue: 'feeling' },
];

const FEEL_LIKE_VERB = /\bfeel(?:s|ing|t)?\s+like\s+(?:going|doing|eating|leaving|getting|taking|having|being|getting|making|starting|stopping|running|walking|talking|calling|texting|staying|working|sleeping|heading|driving|flying|traveling|travelling)\b/;
const FEEL_THAT = /\bfeel(?:s|ing|t)?\s+that\b/;

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

function parseEmotionSurface(raw: string): { surface: string; spec: { canonical: string; intensity: number } } | null {
  let t = norm(raw).replace(/[.,;:!?]+$/, '').trim();
  t = t.replace(/^(?:a\s+)?(?:little|bit|kind\s+of|sort\s+of)\s+/, '');
  const stop = t.match(/\s\b(about|when|because|that|since|after|before|while|as|but|and|or|at|with|from|to|for|today|now|lately|again)\b/);
  if (stop && stop.index !== undefined && stop.index > 0) {
    t = t.slice(0, stop.index).trim();
  }
  const first = t.split(' ')[0];
  const spec = EMOTION_LEXICON[first];
  if (!spec) return null;
  return { surface: first, spec };
}

function buildAffect(args: {
  spec: { canonical: string; intensity: number };
  surface: string;
  cue: string;
  pre: string;
  cueSpan?: string;
  sentence: string;
  sentenceIndex: number;
}): AffectStance | null {
  const { spec, surface, cue, pre, cueSpan = '', sentence, sentenceIndex } = args;
  const localPre = pre.slice(-45);
  const attribWindow = `${pre}${cueSpan}`;
  if (REVOCATION.test(pre)) return null;
  if (IRREALIS.test(localPre)) return null;
  if (FEEL_THAT.test(`${pre}${cue}`)) return null;
  if (FEEL_LIKE_VERB.test(`${pre}${cue} ${surface}`)) return null;

  const negated = NEGATORS.test(localPre);
  if (negated) return null;

  let intensity = spec.intensity;
  if (INTENSIFIERS.test(localPre) || INTENSIFIERS.test(cue)) {
    intensity = Math.min(1, intensity + 0.1);
  }
  intensity = Math.round(intensity * 100) / 100;

  let confidence = Math.min(1, spec.intensity + 0.05);
  confidence = Math.round(confidence * 100) / 100;

  return {
    emotion: spec.canonical,
    surface,
    cue,
    intensity,
    confidence,
    negated,
    attributedToSelf: resolveAttribution(attribWindow),
    sentenceIndex,
    evidence: sentence.trim(),
  };
}

/**
 * Extract felt-emotion stances from text. Pure & deterministic.
 */
export function detectAffectStances(text: string): AffectStance[] {
  if (!text || !text.trim()) return [];
  const out: AffectStance[] = [];
  const sentences = text.split(SENTENCE_SPLIT);

  sentences.forEach((rawSentence, sentenceIndex) => {
    const sentence = rawSentence.trim();
    if (!sentence) return;
    const s = norm(sentence);
    const consumed: Array<[number, number]> = [];
    const overlaps = (start: number, end: number) =>
      consumed.some(([a, b]) => start < b && end > a);

    for (const { re, cue } of AFFECT_CUE_RES) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s)) !== null) {
        const start = m.index;
        const end = m.index + m[0].length;
        if (overlaps(start, end)) continue;
        const pre = s.slice(0, start);
        const parsed = parseEmotionSurface(s.slice(end));
        if (!parsed) continue;
        const stance = buildAffect({
          spec: parsed.spec,
          surface: parsed.surface,
          cue,
          pre,
          cueSpan: m[0],
          sentence,
          sentenceIndex,
        });
        if (stance) {
          out.push(stance);
          consumed.push([start, end]);
        }
      }
    }
  });

  return out;
}

/** True when the text carries at least one self-attributed affect cue. */
export function hasAffectCue(text: string): boolean {
  return detectAffectStances(text).some((s) => s.attributedToSelf);
}

/** Map self-attributed stances → emotion drafts for event_emotions. */
export function affectEmotionDrafts(text: string): LexicalEmotionDraft[] {
  const seen = new Set<string>();
  const out: LexicalEmotionDraft[] = [];
  for (const stance of detectAffectStances(text)) {
    if (!stance.attributedToSelf) continue;
    if (seen.has(stance.emotion)) continue;
    seen.add(stance.emotion);
    out.push({
      emotion: stance.emotion,
      intensity: stance.intensity,
      confidence: stance.confidence,
      cue: stance.cue,
      source: 'lexical',
    });
  }
  return out;
}

function normEmotion(e: string): string {
  return norm(e).replace(/\s+/g, ' ').trim();
}

/** Merge lexical + LLM emotions. Lexical fills gaps; agreement boosts intensity. */
export function mergeAffectEmotions(
  lexical: LexicalEmotionDraft[],
  llm: Array<{ emotion: string; intensity: number; timestamp_offset?: number }>
): MergedEmotion[] {
  const out: MergedEmotion[] = [];
  const usedLlm = new Set<number>();

  for (const lx of lexical) {
    let matchedIdx = -1;
    for (let i = 0; i < llm.length; i++) {
      if (usedLlm.has(i)) continue;
      if (normEmotion(llm[i].emotion) === normEmotion(lx.emotion)) {
        matchedIdx = i;
        break;
      }
      // Allow synonym overlap via lexicon canonical mapping.
      const llmSurface = normEmotion(llm[i].emotion);
      const lxCanonical = lx.emotion;
      const mapped = EMOTION_LEXICON[llmSurface]?.canonical;
      if (mapped === lxCanonical) {
        matchedIdx = i;
        break;
      }
    }
    if (matchedIdx >= 0) {
      usedLlm.add(matchedIdx);
      const ll = llm[matchedIdx];
      out.push({
        emotion: lx.emotion,
        intensity: Math.min(1, Number(Math.max(lx.intensity, ll.intensity, lx.intensity + 0.1).toFixed(2))),
        timestamp_offset: ll.timestamp_offset,
        metadata: { source: 'lexical+llm', cue: lx.cue, lexicalConfirmed: true, confidence: Math.min(1, lx.confidence + 0.15) },
      });
    } else {
      out.push({
        emotion: lx.emotion,
        intensity: lx.intensity,
        metadata: { source: 'lexical', cue: lx.cue, confidence: lx.confidence },
      });
    }
  }

  for (let i = 0; i < llm.length; i++) {
    if (usedLlm.has(i)) continue;
    const ll = llm[i];
    out.push({
      emotion: ll.emotion,
      intensity: ll.intensity,
      timestamp_offset: ll.timestamp_offset,
      metadata: { source: 'llm', confidence: 0.55 },
    });
  }

  return out;
}
