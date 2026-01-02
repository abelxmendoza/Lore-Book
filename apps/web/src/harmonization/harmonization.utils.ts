import type { HarmonizationCluster, HarmonizationHighlight, HarmonizationState } from './harmonization.reducer';

export const normalizeClusters = (rawClusters: Record<string, any[]>): HarmonizationCluster[] => {
  return Object.entries(rawClusters ?? {}).map(([label, entries]) => ({
    label,
    entries,
  }));
};

export const buildHighlights = (entries: any[]): HarmonizationHighlight[] => {
  return (entries ?? []).map((entry) => ({
    title: entry?.title ?? 'Untitled entry',
    summary: entry?.summary ?? '',
    reason: entry?.reason ?? 'recent',
    timestamp: entry?.timestamp,
  }));
};

export const mergeSummary = (state: HarmonizationState, payload: any): HarmonizationState => {
  return {
    ...state,
    highlights: buildHighlights(payload?.highlights ?? state.highlights),
    clusters: normalizeClusters(payload?.clusters ?? {}),
    identityHints: payload?.identityHints ?? state.identityHints,
    continuityFlags: payload?.continuityFlags ?? payload?.continuity ?? state.continuityFlags,
    recommendedSurfaces: payload?.recommendedSurfaces ?? state.recommendedSurfaces,
  };
};
