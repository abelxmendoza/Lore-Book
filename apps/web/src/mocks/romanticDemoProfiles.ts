/**
 * Per-relationship demo personas for Love & Relationships modals.
 * Each card showcases a different slice of what LoreBook can infer — without
 * dumping the same four percentages on every profile.
 */

import type { MockRelationshipAnalytics } from './romanticRelationships';

export type DemoMetricKey = 'affection' | 'compatibility' | 'health' | 'intensity';

export type RomanticDemoProfile = {
  /** One-line human read on this bond — shown at top of Overview */
  headline: string;
  /** Short filter-friendly label (matches Love & Relationships tabs) */
  showcaseTag: string;
  /** Which scores to surface in Overview (omit the rest) */
  primaryMetrics: DemoMetricKey[];
  /** Overview layout emphasis */
  overviewEmphasis: 'balanced' | 'minimal' | 'flags' | 'closure' | 'intensity';
  /** Show attachment / fixation bars (hide for thin early-stage stories) */
  showAttachmentDynamics: boolean;
  /** Analytics tab: full dashboard vs story-first (no duplicate bars) */
  analyticsVariant: 'full' | 'story';
  /** Optional mock drift + cycles for Analytics tab in demo mode */
  patterns?: {
    drift?: {
      driftType: string;
      driftStrength?: number;
      timeSinceLastMentionDays?: number;
    };
    cycles?: Array<{
      cycleType: string;
      cycleStrength?: number;
      cycleFrequency?: string;
      patternDescription?: string;
    }>;
  };
};

const CUSTOM_ANALYTICS: Record<string, Pick<MockRelationshipAnalytics, 'insights' | 'recommendations' | 'affectionTrend' | 'healthTrend'>> = {
  'rel-001': {
    affectionTrend: 'increasing',
    healthTrend: 'improving',
    insights: [
      'You talk about Alex when describing stability — she shows up in career and recovery entries, not just date nights.',
      'Exclusivity reads as mutual; the main friction is schedule, not trust.',
    ],
    recommendations: [
      'Protect a recurring low-key ritual (walk, coffee) when work gets loud — that is when you feel most connected.',
    ],
  },
  'rel-002': {
    affectionTrend: 'stable',
    healthTrend: 'stable',
    insights: [
      'Jordan is mostly group-context and late-night texts — LoreBook has chemistry signals, not a defined bond yet.',
      'Mixed replies are the main pattern; you journal more when their tone shifts.',
    ],
    recommendations: [
      'One clear in-person hang would tell you more than another week of reading emojis.',
    ],
  },
  'rel-003': {
    affectionTrend: 'stable',
    healthTrend: 'stable',
    insights: [
      'Sam fits the situationship shape: fun in the moment, vague about tomorrow.',
      'Your entries turn restless when they vanish for days — you want clarity more than you admit.',
    ],
    recommendations: [
      'Name what you actually want (even privately) before the next sleepover — ambiguity is costing you peace.',
    ],
  },
  'rel-004': {
    affectionTrend: 'decreasing',
    healthTrend: 'declining',
    insights: [
      'Taylor still lives in adventure memories — fights and trips are equally vivid.',
      'Jealousy spiked when you felt uncertain elsewhere; passion masked misaligned goals.',
    ],
    recommendations: [
      'Keep the lessons, not the fantasy of redoing the same fights with better timing.',
    ],
  },
  'rel-005': {
    affectionTrend: 'stable',
    healthTrend: 'declining',
    insights: [
      'Morgan is the reference point for “too much, too fast” — depth without repair burned you both.',
      'Intellectual mirroring made merging identities feel romantic until it wasn’t.',
    ],
    recommendations: [
      'Watch for pace over poetry in new connections — intensity isn’t destiny.',
    ],
  },
  'rel-006': {
    affectionTrend: 'increasing',
    healthTrend: 'stable',
    insights: [
      'Casey is mostly surface sparkle so far — charisma reads loud, knowing them reads quiet.',
    ],
    recommendations: [
      'Slow down before upgrading a crush; one boring Tuesday together tells you more than three parties.',
    ],
  },
  'rel-007': {
    affectionTrend: 'decreasing',
    healthTrend: 'declining',
    insights: [
      'Riley’s arc ends in silence, not a conversation — that gap is what your journal keeps circling.',
    ],
    recommendations: [
      'Treat ghosting as data: you don’t owe closure to someone who didn’t offer it.',
    ],
  },
  'rel-008': {
    affectionTrend: 'decreasing',
    healthTrend: 'declining',
    insights: [
      'Nova’s story is heat then a hard stop — blocked means the boundary is the answer.',
    ],
    recommendations: [
      'Honor the block as final unless they reach out with repair, not nostalgia.',
    ],
  },
  'rel-009': {
    affectionTrend: 'stable',
    healthTrend: 'improving',
    insights: [
      'Elena is the “kind ending” counterexample — respect survived even when logistics didn’t.',
      'Rekindled status is curiosity, not a plan — you note timing more than longing.',
    ],
    recommendations: [
      'Any reopening needs a real talk about distance and timing, not a nostalgic text.',
    ],
  },
};

const DEMO_PROFILES: Record<string, RomanticDemoProfile> = {
  'rel-001': {
    headline: 'Your steadiest anchor — ambition and intimacy in the same sentence.',
    showcaseTag: 'Exclusive · Active partner',
    primaryMetrics: ['affection', 'compatibility', 'health', 'intensity'],
    overviewEmphasis: 'balanced',
    showAttachmentDynamics: true,
    analyticsVariant: 'story',
    patterns: {
      drift: { driftType: 'growing_closer', driftStrength: 0.72, timeSinceLastMentionDays: 2 },
    },
  },
  'rel-002': {
    headline: 'Early crush energy — chemistry in chat, history still thin.',
    showcaseTag: 'Crush · Still learning',
    primaryMetrics: ['affection', 'intensity'],
    overviewEmphasis: 'minimal',
    showAttachmentDynamics: false,
    analyticsVariant: 'story',
    patterns: {
      drift: { driftType: 'stable', driftStrength: 0.35, timeSinceLastMentionDays: 4 },
    },
  },
  'rel-003': {
    headline: 'Fun without a label — the tension is whether you want more.',
    showcaseTag: 'Situationship · Not exclusive',
    primaryMetrics: ['health', 'intensity'],
    overviewEmphasis: 'flags',
    showAttachmentDynamics: true,
    analyticsVariant: 'story',
    patterns: {
      cycles: [
        {
          cycleType: 'push_pull',
          cycleStrength: 0.58,
          cycleFrequency: 'weekly',
          patternDescription: 'Warm weekends, vague weekdays — closeness spikes then distance returns.',
        },
      ],
    },
  },
  'rel-004': {
    headline: 'Passion ran hot; compatibility couldn’t keep pace.',
    showcaseTag: 'Past · Ended',
    primaryMetrics: ['compatibility', 'intensity'],
    overviewEmphasis: 'closure',
    showAttachmentDynamics: true,
    analyticsVariant: 'story',
    patterns: {
      drift: { driftType: 'drifting_apart', driftStrength: 0.81, timeSinceLastMentionDays: 180 },
    },
  },
  'rel-005': {
    headline: 'The deepest bandwidth you ever spent on one person.',
    showcaseTag: 'Past · High intensity',
    primaryMetrics: ['intensity', 'affection'],
    overviewEmphasis: 'intensity',
    showAttachmentDynamics: true,
    analyticsVariant: 'full',
    patterns: {
      cycles: [
        {
          cycleType: 'toxic_pattern',
          cycleStrength: 0.74,
          cycleFrequency: 'monthly',
          patternDescription: 'Merge → rupture → reunion — repair never kept up with heat.',
        },
      ],
    },
  },
  'rel-006': {
    headline: 'Mostly butterflies — separating crush from real connection.',
    showcaseTag: 'Infatuation · Early',
    primaryMetrics: ['affection', 'intensity'],
    overviewEmphasis: 'minimal',
    showAttachmentDynamics: false,
    analyticsVariant: 'story',
  },
  'rel-007': {
    headline: 'Chemistry, then silence — the story stops mid-sentence.',
    showcaseTag: 'Ghosted · No contact',
    primaryMetrics: ['health'],
    overviewEmphasis: 'flags',
    showAttachmentDynamics: false,
    analyticsVariant: 'story',
    patterns: {
      drift: { driftType: 'breaking_up', driftStrength: 0.9, timeSinceLastMentionDays: 45 },
    },
  },
  'rel-008': {
    headline: 'Heat, then a hard stop — the boundary is the message.',
    showcaseTag: 'Blocked · High risk',
    primaryMetrics: ['intensity', 'health'],
    overviewEmphasis: 'flags',
    showAttachmentDynamics: true,
    analyticsVariant: 'story',
    patterns: {
      drift: { driftType: 'breaking_up', driftStrength: 0.95, timeSinceLastMentionDays: 120 },
      cycles: [
        {
          cycleType: 'hot_cold',
          cycleStrength: 0.82,
          cycleFrequency: 'irregular',
          patternDescription: 'Intensity without repair — closeness spiked, then contact ended abruptly.',
        },
      ],
    },
  },
  'rel-009': {
    headline: 'Ended gently — compatibility stayed even when timing didn’t.',
    showcaseTag: 'Past · Rekindled potential',
    primaryMetrics: ['compatibility', 'health'],
    overviewEmphasis: 'closure',
    showAttachmentDynamics: false,
    analyticsVariant: 'story',
    patterns: {
      drift: { driftType: 'reconnecting', driftStrength: 0.48, timeSinceLastMentionDays: 30 },
    },
  },
};

export function getRomanticDemoProfile(relationshipId: string): RomanticDemoProfile | undefined {
  return DEMO_PROFILES[relationshipId];
}

export function getRomanticDemoPatterns(relationshipId: string) {
  return DEMO_PROFILES[relationshipId]?.patterns;
}

export function enrichMockAnalytics(
  relationshipId: string,
  base: MockRelationshipAnalytics
): MockRelationshipAnalytics {
  const custom = CUSTOM_ANALYTICS[relationshipId];
  if (!custom) return base;
  return { ...base, ...custom };
}

export function metricLabel(key: DemoMetricKey): string {
  const labels: Record<DemoMetricKey, string> = {
    affection: 'Affection',
    compatibility: 'Fit',
    health: 'Health',
    intensity: 'Connection',
  };
  return labels[key];
}

export function pickMetricValue(key: DemoMetricKey, analytics: MockRelationshipAnalytics): number {
  switch (key) {
    case 'affection':
      return analytics.affectionScore;
    case 'compatibility':
      return analytics.compatibilityScore;
    case 'health':
      return analytics.healthScore;
    case 'intensity':
      return analytics.intensityScore;
  }
}
