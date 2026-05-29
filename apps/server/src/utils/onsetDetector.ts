/**
 * Onset Detector
 *
 * Answers "when did I first / start / begin X?" queries.
 *
 * Two parts:
 *
 * 1. isOnsetQuery(message) — detects intent: is the user asking for a first occurrence?
 *
 * 2. detectOnset(observations) — CUSUM (cumulative sum) change-point detection.
 *    Given a time series of {date, score} observations (e.g., "does this entry mention
 *    ska shows?"), finds the date where the topic transitioned from absent → present.
 *
 * CUSUM algorithm (Page, 1954; Wald sequential test):
 *   S_t = max(0, S_{t-1} + (x_t - μ_0 - k))
 *   Signal when S_t ≥ h
 *
 *   μ_0 = background rate (topic absent)
 *   k   = slack (allowance for noise), typically (μ_1 - μ_0) / 2
 *   h   = threshold for alarm, typically 5 * σ
 *
 * For our use case: x_t is 1 if entry mentions the topic, 0 otherwise.
 * Onset = the date of the first observation that triggered S_t ≥ h.
 *
 * Also exports scoreEntryForTopic — converts a journal entry content string
 * into an observation score (0–1) for CUSUM input.
 */

// ── Intent detection ──────────────────────────────────────────────────────────

const ONSET_PATTERNS: RegExp[] = [
  /\bwhen did i (first|start|begin|get into|start going|start doing|pick up|take up)\b/i,
  /\bwhen (did i|have i been|did we start)\b/i,
  /\bhow long (have i been|ago did i start)\b/i,
  /\bsince when\b/i,
  /\bwhat (year|month|time) did i (start|begin|first)\b/i,
  /\bfirst time i (ever|did|went|tried|saw|met)\b/i,
  /\borigins? of\b/i,
  /\bwhen (i first|did i first)\b/i,
];

export function isOnsetQuery(message: string): boolean {
  return ONSET_PATTERNS.some(re => re.test(message));
}

// ── CUSUM types ───────────────────────────────────────────────────────────────

export interface OnsetObservation {
  date: Date;
  score: number;     // 0–1: relevance of this observation to the topic
  entryId?: string;
}

export interface OnsetResult {
  onsetDate: Date;
  onsetEntryId: string | undefined;
  cusumPeak: number;    // maximum CUSUM value (signal strength)
  supportCount: number; // entries contributing to onset signal
  confidence: number;   // 0–1 estimate
}

/**
 * CUSUM change-point detection over topic observations.
 *
 * @param observations  Array of {date, score} sorted ASCENDING by date (oldest first).
 * @param k             Slack parameter — half the expected signal magnitude.
 *                      Default 0.25 (calibrated for binary presence/absence at ~50% rate).
 * @param h             Detection threshold. Default 2.5 (moderate sensitivity).
 * @returns             Onset result or null if no change point detected.
 */
export function detectOnset(
  observations: OnsetObservation[],
  k: number = 0.25,
  h: number = 2.5,
): OnsetResult | null {
  if (observations.length === 0) return null;

  // Sort oldest-first to run the sequential test in chronological order
  const sorted = [...observations].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Estimate background rate μ_0 from the first 20% of observations
  // (assumes topic was absent early on — if not, CUSUM still finds the phase shift)
  const baselineCount = Math.max(1, Math.floor(sorted.length * 0.2));
  const baselineScores = sorted.slice(0, baselineCount).map(o => o.score);
  const mu0 = baselineScores.reduce((a, b) => a + b, 0) / baselineScores.length;

  let S = 0;
  let maxS = 0;
  let onsetObs: OnsetObservation | null = null;
  let supportCount = 0;

  for (const obs of sorted) {
    // CUSUM update: increment for above-background signals, reset floor at 0
    S = Math.max(0, S + (obs.score - mu0 - k));
    if (S > 0) supportCount++;
    if (S > maxS) maxS = S;

    // First time we cross the threshold — this is the onset date
    if (S >= h && onsetObs === null) {
      onsetObs = obs;
    }
  }

  if (!onsetObs) return null;

  // Confidence: based on ratio of peak CUSUM to threshold and support count
  const rawConf = Math.min(1, (maxS / h) * 0.5 + (Math.min(supportCount, 10) / 10) * 0.5);

  return {
    onsetDate:    onsetObs.date,
    onsetEntryId: onsetObs.entryId,
    cusumPeak:    maxS,
    supportCount,
    confidence:   rawConf,
  };
}

// ── Entry scoring for CUSUM input ─────────────────────────────────────────────

/**
 * Scores a journal entry against a set of topic keywords.
 * Returns 0–1 based on keyword presence, density, and emphasis signals.
 *
 * Used to convert raw journal entries into CUSUM observations.
 */
export function scoreEntryForTopic(content: string, keywords: string[]): number {
  if (!content || keywords.length === 0) return 0;
  const lower = content.toLowerCase();
  const wordCount = lower.split(/\s+/).length;

  let hits = 0;
  let weightedHits = 0;

  for (const kw of keywords) {
    const re = new RegExp(`\\b${kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    const matches = (lower.match(re) || []).length;
    if (matches > 0) {
      hits++;
      // Density bonus: more mentions per word = higher relevance
      weightedHits += Math.min(1, matches / Math.max(1, wordCount / 100));
    }
  }

  if (hits === 0) return 0;

  // Normalize: at least one keyword hit = 0.4 base; weighted density adds up to 0.6
  const base = 0.4;
  const density = Math.min(0.6, (weightedHits / keywords.length) * 0.6);
  return base + density;
}

/**
 * Find the first occurrence of a topic across a sorted list of entries.
 * Simple fallback for when CUSUM finds no clean onset (topic always present).
 * Returns the earliest entry with score >= minScore.
 */
export function firstOccurrence(
  observations: OnsetObservation[],
  minScore: number = 0.4,
): OnsetResult | null {
  const sorted = [...observations]
    .filter(o => o.score >= minScore)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (sorted.length === 0) return null;

  return {
    onsetDate:    sorted[0].date,
    onsetEntryId: sorted[0].entryId,
    cusumPeak:    sorted[0].score,
    supportCount: sorted.length,
    confidence:   Math.min(0.9, 0.5 + sorted.length * 0.04),
  };
}

/**
 * Combined onset resolution:
 * 1. Run CUSUM — returns change-point (best for topics that had a clear start).
 * 2. If CUSUM finds nothing (topic may have always been present), fall back to
 *    first-occurrence scan.
 */
export function resolveOnset(
  observations: OnsetObservation[],
  k?: number,
  h?: number,
): OnsetResult | null {
  return detectOnset(observations, k, h) ?? firstOccurrence(observations);
}
