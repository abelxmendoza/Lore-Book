/**
 * Temporal Lexicon — glossary-driven scan + anchor resolution.
 *
 * Surface phrases live in glossary.ts (TIME / TEMPORAL_ANCHOR). Resolution math
 * delegates to temporalAnchorResolver. Pure functions only.
 */
import { temporalScanPhrases, temporalSequencePhrases } from './glossary';
import {
  resolveTemporalAnchor,
  type TemporalWindow,
} from '../../utils/temporalAnchorResolver';
import { resolveChronoInText, resolveTemporalWindow } from '../../utils/temporalResolver';
import {
  resolveLifeStageAnchor,
  hasLifeStageCue,
  type TemporalAnchorProfile,
} from '../../utils/lifeStageResolver';

export interface TemporalMention {
  phrase: string;
  kind: string;
  confidence: number;
  window: TemporalWindow | null;
  sentenceIndex: number;
}

const norm = (s: string): string =>
  (s ?? '').toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ').trim();

const SENTENCE_SPLIT = /[.!?\n]+/;

function phraseInText(padded: string, phrase: string): boolean {
  const p = phrase.toLowerCase();
  return padded.includes(` ${p} `) || padded.startsWith(`${p} `) || padded.endsWith(` ${p}`);
}

/**
 * Scan text for glossary temporal phrases and resolve each to a calendar window.
 *
 * @param profile  Optional per-user temporal anchor (birth year). Enables
 *                 life-stage / age resolution ("when I was 19", "in high school").
 *                 Era anchors ("during the pandemic") resolve without it.
 */
export function scanTemporalMentions(
  text: string,
  now: Date = new Date(),
  profile: TemporalAnchorProfile = {},
): TemporalMention[] {
  if (!text?.trim()) return [];

  const phrases = temporalScanPhrases();
  const sentences = text.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
  const mentions: TemporalMention[] = [];
  const seen = new Set<string>();

  sentences.forEach((sentence, sentenceIndex) => {
    const padded = ` ${norm(sentence)} `;
    for (const spec of phrases) {
      if (!phraseInText(padded, spec.phrase)) continue;
      const key = `${sentenceIndex}:${spec.phrase}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const window =
        resolveTemporalAnchor(spec.phrase, now) ??
        resolveTemporalAnchor(sentence, now) ??
        resolveChronoInText(sentence, now);
      mentions.push({
        phrase: spec.phrase,
        kind: spec.kind,
        confidence: window?.confidence ?? spec.confidence,
        window,
        sentenceIndex,
      });
    }

    // Life-stage / age / era pass — these phrases are NOT in the glossary, so they
    // get their own resolution. Only attempted when a cue is present (cheap guard).
    if (hasLifeStageCue(sentence)) {
      const window = resolveLifeStageAnchor(sentence, profile, now);
      if (window) {
        const key = `${sentenceIndex}:lifestage:${window.label}`;
        if (!seen.has(key)) {
          seen.add(key);
          mentions.push({
            phrase: window.label,
            kind: 'LIFE_STAGE',
            confidence: window.confidence,
            window,
            sentenceIndex,
          });
        }
      }
    }
  });

  return mentions.sort((a, b) => b.confidence - a.confidence);
}

/** Best-resolved temporal window for the full text (highest-confidence mention). */
export function resolveTextTemporalWindow(text: string, now: Date = new Date()): TemporalWindow | null {
  return resolveTemporalWindow(text, now);
}

// Vague historical-distance markers: signal the statement is about the PAST but
// give no resolvable date ("used to", "back then", "growing up"). Deliberately
// tight — plain past tense ("had coffee") is NOT historical; it's usually recent.
const HISTORICAL_DISTANCE_RE = new RegExp(
  [
    '\\bused to\\b',
    '\\bback then\\b',
    '\\bback when\\b',
    '\\bback in the day\\b',
    '\\bin those days\\b',
    '\\bat the time\\b',
    '\\ba while (?:ago|back)\\b',
    '\\b(?:many |several |\\d+ )?years ago\\b',
    '\\blong ago\\b',
    '\\bway back\\b',
    '\\bgrowing up\\b',
    '\\bwhen i was (?:younger|a kid|a child|little|a teenager|in)\\b',
    '\\bin the past\\b',
    '\\bin my (?:childhood|youth|teens|twenties|thirties|forties|fifties)\\b',
    '\\bused to be\\b',
  ].join('|'),
  'i',
);

/**
 * True when text references the past with NO resolvable date — e.g. "I used to
 * live there", "back then we were close". Used to avoid stamping ingest-time as
 * the occurrence date of a clearly-historical statement (the created_at-as-
 * occurrence conflation). Recent/present statements return false.
 */
export function hasHistoricalDistanceCue(text: string): boolean {
  if (!text?.trim()) return false;
  return HISTORICAL_DISTANCE_RE.test(norm(text));
}

/** Narrative sequence markers present in text ("then", "before that", …). */
export function detectTemporalSequenceMarkers(text: string): string[] {
  const padded = ` ${norm(text)} `;
  const found: string[] = [];
  for (const phrase of temporalSequencePhrases()) {
    if (phraseInText(padded, phrase)) found.push(phrase);
  }
  return found;
}

/** True when glossary temporal cues appear in text. */
export function hasTemporalCue(text: string): boolean {
  if (!text?.trim()) return false;
  const padded = ` ${norm(text)} `;
  return temporalScanPhrases().some((s) => phraseInText(padded, s.phrase))
    || temporalSequencePhrases().some((p) => phraseInText(padded, p));
}
