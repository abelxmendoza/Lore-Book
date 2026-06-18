/**
 * Discourse & Narrative Stage Detector — tangents, subject changes, story phases.
 *
 * Cue vocabulary lives in glossary.ts (NARRATIVE_DISCOURSE, NARRATIVE_STAGE).
 * Pure functions only — gates LLM tangent detection in live chat.
 */
import { discoursePhraseSpecs, narrativeStagePhraseSpecs } from './glossary';

export type DiscourseMove =
  | 'TANGENT'
  | 'SUBJECT_CHANGE'
  | 'RETURN'
  | 'STORY_OPEN'
  | 'STORY_CLOSE'
  | 'DIGRESSION';

export type NarrativeStage =
  | 'SETUP'
  | 'INCITING'
  | 'ESCALATION'
  | 'CLIMAX'
  | 'FALLING'
  | 'REFLECTION'
  | 'CODA';

export interface DiscourseSignal {
  move: DiscourseMove;
  cue: string;
  confidence: number;
  sentenceIndex: number;
  evidence: string;
}

export interface NarrativeStageSignal {
  stage: NarrativeStage;
  cue: string;
  confidence: number;
  sentenceIndex: number;
  evidence: string;
}

const SENTENCE_SPLIT = /[.!?\n]+/;

const norm = (s: string): string =>
  (s ?? '').toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ').trim();

function scanPhraseSpecs<T extends string>(
  text: string,
  specs: Array<{ phrase: string; move: string; confidence: number }>,
  validMoves: ReadonlySet<string>,
): Array<{ move: T; cue: string; confidence: number; sentenceIndex: number; evidence: string }> {
  const out: Array<{ move: T; cue: string; confidence: number; sentenceIndex: number; evidence: string }> = [];
  const sentences = text.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();

  sentences.forEach((sentence, sentenceIndex) => {
    const padded = ` ${norm(sentence)} `;
    for (const spec of specs) {
      if (!validMoves.has(spec.move)) continue;
      const p = spec.phrase.toLowerCase();
      if (!padded.includes(` ${p} `) && !norm(sentence).startsWith(p)) continue;
      const key = `${sentenceIndex}:${spec.move}:${p}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        move: spec.move as T,
        cue: spec.phrase,
        confidence: spec.confidence,
        sentenceIndex,
        evidence: sentence,
      });
    }
  });

  return out.sort((a, b) => b.confidence - a.confidence);
}

const DISCOURSE_MOVES = new Set<string>([
  'TANGENT', 'SUBJECT_CHANGE', 'RETURN', 'STORY_OPEN', 'STORY_CLOSE', 'DIGRESSION',
]);

const STAGE_MOVES = new Set<string>([
  'SETUP', 'INCITING', 'ESCALATION', 'CLIMAX', 'FALLING', 'REFLECTION', 'CODA',
]);

/** Detect conversation discourse moves (tangents, subject changes, …). */
export function detectDiscourseMoves(text: string): DiscourseSignal[] {
  if (!text?.trim()) return [];
  return scanPhraseSpecs<DiscourseMove>(text, discoursePhraseSpecs(), DISCOURSE_MOVES).map((s) => ({
    move: s.move,
    cue: s.cue,
    confidence: s.confidence,
    sentenceIndex: s.sentenceIndex,
    evidence: s.evidence,
  }));
}

/** Detect autobiographical story-telling phase cues. */
export function detectNarrativeStages(text: string): NarrativeStageSignal[] {
  if (!text?.trim()) return [];
  return scanPhraseSpecs<NarrativeStage>(text, narrativeStagePhraseSpecs(), STAGE_MOVES).map((s) => ({
    stage: s.move,
    cue: s.cue,
    confidence: s.confidence,
    sentenceIndex: s.sentenceIndex,
    evidence: s.evidence,
  }));
}

/** True when a tangent/subject-change cue appears (lexical fast path for chat). */
export function hasTangentCue(text: string): boolean {
  return detectDiscourseMoves(text).some((s) =>
    s.move === 'TANGENT' || s.move === 'SUBJECT_CHANGE' || s.move === 'DIGRESSION'
  );
}

/** True when the user opens or closes a story block. */
export function hasStoryFrameCue(text: string): boolean {
  return detectDiscourseMoves(text).some((s) =>
    s.move === 'STORY_OPEN' || s.move === 'STORY_CLOSE'
  );
}
