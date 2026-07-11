/**
 * Evidence-based confidence for memory-quality claims.
 * Does not inflate confidence — multiplies down on weak evidence.
 */

export type ConfidenceFactors = {
  /** Base model/extractor confidence 0–1 */
  base: number;
  /** Distinct supporting evidence snippets */
  evidenceCount: number;
  /** User corrections that contradict (reduces) */
  contradictionCount?: number;
  /** User confirmed */
  userConfirmed?: boolean;
  /** Explicit first-person vs third-person weak signal */
  firstPerson?: boolean;
  /** Recency weight 0–1 (optional) */
  recency?: number;
};

export type ConfidenceReport = {
  confidence: number;
  evidenceCount: number;
  factors: {
    base: number;
    evidenceBoost: number;
    contradictionPenalty: number;
    confirmationBoost: number;
    firstPersonBoost: number;
    recency: number;
  };
  lastConfirmed?: string;
};

/**
 * 5-factor style confidence without fabricating support.
 * Caps at 0.95 unless user-confirmed (0.98).
 */
export function computeClaimConfidence(f: ConfidenceFactors): ConfidenceReport {
  const base = clamp(f.base, 0, 1);
  const evidenceCount = Math.max(0, f.evidenceCount | 0);
  // +0.03 per additional evidence, max +0.12
  const evidenceBoost = Math.min(0.12, Math.max(0, evidenceCount - 1) * 0.03);
  const contradictionPenalty = Math.min(0.5, (f.contradictionCount ?? 0) * 0.2);
  const confirmationBoost = f.userConfirmed ? 0.08 : 0;
  const firstPersonBoost = f.firstPerson === false ? -0.05 : f.firstPerson ? 0.02 : 0;
  const recency = f.recency == null ? 1 : clamp(f.recency, 0.5, 1);

  let confidence =
    (base + evidenceBoost + confirmationBoost + firstPersonBoost) * recency - contradictionPenalty;
  confidence = clamp(confidence, 0.05, f.userConfirmed ? 0.98 : 0.95);

  return {
    confidence,
    evidenceCount,
    factors: {
      base,
      evidenceBoost,
      contradictionPenalty,
      confirmationBoost,
      firstPersonBoost,
      recency,
    },
    lastConfirmed: f.userConfirmed ? new Date().toISOString() : undefined,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function attachConfidence<T extends { confidence: number; evidence?: string }>(
  items: T[],
  opts?: { firstPerson?: boolean },
): Array<T & { confidenceReport: ConfidenceReport }> {
  return items.map((item) => {
    const report = computeClaimConfidence({
      base: item.confidence,
      evidenceCount: item.evidence ? 1 : 0,
      firstPerson: opts?.firstPerson,
    });
    return { ...item, confidence: report.confidence, confidenceReport: report };
  });
}
