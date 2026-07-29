import type { DemoMetricKey } from '../mocks/romanticDemoProfiles';

export type ScoreReasons = {
  affection: string;
  compatibility: string;
  health: string;
  intensity: string;
};

type RelationshipLike = {
  status?: string;
  is_situationship?: boolean;
  green_flags?: string[];
  red_flags?: string[];
  affection_score?: number;
  compatibility_score?: number;
  relationship_health?: number;
  emotional_intensity?: number;
  metadata?: {
    signals?: {
      signal_strength?: 'low' | 'moderate' | 'high';
      evidence_strength?: number;
      score_reasons?: Partial<ScoreReasons>;
    };
  };
};

type AnalyticsLike = {
  affectionScore?: number;
  compatibilityScore?: number;
  healthScore?: number;
  intensityScore?: number;
  greenFlags?: string[];
  redFlags?: string[];
};

const KEY_TO_REASON: Record<DemoMetricKey, keyof ScoreReasons> = {
  affection: 'affection',
  compatibility: 'compatibility',
  health: 'health',
  intensity: 'intensity',
};

/**
 * Prefer server-persisted reasons; otherwise craft a short fallback from the
 * signals and flags already on the relationship (so mobile cards never look blank).
 */
export function pickMetricReason(
  key: DemoMetricKey,
  relationship: RelationshipLike | null | undefined,
  analytics?: AnalyticsLike | null,
  dateCount = 0,
): string {
  const stored = relationship?.metadata?.signals?.score_reasons?.[KEY_TO_REASON[key]];
  if (stored && stored.trim()) return stored;

  const signalStrength = relationship?.metadata?.signals?.signal_strength;
  const status = (relationship?.status ?? 'active').toLowerCase();
  const green = relationship?.green_flags?.length
    ? relationship.green_flags
    : analytics?.greenFlags ?? [];
  const red = relationship?.red_flags?.length
    ? relationship.red_flags
    : analytics?.redFlags ?? [];

  if (signalStrength === 'low' || (dateCount === 0 && green.length + red.length === 0)) {
    switch (key) {
      case 'affection':
        return 'Still learning — not enough mentions yet';
      case 'compatibility':
        return 'Early — fit needs more shared history';
      case 'health':
        return 'Thin evidence — health stays near neutral';
      case 'intensity':
        return 'Sparse contact keeps connection intensity low';
    }
  }

  switch (key) {
    case 'affection':
      if (green.some((g) => /mutual|warm|positive|affection/i.test(g))) {
        return 'Warm, positive signals in your story';
      }
      if (red.some((r) => /ghost|block|unrequited|fading/i.test(r))) {
        return 'Cooling signals are holding affection down';
      }
      return dateCount >= 3
        ? 'Shared time together lifts affection'
        : 'Based on how often and warmly you mention them';
    case 'compatibility':
      if (relationship?.is_situationship) {
        return 'Undefined setup holds fit below a clear bond';
      }
      if (red.some((r) => /conflict|ambiguous|friction/i.test(r))) {
        return 'Friction keeps dragging fit downward';
      }
      if (green.some((g) => /positive|mutual|time|active/i.test(g))) {
        return 'Positives outweigh conflict in the record';
      }
      return 'Blend of positivity, conflict, and longevity';
    case 'health':
      if (['ended', 'ghosted', 'blocked', 'fading', 'unrequited', 'complicated'].includes(status)) {
        return `${status.replace(/_/g, ' ')} status is pressing on health`;
      }
      if (red.some((r) => /conflict|fixation|ghost|block/i.test(r))) {
        return 'Warning flags are pulling health down';
      }
      if (status === 'active' && green.length > 0) {
        return 'Active contact keeps the bond viable';
      }
      return 'Viability from contact, reciprocity, and conflict';
    case 'intensity':
      if (dateCount >= 3 || green.some((g) => /active|recent|frequent/i.test(g))) {
        return 'Lots of recent charged contact';
      }
      if (red.some((r) => /fading|ghost|quiet/i.test(r))) {
        return 'Connection softens when mentions go quiet';
      }
      return 'Volume and emotional charge of your contact';
  }
}
