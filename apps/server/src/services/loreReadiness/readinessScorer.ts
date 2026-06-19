import type {
  LoreReadinessLevel,
  LoreTopicDefinition,
  ReadinessDimensionScores,
  ReadinessGap,
} from './types';
import type { AtomSliceMetrics } from './atomIndexService';

export type ReadinessProfile = {
  minAtoms: number;
  minEntries: number;
  minAtomTypes?: Partial<Record<string, number>>;
  minTimeSpanMonths?: number;
  minWords?: number;
  minEvidenceScore?: number;
  minEntities?: { characters?: number; locations?: number };
};

export function levelFromProgress(progress: number): LoreReadinessLevel {
  if (progress >= 1) return 'ready';
  if (progress >= 0.45) return 'building';
  return 'needs_more';
}

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function scoreDimensions(
  metrics: AtomSliceMetrics,
  profile: ReadinessProfile,
  evidenceScore = 100
): ReadinessDimensionScores {
  const volumeProgress = clampProgress(
    Math.min(
      profile.minAtoms > 0 ? metrics.atomCount / profile.minAtoms : 1,
      profile.minEntries > 0 ? metrics.entryCount / profile.minEntries : 1,
      profile.minWords ? metrics.wordCount / profile.minWords : 1
    )
  );

  let diversityProgress = 1;
  if (profile.minAtomTypes) {
    const typeProgresses = Object.entries(profile.minAtomTypes).map(([type, required]) => {
      const req = required ?? 0;
      const have = metrics.atomTypeCounts[type as keyof typeof metrics.atomTypeCounts] ?? 0;
      return req > 0 ? have / req : 1;
    });
    diversityProgress = typeProgresses.length > 0 ? clampProgress(Math.min(...typeProgresses)) : 1;
  }

  let anchoringProgress = 1;
  if (profile.minEntities?.characters) {
    anchoringProgress = Math.min(
      anchoringProgress,
      metrics.entityIds.characters.length / profile.minEntities.characters
    );
  }
  if (profile.minEntities?.locations) {
    anchoringProgress = Math.min(
      anchoringProgress,
      metrics.entityIds.locations.length / profile.minEntities.locations
    );
  }
  anchoringProgress = clampProgress(anchoringProgress);

  const temporalProgress = profile.minTimeSpanMonths
    ? clampProgress(metrics.timeSpanMonths / profile.minTimeSpanMonths)
    : 1;

  const evidenceProgress = profile.minEvidenceScore
    ? clampProgress(evidenceScore / profile.minEvidenceScore)
    : 1;

  return {
    volume: volumeProgress,
    diversity: diversityProgress,
    anchoring: anchoringProgress,
    temporal: temporalProgress,
    evidence: evidenceProgress,
  };
}

export function weightedProgress(dimensions: ReadinessDimensionScores): number {
  const weights = { volume: 0.3, diversity: 0.2, anchoring: 0.25, temporal: 0.15, evidence: 0.1 };
  const total =
    dimensions.volume * weights.volume +
    dimensions.diversity * weights.diversity +
    dimensions.anchoring * weights.anchoring +
    dimensions.temporal * weights.temporal +
    dimensions.evidence * weights.evidence;
  return clampProgress(total);
}

export function buildGaps(
  metrics: AtomSliceMetrics,
  profile: ReadinessProfile,
  evidenceScore: number,
  topicLabel: string
): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];

  if (metrics.atomCount < profile.minAtoms) {
    gaps.push({
      id: 'atoms',
      label: 'Narrative atoms',
      severity: 'blocker',
      current: metrics.atomCount,
      required: profile.minAtoms,
      suggestion: `Share ${profile.minAtoms - metrics.atomCount} more stories about ${topicLabel.toLowerCase()}.`,
    });
  }

  if (metrics.entryCount < profile.minEntries) {
    gaps.push({
      id: 'entries',
      label: 'Source entries',
      severity: 'blocker',
      current: metrics.entryCount,
      required: profile.minEntries,
      suggestion: `Add ${profile.minEntries - metrics.entryCount} more journal or chat episodes for ${topicLabel.toLowerCase()}.`,
    });
  }

  if (profile.minAtomTypes) {
    for (const [type, requiredRaw] of Object.entries(profile.minAtomTypes)) {
      const required = requiredRaw ?? 0;
      const have = metrics.atomTypeCounts[type as keyof typeof metrics.atomTypeCounts] ?? 0;
      if (have < required) {
        gaps.push({
          id: `type-${type}`,
          label: `${type.replace(/_/g, ' ')} moments`,
          severity: 'warning',
          current: have,
          required,
          suggestion: gapSuggestionForAtomType(type, topicLabel),
        });
      }
    }
  }

  if (profile.minTimeSpanMonths && metrics.timeSpanMonths < profile.minTimeSpanMonths) {
    gaps.push({
      id: 'time-span',
      label: 'Time coverage',
      severity: 'warning',
      current: metrics.timeSpanMonths,
      required: profile.minTimeSpanMonths,
      suggestion: `Cover more time — stories span ${metrics.timeSpanMonths} months but ${profile.minTimeSpanMonths} months helps a richer arc.`,
    });
  }

  if (profile.minEntities?.characters && metrics.entityIds.characters.length < profile.minEntities.characters) {
    gaps.push({
      id: 'characters',
      label: 'Named people',
      severity: 'blocker',
      current: metrics.entityIds.characters.length,
      required: profile.minEntities.characters,
      suggestion: 'Mention specific people by name in your stories.',
    });
  }

  if (profile.minEntities?.locations && metrics.entityIds.locations.length < profile.minEntities.locations) {
    gaps.push({
      id: 'locations',
      label: 'Named places',
      severity: 'blocker',
      current: metrics.entityIds.locations.length,
      required: profile.minEntities.locations,
      suggestion: 'Describe places that matter to this story.',
    });
  }

  if (profile.minEvidenceScore && evidenceScore < profile.minEvidenceScore) {
    gaps.push({
      id: 'evidence',
      label: 'Verified knowledge',
      severity: 'warning',
      current: evidenceScore,
      required: profile.minEvidenceScore,
      suggestion: 'Confirm key facts in Trust Center to strengthen this book.',
    });
  }

  return gaps;
}

function gapSuggestionForAtomType(type: string, topicLabel: string): string {
  switch (type) {
    case 'reflection':
      return `Reflect on what ${topicLabel.toLowerCase()} meant to you — lessons, feelings, or turning points.`;
    case 'achievement':
      return 'Share a win or milestone related to this topic.';
    case 'relationship_moment':
      return 'Describe a meaningful moment with someone important.';
    case 'turning_point':
      return 'Tell a moment when things changed direction.';
    case 'creative_output':
      return 'Talk about something you made or built.';
    case 'skill_milestone':
      return 'Describe when you learned or mastered something.';
    default:
      return `Add more ${type.replace(/_/g, ' ')} stories about ${topicLabel.toLowerCase()}.`;
  }
}

export function topicToProfile(topic: LoreTopicDefinition): ReadinessProfile {
  return {
    minAtoms: topic.minAtoms,
    minEntries: topic.minEntries,
    minAtomTypes: topic.minAtomTypes,
    minTimeSpanMonths: topic.minTimeSpanMonths,
    minWords: topic.minWords,
    minEvidenceScore: topic.minEvidenceScore,
    minEntities: topic.minEntities,
  };
}

export function gapsToSuggestions(gaps: ReadinessGap[]): string[] {
  return gaps
    .map((g) => g.suggestion)
    .filter((s): s is string => Boolean(s))
    .slice(0, 4);
}
