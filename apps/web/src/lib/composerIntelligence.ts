/**
 * Composer Intelligence Architecture
 *
 * Composer Draft Authority Rule:
 * Text currently being typed is provisional input, not canonical autobiographical
 * evidence. Keystrokes may trigger cheap, cancellable, delayed UI assistance, but
 * expensive history-aware interpretation, canonical resolution, ingestion, and
 * authoritative semantic processing must not sit on the keystroke path.
 * Send-time processing remains authoritative.
 *
 * Phases:
 *   raw draft            → local textarea state (every key)
 *   lightweight preview  → delayed local chips (certified index + draft detect)
 *   authoritative send   → blur/send remote preview; server ingestion is canon
 *
 * A raw composer draft is not lore yet. Entity chips are speculative.
 * Lexical interpretation is provisional. Reconstructing the user's knowledge
 * graph must not happen because another character appeared in the textarea.
 */

export type ComposerIntelligencePhase = 'keystroke' | 'lightweight' | 'authoritative';

/** Delayed local chip scan — cancellable, no network, no canon rebuild. */
export const COMPOSER_LIGHTWEIGHT_PREVIEW_MS = 220;

/** Debounced draft persistence. Flushed on blur, unmount, and send. */
export const COMPOSER_STORAGE_DEBOUNCE_MS = 400;

export type ComposerIntelligenceMetrics = {
  keystrokes: number;
  entityScans: number;
  storageWrites: number;
  reduxOccupancySyncs: number;
  layoutGrows: number;
  remoteLexicalPreviews: number;
  canonReconstructions: number;
  transcriptRenders: number;
};

const EMPTY_METRICS: ComposerIntelligenceMetrics = {
  keystrokes: 0,
  entityScans: 0,
  storageWrites: 0,
  reduxOccupancySyncs: 0,
  layoutGrows: 0,
  remoteLexicalPreviews: 0,
  canonReconstructions: 0,
  transcriptRenders: 0,
};

let metrics: ComposerIntelligenceMetrics = { ...EMPTY_METRICS };
let latestRawDraft = '';

export const composerIntelligenceMetrics = {
  snapshot(): ComposerIntelligenceMetrics {
    return { ...metrics };
  },
  reset(): void {
    metrics = { ...EMPTY_METRICS };
  },
  noteKeystroke(): void {
    metrics.keystrokes += 1;
  },
  noteEntityScan(): void {
    metrics.entityScans += 1;
  },
  noteStorageWrite(): void {
    metrics.storageWrites += 1;
  },
  noteReduxOccupancySync(): void {
    metrics.reduxOccupancySyncs += 1;
  },
  noteLayoutGrow(): void {
    metrics.layoutGrows += 1;
  },
  noteRemoteLexicalPreview(): void {
    metrics.remoteLexicalPreviews += 1;
  },
  noteCanonReconstruction(): void {
    metrics.canonReconstructions += 1;
  },
  noteTranscriptRender(): void {
    metrics.transcriptRenders += 1;
  },
};

/** Latest typed draft without putting the full string on the Redux render path. */
export function noteRawComposerDraft(text: string): void {
  latestRawDraft = text;
}

export function getLatestRawComposerDraft(): string {
  return latestRawDraft;
}

export function composerDraftIsAuthoritative(phase: ComposerIntelligencePhase): boolean {
  return phase === 'authoritative';
}

export function composerPhaseAllowsRemoteCanon(phase: ComposerIntelligencePhase): boolean {
  return phase === 'authoritative';
}

export function composerPhaseAllowsEntityScan(phase: ComposerIntelligencePhase): boolean {
  return phase === 'lightweight' || phase === 'authoritative';
}
