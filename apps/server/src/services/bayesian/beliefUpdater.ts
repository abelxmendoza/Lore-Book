/**
 * Bayesian Belief Updater — Beta Distribution Confidence
 *
 * Replaces static float confidence with a proper Beta(α, β) model.
 *
 * Why Beta distribution:
 *   - Models a probability on [0, 1] — perfect for "how confident are we this claim is true?"
 *   - Conjugate prior to the Bernoulli: updating with new evidence is closed-form arithmetic
 *   - Encodes *uncertainty* separately from *value*: Beta(2,2) mean=0.5 is very uncertain;
 *     Beta(50,50) mean=0.5 is highly certain that it's ~0.5
 *
 * The two parameters:
 *   α (alpha) — pseudocount of confirmations (supporting evidence)
 *   β (beta)  — pseudocount of contradictions (opposing evidence)
 *
 * Key quantities:
 *   Mean (best estimate):    α / (α + β)
 *   Variance (uncertainty):  αβ / [(α+β)²(α+β+1)]
 *   Effective N:             α + β  (higher = more certain)
 *   95% credible interval:   via beta quantiles (approximated here)
 *
 * Prior for new claims: Beta(1, 1) = uniform (maximum uncertainty).
 * Prior for AI-sourced claims: Beta(2, 1) = slight lean toward true.
 * Prior for user-stated facts: Beta(3, 1) = stronger prior.
 *
 * Each new confirmation: α += weight
 * Each contradiction:    β += weight
 * Each neutral mention:  α += 0.3 (weak confirmation from acknowledgement)
 *
 * Recency weighting: recent evidence counts more.
 *   w(t) = exp(-λ · days_since) where λ = ln(2)/halfLifeDays
 *   Default halfLife = 180 days — confidence decays slowly without new evidence.
 *
 * Storage: store (alpha, beta) in claim/entity metadata. Derive `confidence` as
 * the mean for backward-compat with any code that reads the float field.
 */

export interface BetaBelief {
  alpha: number;
  beta: number;
}

export interface BeliefStats {
  mean: number;         // best-estimate probability (alpha / (alpha + beta))
  variance: number;     // uncertainty
  effectiveN: number;   // total pseudo-observations (alpha + beta)
  credibleLow: number;  // ~2.5th percentile (95% CI lower)
  credibleHigh: number; // ~97.5th percentile (95% CI upper)
  confidence: number;   // alias for mean, for backward compatibility
}

// ── Priors ────────────────────────────────────────────────────────────────────

export const PRIORS = {
  uniform:     { alpha: 1.0, beta: 1.0 },  // no information
  aiInferred:  { alpha: 2.0, beta: 1.0 },  // AI extraction: slight lean toward true
  userStated:  { alpha: 4.0, beta: 1.0 },  // user said it directly: strong prior
  disputed:    { alpha: 1.0, beta: 2.0 },  // starts with suspicion
} as const;

// ── Core update ───────────────────────────────────────────────────────────────

/**
 * Update a Beta belief with new evidence.
 *
 * @param belief         Current (alpha, beta)
 * @param confirmations  Weight of supporting evidence (0–1 per piece, or count)
 * @param contradictions Weight of opposing evidence
 * @param neutral        Weight of neutral mentions (counted as 0.3 confirmations)
 */
export function updateBelief(
  belief: BetaBelief,
  confirmations: number,
  contradictions: number = 0,
  neutral: number = 0,
): BetaBelief {
  return {
    alpha: belief.alpha + confirmations + neutral * 0.3,
    beta:  belief.beta  + contradictions,
  };
}

/**
 * Update with recency-weighted evidence.
 * Evidence from days_ago ago is discounted by exp(-λ·days_ago).
 *
 * @param halfLifeDays  Half-life of evidence weight (default 180 days)
 */
export function updateBeliefWithRecency(
  belief: BetaBelief,
  confirmations: number,
  contradictions: number,
  daysAgo: number,
  halfLifeDays: number = 180,
): BetaBelief {
  const lambda = Math.LN2 / halfLifeDays;
  const weight = Math.exp(-lambda * Math.max(0, daysAgo));
  return updateBelief(belief, confirmations * weight, contradictions * weight);
}

// ── Statistics ────────────────────────────────────────────────────────────────

export function beliefStats(belief: BetaBelief): BeliefStats {
  const { alpha, beta } = belief;
  const n = alpha + beta;
  const mean = alpha / n;
  const variance = (alpha * beta) / (n * n * (n + 1));

  // Wilson score interval approximation of 95% Beta credible interval
  // (exact Beta quantiles require numerical methods; this is accurate to ~0.02)
  const z = 1.96;
  const p = mean;
  const denom = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denom;
  const spread = (z / denom) * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  const credibleLow  = Math.max(0, center - spread);
  const credibleHigh = Math.min(1, center + spread);

  return { mean, variance, effectiveN: n, credibleLow, credibleHigh, confidence: mean };
}

/**
 * Convert a legacy float confidence to a Beta belief.
 * Maps the float to an (alpha, beta) pair that reproduces the mean,
 * with an effective N reflecting low initial certainty.
 *
 * @param confidence  Float in [0, 1]
 * @param effectiveN  How many pseudo-observations to assign (default 4)
 */
export function fromFloat(confidence: number, effectiveN: number = 4): BetaBelief {
  const p = Math.max(0.01, Math.min(0.99, confidence));
  return {
    alpha: p * effectiveN,
    beta:  (1 - p) * effectiveN,
  };
}

/**
 * Serialize a Beta belief for storage in a JSONB metadata column.
 * Includes the derived confidence float for backward-compat reads.
 */
export function serializeBelief(belief: BetaBelief): Record<string, number> {
  const { mean } = beliefStats(belief);
  return { alpha: belief.alpha, beta: belief.beta, confidence: mean };
}

/**
 * Deserialize from a JSONB metadata column. Falls back to fromFloat if only
 * a raw `confidence` float is present (backward compat).
 */
export function deserializeBelief(metadata: Record<string, any> | null | undefined): BetaBelief {
  if (!metadata) return { ...PRIORS.uniform };
  if (typeof metadata.alpha === 'number' && typeof metadata.beta === 'number') {
    return { alpha: metadata.alpha, beta: metadata.beta };
  }
  if (typeof metadata.confidence === 'number') {
    return fromFloat(metadata.confidence);
  }
  return { ...PRIORS.uniform };
}

// ── Batch merge ───────────────────────────────────────────────────────────────

/**
 * Merge two independent beliefs about the same claim using the Dempster-Shafer
 * approximation: multiply Bayes factors.
 *
 * Useful when two sources (AI extraction + user statement) independently assess
 * the same claim and we want a combined belief.
 */
export function mergeBeliefs(a: BetaBelief, b: BetaBelief): BetaBelief {
  // Product of likelihood ratios — equivalent to multiplying evidence
  const statsA = beliefStats(a);
  const statsB = beliefStats(b);
  // Effective N is additive; means combine via weighted average
  const nA = a.alpha + a.beta;
  const nB = b.alpha + b.beta;
  const combinedMean = (statsA.mean * nA + statsB.mean * nB) / (nA + nB);
  const combinedN = nA + nB;
  return fromFloat(combinedMean, combinedN);
}

/**
 * Whether a belief has enough evidence to be considered "settled"
 * (effective N > threshold and mean is clear).
 */
export function isSettled(
  belief: BetaBelief,
  minN: number = 8,
  certaintyThreshold: number = 0.7,
): boolean {
  const { mean, effectiveN } = beliefStats(belief);
  return effectiveN >= minN && (mean >= certaintyThreshold || mean <= (1 - certaintyThreshold));
}
