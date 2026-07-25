/**
 * Progressive LoreBook form tiers — vignette → chapter → short book → book → epic.
 * Surface meters unlock smaller forms earlier; compile maps form → depth/chapter caps.
 */

import type { ProjectDetailProfile } from '../components/projects/projectModalTypes';
import {
  TIMELINE_LOREBOOK_MIN_DAYS,
  TIMELINE_LOREBOOK_MIN_EVENTS,
  TIMELINE_LOREBOOK_MIN_WORDS,
} from './timelineSubjectLorebook';

export type LorebookForm = 'vignette' | 'chapter' | 'short_book' | 'book' | 'epic';

export type LorebookTierDefinition = {
  form: LorebookForm;
  /** Display name in menus */
  label: string;
  /** Compact meter label */
  shortLabel: string;
  description: string;
  /** Default biography depth for this form */
  defaultDepth: 'summary' | 'detailed' | 'epic';
  /** Hard cap on generated chapters (null = uncapped) */
  maxChapters: number | null;
};

export const LOREBOOK_TIER_ORDER: LorebookForm[] = [
  'vignette',
  'chapter',
  'short_book',
  'book',
  'epic',
];

export const LOREBOOK_TIERS: Record<LorebookForm, LorebookTierDefinition> = {
  vignette: {
    form: 'vignette',
    label: 'Vignette',
    shortLabel: 'Vignette',
    description: 'One short piece (~300–600 words)',
    defaultDepth: 'summary',
    maxChapters: 1,
  },
  chapter: {
    form: 'chapter',
    label: 'Chapter',
    shortLabel: 'Chapter',
    description: 'A single named chapter',
    defaultDepth: 'summary',
    maxChapters: 1,
  },
  short_book: {
    form: 'short_book',
    label: 'Short LoreBook',
    shortLabel: 'Short',
    description: '2–4 chapters, short-story length',
    defaultDepth: 'summary',
    maxChapters: 4,
  },
  book: {
    form: 'book',
    label: 'LoreBook',
    shortLabel: 'Book',
    description: 'Multi-chapter standard book',
    defaultDepth: 'detailed',
    maxChapters: null,
  },
  epic: {
    form: 'epic',
    label: 'Epic',
    shortLabel: 'Epic',
    description: 'Long-form extensive narrative',
    defaultDepth: 'epic',
    maxChapters: null,
  },
};

/** Timeline subject gates (moments / days / words). */
export const TIMELINE_TIER_GATES: Record<
  LorebookForm,
  { events: number; days: number; words: number }
> = {
  vignette: { events: 2, days: 1, words: 40 },
  chapter: { events: 3, days: 2, words: 80 },
  short_book: {
    events: TIMELINE_LOREBOOK_MIN_EVENTS,
    days: TIMELINE_LOREBOOK_MIN_DAYS,
    words: TIMELINE_LOREBOOK_MIN_WORDS,
  },
  book: { events: 8, days: 5, words: 250 },
  epic: { events: 15, days: 10, words: 500 },
};

/** Project gates (milestones / combined beats / moments). */
export const PROJECT_TIER_GATES: Record<
  LorebookForm,
  { milestones: number; beats: number; moments: number }
> = {
  vignette: { milestones: 1, beats: 1, moments: 2 },
  chapter: { milestones: 2, beats: 2, moments: 4 },
  short_book: { milestones: 3, beats: 4, moments: 8 },
  book: { milestones: 5, beats: 8, moments: 15 },
  epic: { milestones: 8, beats: 12, moments: 25 },
};

export type LorebookTierSignals = {
  eventCount?: number;
  uniqueDays?: number;
  wordCount?: number;
  milestones?: number;
  beats?: number;
  moments?: number;
  /** When true, short_book+ get a slight boost (domain already ready). */
  domainReady?: boolean;
  source: 'timeline' | 'project' | 'entity';
  subjectLabel?: string;
};

export type LorebookTierStatus = {
  form: LorebookForm;
  unlocked: boolean;
  progress: number;
  /** e.g. "2/3" toward this tier's primary counter */
  counterLabel: string;
  detailLabel: string;
};

export type LorebookTierOffer = {
  unlocked: LorebookForm[];
  highestUnlocked: LorebookForm | null;
  next: LorebookForm | null;
  tiers: LorebookTierStatus[];
  /** Meter oriented at next locked tier, or highest unlocked when all ready */
  meter: {
    progress: number;
    counterLabel: string;
    detailLabel: string;
    ready: boolean;
    currentForm: LorebookForm | null;
    nextForm: LorebookForm | null;
    segmentProgress: number[];
  };
  canCreateAny: boolean;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function timelineMeets(
  signals: LorebookTierSignals,
  gate: { events: number; days: number; words: number },
  form: LorebookForm,
): boolean {
  const events = signals.eventCount ?? 0;
  const days = signals.uniqueDays ?? 0;
  const words = signals.wordCount ?? 0;
  if (form === 'vignette') {
    return events >= gate.events && words >= gate.words;
  }
  if (signals.domainReady && (form === 'chapter' || form === 'short_book')) {
    return events >= Math.max(2, gate.events - 2) && words >= Math.floor(gate.words * 0.5);
  }
  return events >= gate.events && days >= gate.days && words >= gate.words;
}

function projectMeets(
  signals: LorebookTierSignals,
  gate: { milestones: number; beats: number; moments: number },
): boolean {
  const milestones = signals.milestones ?? 0;
  const beats = signals.beats ?? 0;
  const moments = signals.moments ?? 0;
  return milestones >= gate.milestones || beats >= gate.beats || moments >= gate.moments;
}

function timelineProgress(
  signals: LorebookTierSignals,
  gate: { events: number; days: number; words: number },
): number {
  const eventRatio = clamp01((signals.eventCount ?? 0) / gate.events);
  const dayRatio = clamp01((signals.uniqueDays ?? 0) / Math.max(1, gate.days));
  const wordRatio = clamp01((signals.wordCount ?? 0) / gate.words);
  return clamp01(eventRatio * 0.5 + dayRatio * 0.25 + wordRatio * 0.25);
}

function projectProgress(
  signals: LorebookTierSignals,
  gate: { milestones: number; beats: number; moments: number },
): number {
  return Math.max(
    clamp01((signals.milestones ?? 0) / gate.milestones),
    clamp01((signals.beats ?? 0) / gate.beats),
    clamp01((signals.moments ?? 0) / gate.moments),
  );
}

function evaluateTierStatus(
  form: LorebookForm,
  signals: LorebookTierSignals,
): LorebookTierStatus {
  const def = LOREBOOK_TIERS[form];
  if (signals.source === 'project') {
    const gate = PROJECT_TIER_GATES[form];
    const unlocked = projectMeets(signals, gate);
    const progress = unlocked ? 1 : projectProgress(signals, gate);
    const cur = Math.min(signals.milestones ?? 0, gate.milestones);
    return {
      form,
      unlocked,
      progress,
      counterLabel: `${cur}/${gate.milestones}`,
      detailLabel: unlocked
        ? `Ready for ${def.label}${signals.subjectLabel ? ` — “${signals.subjectLabel}”` : ''}`
        : `${signals.milestones ?? 0} milestones · ${signals.beats ?? 0} beats · ${signals.moments ?? 0} moments for ${def.label}`,
    };
  }

  const gate = TIMELINE_TIER_GATES[form];
  const unlocked = timelineMeets(signals, gate, form);
  const progress = unlocked ? 1 : timelineProgress(signals, gate);
  const cur = Math.min(signals.eventCount ?? 0, gate.events);
  return {
    form,
    unlocked,
    progress,
    counterLabel: `${cur}/${gate.events}`,
    detailLabel: unlocked
      ? `Ready for ${def.label}${signals.subjectLabel ? ` — “${signals.subjectLabel}”` : ''}`
      : `${signals.eventCount ?? 0} moments · ${signals.uniqueDays ?? 0} days · ${signals.wordCount ?? 0} words. Need more for ${def.label}.`,
  };
}

/** Evaluate which LoreBook forms are unlocked for the given content signals. */
export function evaluateLorebookTierOffer(signals: LorebookTierSignals): LorebookTierOffer {
  const tiers = LOREBOOK_TIER_ORDER.map((form) => evaluateTierStatus(form, signals));
  const unlocked = tiers.filter((t) => t.unlocked).map((t) => t.form);
  const highestUnlocked =
    unlocked.length > 0 ? unlocked[unlocked.length - 1]! : null;
  const next =
    LOREBOOK_TIER_ORDER.find((form) => !unlocked.includes(form)) ?? null;

  const focus = next
    ? tiers.find((t) => t.form === next)!
    : highestUnlocked
      ? tiers.find((t) => t.form === highestUnlocked)!
      : tiers[0]!;

  const segmentProgress = tiers.map((t) => t.progress);

  const meterLabel = next
    ? `${LOREBOOK_TIERS[next].shortLabel} · ${focus.counterLabel}`
    : highestUnlocked
      ? `${LOREBOOK_TIERS[highestUnlocked].shortLabel} · ready`
      : focus.counterLabel;

  return {
    unlocked,
    highestUnlocked,
    next,
    tiers,
    meter: {
      progress: next ? focus.progress : highestUnlocked ? 1 : focus.progress,
      counterLabel: meterLabel,
      detailLabel: focus.detailLabel,
      ready: unlocked.length > 0,
      currentForm: highestUnlocked,
      nextForm: next,
      segmentProgress,
    },
    canCreateAny: unlocked.length > 0,
  };
}

export function evaluateTimelineTierOffer(input: {
  eventCount: number;
  uniqueDays: number;
  wordCount: number;
  domainReady?: boolean;
  subjectLabel?: string;
}): LorebookTierOffer {
  return evaluateLorebookTierOffer({
    source: 'timeline',
    eventCount: input.eventCount,
    uniqueDays: input.uniqueDays,
    wordCount: input.wordCount,
    domainReady: input.domainReady,
    subjectLabel: input.subjectLabel,
  });
}

export function evaluateProjectTierOffer(
  profile: ProjectDetailProfile,
  subjectLabel?: string,
): LorebookTierOffer {
  const beats =
    profile.milestones.length + profile.storyBeats.length + profile.decisions.length;
  return evaluateLorebookTierOffer({
    source: 'project',
    milestones: profile.milestones.length,
    beats,
    moments: profile.stats.momentCount ?? 0,
    subjectLabel,
  });
}

export function defaultDepthForForm(form: LorebookForm): 'summary' | 'detailed' | 'epic' {
  return LOREBOOK_TIERS[form].defaultDepth;
}

export function maxChaptersForForm(form: LorebookForm): number | null {
  return LOREBOOK_TIERS[form].maxChapters;
}

export function isLorebookForm(value: unknown): value is LorebookForm {
  return typeof value === 'string' && value in LOREBOOK_TIERS;
}
