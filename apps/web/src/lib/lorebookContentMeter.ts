/**
 * Shared LoreBook content progress for timelines, projects, and other entities.
 * Prefers tiered meters when enough signals exist.
 */
import type { ProjectDetailProfile } from '../components/projects/projectModalTypes';

import {
  LOREBOOK_TIER_ORDER,
  LOREBOOK_TIERS,
  TIMELINE_TIER_GATES,
  evaluateProjectTierOffer,
  evaluateTimelineTierOffer,
  type LorebookForm,
  type LorebookTierOffer,
} from './lorebookTiers';
import { PROJECT_LOREBOOK_MIN_BEATS } from './projectTimelineClipboard';
import {
  TIMELINE_LOREBOOK_MIN_EVENTS,
  type TimelineSubjectLorebookOffer,
} from './timelineSubjectLorebook';

export type LorebookContentMeterModel = {
  /** 0..1 fill amount (toward next tier, or 1 when highest unlocked) */
  progress: number;
  /** Short counter, e.g. "Chapter · 3/4" or "3/5" */
  counterLabel: string;
  /** Accessible / tooltip detail */
  detailLabel: string;
  ready: boolean;
  /** Highest unlocked form, if known */
  currentForm?: LorebookForm | null;
  /** Next locked form, if any */
  nextForm?: LorebookForm | null;
  /** Per-tier 0..1 fills for segmented bar */
  segmentProgress?: number[];
  /** Full tier offer when computed */
  tierOffer?: LorebookTierOffer;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export function meterFromRatios(
  ratios: Array<{ current: number; required: number; weight?: number }>,
): { progress: number; current: number; required: number } {
  let weighted = 0;
  let weightSum = 0;
  let currentSum = 0;
  let requiredSum = 0;
  for (const row of ratios) {
    const w = row.weight ?? 1;
    const req = Math.max(1, row.required);
    weighted += clamp01(row.current / req) * w;
    weightSum += w;
    currentSum += row.current;
    requiredSum += req;
  }
  return {
    progress: weightSum > 0 ? weighted / weightSum : 0,
    current: Math.round(currentSum),
    required: Math.round(requiredSum),
  };
}

function meterFromTierOffer(offer: LorebookTierOffer): LorebookContentMeterModel {
  return {
    progress: offer.meter.progress,
    counterLabel: offer.meter.counterLabel,
    detailLabel: offer.meter.detailLabel,
    ready: offer.meter.ready,
    currentForm: offer.meter.currentForm,
    nextForm: offer.meter.nextForm,
    segmentProgress: offer.meter.segmentProgress,
    tierOffer: offer,
  };
}

/** Progress for an Omni Timeline subject / arc LoreBook offer (tiered). */
export function meterFromTimelineOffer(
  offer: Pick<
    TimelineSubjectLorebookOffer,
    'eventCount' | 'uniqueDays' | 'wordCount' | 'canCreate' | 'reason' | 'subjectLabel'
  > & { domainReady?: boolean },
): LorebookContentMeterModel {
  const tierOffer = evaluateTimelineTierOffer({
    eventCount: offer.eventCount,
    uniqueDays: offer.uniqueDays,
    wordCount: offer.wordCount,
    domainReady: offer.domainReady,
    subjectLabel: offer.subjectLabel,
  });
  return meterFromTierOffer(tierOffer);
}

/** Progress for a project detail profile toward Make LoreBook (tiered). */
export function meterFromProjectProfile(profile: ProjectDetailProfile): LorebookContentMeterModel {
  return meterFromTierOffer(evaluateProjectTierOffer(profile));
}

/** Generic entity meter when you only have a current/required count. */
export function meterFromCount(
  current: number,
  required: number,
  opts?: { label?: string; ready?: boolean },
): LorebookContentMeterModel {
  const req = Math.max(1, required);
  const cur = Math.max(0, current);
  const progress = clamp01(cur / req);
  const ready = opts?.ready ?? cur >= req;
  return {
    progress: ready ? 1 : progress,
    counterLabel: `${Math.min(cur, req)}/${req}`,
    detailLabel: opts?.label ?? `${cur} of ${req} needed`,
    ready,
  };
}

/**
 * Narrative Anchors currently expose linked resolved moments, but not the full
 * source text needed for the timeline word/day gates. Keep this meter honest by
 * grading only the moments that are actually attached to the anchor.
 */
export function meterFromNarrativeAnchorMoments(
  momentCount: number,
): LorebookContentMeterModel {
  const current = Math.max(0, Math.floor(momentCount));
  const unlocked = LOREBOOK_TIER_ORDER.filter(
    (form) => current >= TIMELINE_TIER_GATES[form].events,
  );
  const currentForm = unlocked.at(-1) ?? null;
  const nextForm = LOREBOOK_TIER_ORDER.find((form) => !unlocked.includes(form)) ?? null;
  const targetForm = nextForm ?? currentForm ?? 'vignette';
  const target = TIMELINE_TIER_GATES[targetForm].events;
  const currentLabel = currentForm ? LOREBOOK_TIERS[currentForm].label : null;
  const targetLabel = LOREBOOK_TIERS[targetForm].shortLabel;
  const remaining = Math.max(0, target - current);

  return {
    progress: clamp01(current / target),
    counterLabel: `${targetLabel} · ${Math.min(current, target)}/${target}`,
    detailLabel: nextForm
      ? `${current} linked ${current === 1 ? 'moment' : 'moments'} — ${remaining} more for ${LOREBOOK_TIERS[nextForm].label}`
      : `${current} linked moments — ${currentLabel ?? 'Vignette'} ready`,
    ready: currentForm !== null,
    currentForm,
    nextForm,
    segmentProgress: LOREBOOK_TIER_ORDER.map((form) =>
      clamp01(current / TIMELINE_TIER_GATES[form].events),
    ),
  };
}

/** Legacy single-bar helper used by tests that still assert short_book thresholds. */
export function legacyShortBookCounter(eventCount: number): string {
  return `${Math.min(eventCount, TIMELINE_LOREBOOK_MIN_EVENTS)}/${TIMELINE_LOREBOOK_MIN_EVENTS}`;
}

export function legacyProjectMilestoneCounter(milestones: number): string {
  return `${Math.min(milestones, PROJECT_LOREBOOK_MIN_BEATS)}/${PROJECT_LOREBOOK_MIN_BEATS}`;
}
