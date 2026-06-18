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
 */
export function scanTemporalMentions(text: string, now: Date = new Date()): TemporalMention[] {
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
  });

  return mentions.sort((a, b) => b.confidence - a.confidence);
}

/** Best-resolved temporal window for the full text (highest-confidence mention). */
export function resolveTextTemporalWindow(text: string, now: Date = new Date()): TemporalWindow | null {
  return resolveTemporalWindow(text, now);
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
