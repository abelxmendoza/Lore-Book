/**
 * Relationship decay — deliberately conservative. Silence alone is NEVER
 * evidence of change: the user may be heads-down at work, building their
 * project, traveling, or just not journaling. Decay needs long silence AND
 * no reinforcement AND competing evidence; workload freezes it entirely.
 */
import type { WorkloadState } from './relationshipCognitionTypes';
import type { ActiveArc } from '../narrative/narrativeCognitionTypes';
import type { WorkContext } from '../work/workContextTypes';

/** No decay at all inside this window, no matter what. */
const NO_DECAY_DAYS = 45;
/** Even maximal justified decay never erases a relationship's history. */
const MAX_DECAY_FLOOR = 0.5;
/** Silence without competing evidence barely moves the needle. */
const SILENCE_ONLY_FLOOR = 0.85;

const BUSY_ARC_KINDS: ReadonlySet<ActiveArc['kind']> = new Set([
  'job_onboarding',
  'project_build',
  'financial_stability',
  'health_fitness',
]);

/**
 * Where is the user's attention? A live job, an active project, or a global
 * journaling drop all explain silence without implying emotional change.
 */
export function resolveWorkload(opts: {
  work?: WorkContext | null;
  arcs?: ActiveArc[];
  /** Most recent activity timestamp across ALL entities, not just this person. */
  latestGlobalActivity?: string;
  now: string;
}): WorkloadState {
  const reasons: string[] = [];

  const busyWithWork = Boolean(
    opts.work?.currentRole?.status === 'current' &&
      (opts.work.tenure?.phrase || opts.arcs?.some((arc) => arc.kind === 'job_onboarding')),
  );
  if (busyWithWork) reasons.push('deep in a current job (new-role energy)');

  const busyWithProject = Boolean(
    opts.arcs?.some((arc) => arc.kind !== 'job_onboarding' && BUSY_ARC_KINDS.has(arc.kind)),
  );
  if (busyWithProject) reasons.push('active project/life arcs absorbing attention');

  let globalActivityDrop = false;
  if (opts.latestGlobalActivity) {
    const gap = Date.parse(opts.now) - Date.parse(opts.latestGlobalActivity);
    if (Number.isFinite(gap) && gap > 14 * 86_400_000) {
      globalActivityDrop = true;
      reasons.push('journaling dropped across the board — silence is global');
    }
  }

  return { busyWithWork, busyWithProject, globalActivityDrop, reasons };
}

/**
 * Multiplier applied to interest/attachment scores. 1.0 = no decay.
 *
 * Decay requires ALL of: long silence, no reinforcing evidence in the window,
 * and competing evidence (a new interest, an explicit shift). Workload or a
 * global activity drop freezes decay outright.
 */
export function decayMultiplier(opts: {
  daysSinceEvidence: number | null;
  workload: WorkloadState;
  hasCompetingEvidence: boolean;
}): { multiplier: number; frozen: boolean; reason: string } {
  const { daysSinceEvidence, workload, hasCompetingEvidence } = opts;

  if (daysSinceEvidence == null || daysSinceEvidence <= NO_DECAY_DAYS) {
    return { multiplier: 1, frozen: false, reason: 'recent evidence — no decay' };
  }
  if (workload.busyWithWork || workload.busyWithProject || workload.globalActivityDrop) {
    return {
      multiplier: 1,
      frozen: true,
      reason: `decay frozen: ${workload.reasons[0] ?? 'attention elsewhere'}`,
    };
  }
  if (!hasCompetingEvidence) {
    // Pure silence: gentle drift toward uncertainty, never toward "no interest".
    const drift = Math.min(0.15, ((daysSinceEvidence - NO_DECAY_DAYS) / 365) * 0.3);
    return {
      multiplier: Math.max(SILENCE_ONLY_FLOOR, 1 - drift),
      frozen: false,
      reason: 'long silence without competing evidence — mild drift only',
    };
  }
  const decay = Math.min(1 - MAX_DECAY_FLOOR, ((daysSinceEvidence - NO_DECAY_DAYS) / 180) * 0.5);
  return {
    multiplier: Math.max(MAX_DECAY_FLOOR, 1 - decay),
    frozen: false,
    reason: 'long silence plus competing evidence — decaying',
  };
}
