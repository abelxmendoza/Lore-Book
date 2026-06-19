/**
 * User-facing epistemic language for memory/knowledge certainty.
 * Internal APIs and data fields still use `confidence` (0–1).
 */

export type EpistemicBand = 'high_certainty' | 'partial' | 'high_uncertainty';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function epistemicBand(confidence: number): EpistemicBand {
  const c = clamp(confidence);
  if (c >= 0.7) return 'high_certainty';
  if (c >= 0.4) return 'partial';
  return 'high_uncertainty';
}

/** Qualitative band label — certainty-first framing for high scores, uncertainty for low. */
export function epistemicLabel(confidence: number): string {
  switch (epistemicBand(confidence)) {
    case 'high_certainty':
      return 'High certainty';
    case 'partial':
      return 'Some uncertainty';
    case 'high_uncertainty':
      return 'High uncertainty';
  }
}

/** Compact percent phrasing: "84% certain" or "68% uncertain". */
export function formatEpistemicPercent(confidence: number): string {
  const c = clamp(confidence);
  const pct = Math.round(c * 100);
  if (c >= 0.5) return `${pct}% certain`;
  return `${100 - pct}% uncertain`;
}

/** Badge / inline label with optional qualitative prefix. */
export function formatEpistemicBadge(
  confidence: number,
  opts?: { includeBand?: boolean },
): string {
  const percent = formatEpistemicPercent(confidence);
  if (opts?.includeBand === false) return percent;
  return `${epistemicLabel(confidence)} · ${percent}`;
}

export function epistemicFieldLabel(): string {
  return 'Certainty';
}

export function epistemicHistoryTitle(): string {
  return 'Certainty over time';
}

export function epistemicColorClass(confidence: number): string {
  const c = clamp(confidence);
  if (c >= 0.7) return 'text-emerald-400';
  if (c >= 0.4) return 'text-amber-400';
  return 'text-red-400';
}

export function epistemicBadgeColorClass(confidence: number): string {
  const c = clamp(confidence);
  if (c >= 0.7) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (c >= 0.4) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-red-500/15 text-red-300 border-red-500/30';
}

/** Tooltip / title attribute for epistemic scores. */
export function formatEpistemicTitle(confidence: number): string {
  return `${epistemicLabel(confidence)} (${formatEpistemicPercent(confidence)})`;
}
