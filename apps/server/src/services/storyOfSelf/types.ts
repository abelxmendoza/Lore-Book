/**
 * Legacy-facing Story of Self result shape, kept for the route, mode handler,
 * and engine-registry consumers. Populated by the structured pipeline in
 * ./storyOfSelfEngine — see ./narrativeRecords.ts for the internal types.
 */
import type {
  NarrativeSynthesisResult,
  StoryOfSelfTrace,
} from './narrativeRecords';

export interface SelfTheme {
  id: string;
  /** Specific, evidence-backed theme label (no longer a fixed keyword enum). */
  theme: string;
  /** Canonical event ids supporting the theme (never raw evidence text). */
  evidence: string[];
  strength: number; // 0–1
}

export interface TurningPoint {
  id: string;
  timestamp: string;
  /** Synthesized one-line description — never raw entry text. */
  description: string;
  category:
    | 'trauma'
    | 'victory'
    | 'loss'
    | 'awakening'
    | 'shift'
    | 'fall'
    | 'rise'
    | 'betrayal'
    | 'breakthrough'
    | 'transition'
    | 'conflict'
    | 'ordinary_event';
  emotionalImpact: number; // 0–1
}

export interface NarrativeMode {
  mode:
    | 'warrior'
    | 'loner'
    | 'builder'
    | 'hero'
    | 'antihero'
    | 'outsider'
    | 'sage'
    | 'protector'
    | 'rebel';
  confidence: number; // 0–1
  /** True when the classification lacks enough evidence to state firmly. */
  tentative?: boolean;
}

export interface StoryArcSegment {
  title: string;
  era: string;
  content: string;
  themes: string[];
}

export interface StoryCoherence {
  coherenceScore: number;
  contradictions: string[];
  missingPieces: string[];
}

export interface StoryOfSelf {
  id: string;
  themes: SelfTheme[];
  turningPoints: TurningPoint[];
  mode: NarrativeMode;
  arcs: StoryArcSegment[];
  coherence: StoryCoherence;
  /** Deprecated: always empty. Raw entry excerpts must never be surfaced. */
  voicePrint: string;
  summary: string;
  /** Structured synthesis backing the summary. */
  synthesis: NarrativeSynthesisResult;
  /** Development diagnostics; not for user-facing rendering. */
  trace: StoryOfSelfTrace;
}
