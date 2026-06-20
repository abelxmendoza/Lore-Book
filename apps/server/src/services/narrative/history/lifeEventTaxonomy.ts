/** Canonical life-event categories for Phase 2 history engine. */
export type LifeEventCategory =
  | 'education'
  | 'career'
  | 'move'
  | 'achievement'
  | 'failure'
  | 'health'
  | 'financial'
  | 'social'
  | 'relationship'
  | 'life_context'
  | 'other';

export type RelationshipEventSubtype =
  | 'first_meeting'
  | 'conflict'
  | 'reconciliation'
  | 'separation'
  | 'drift'
  | 'milestone';

export const LIFE_EVENT_CATEGORY_LABELS: Record<LifeEventCategory, string> = {
  education: 'Education',
  career: 'Career',
  move: 'Move',
  achievement: 'Achievement',
  failure: 'Setback',
  health: 'Health',
  financial: 'Financial',
  social: 'Social',
  relationship: 'Relationship',
  life_context: 'Life context',
  other: 'Other',
};

export const RELATIONSHIP_SUBTYPE_LABELS: Record<RelationshipEventSubtype, string> = {
  first_meeting: 'First meeting',
  conflict: 'Conflict',
  reconciliation: 'Reconciliation',
  separation: 'Separation',
  drift: 'Drift',
  milestone: 'Milestone',
};

type ClassificationRule = {
  category: LifeEventCategory;
  relationshipSubtype?: RelationshipEventSubtype;
  regex: RegExp;
  weight: number;
};

const CLASSIFICATION_RULES: ClassificationRule[] = [
  { category: 'relationship', relationshipSubtype: 'separation', regex: /\b(break\s*up|broke up|split up|blocked|no contact|divorc)\b/i, weight: 0.9 },
  { category: 'relationship', relationshipSubtype: 'conflict', regex: /\b(fight|argument|conflict|disagree|betray|cheat|lied to me)\b/i, weight: 0.85 },
  { category: 'relationship', relationshipSubtype: 'reconciliation', regex: /\b(reconcil|made up|forgave|worked (it )?out)\b/i, weight: 0.8 },
  { category: 'relationship', relationshipSubtype: 'first_meeting', regex: /\b(met (for the )?first time|first met|introduced to|started dating)\b/i, weight: 0.75 },
  { category: 'relationship', relationshipSubtype: 'milestone', regex: /\b(engaged|married|wedding|anniversary|moved in together)\b/i, weight: 0.85 },
  { category: 'relationship', relationshipSubtype: 'drift', regex: /\b(grew apart|drifted|lost touch|faded|stopped talking)\b/i, weight: 0.7 },
  { category: 'relationship', regex: /\b(relationship|partner|boyfriend|girlfriend|spouse|romantic|dating)\b/i, weight: 0.65 },
  { category: 'education', regex: /\b(graduat|degree|college|university|school|studied|enrolled|thesis|diploma)\b/i, weight: 0.85 },
  { category: 'career', regex: /\b(new job|started (at|working)|onboarding|hired|promoted|resigned|quit|laid off|fired|interview|offer letter)\b/i, weight: 0.85 },
  { category: 'move', regex: /\b(moved to|relocat|new apartment|new city|moved out|immigrat)\b/i, weight: 0.8 },
  { category: 'achievement', regex: /\b(won|achieved|succeeded|landed|earned|launched|shipped|published|award)\b/i, weight: 0.75 },
  { category: 'failure', regex: /\b(failed|rejected|bankrupt|collapsed|setback|missed deadline)\b/i, weight: 0.8 },
  { category: 'health', regex: /\b(hospital|surgery|diagnos|therapy|injury|illness|recovery|mental health)\b/i, weight: 0.85 },
  { category: 'financial', regex: /\b(debt|mortgage|invest|savings|bankrupt|salary|raise|bonus|stock)\b/i, weight: 0.75 },
  { category: 'social', regex: /\b(party|gathering|community|friends|network|meetup|club)\b/i, weight: 0.6 },
];

const LEGACY_TYPE_MAP: Record<string, LifeEventCategory> = {
  career_event: 'career',
  relationship_event: 'relationship',
  relationship_conflict: 'relationship',
  relationship_separation: 'relationship',
  living_situation: 'move',
  life_context: 'life_context',
  activity: 'social',
};

export type LifeEventClassification = {
  category: LifeEventCategory;
  relationshipSubtype: RelationshipEventSubtype | null;
  confidence: number;
  matchedRule: string | null;
};

export function classifyLifeEventText(
  title: string,
  summary: string | null,
  legacyType?: string | null,
): LifeEventClassification {
  const text = `${title} ${summary ?? ''}`.trim();
  let best: ClassificationRule | null = null;

  for (const rule of CLASSIFICATION_RULES) {
    if (!rule.regex.test(text)) continue;
    if (!best || rule.weight > best.weight) best = rule;
  }

  if (best) {
    return {
      category: best.category,
      relationshipSubtype: best.relationshipSubtype ?? null,
      confidence: best.weight,
      matchedRule: best.regex.source.slice(0, 48),
    };
  }

  if (legacyType && LEGACY_TYPE_MAP[legacyType]) {
    const category = LEGACY_TYPE_MAP[legacyType];
    return {
      category,
      relationshipSubtype:
        legacyType === 'relationship_conflict'
          ? 'conflict'
          : legacyType === 'relationship_separation'
            ? 'separation'
            : null,
      confidence: 0.7,
      matchedRule: `legacy:${legacyType}`,
    };
  }

  return {
    category: 'other',
    relationshipSubtype: null,
    confidence: 0.4,
    matchedRule: null,
  };
}

export function computeEventSignificance(input: {
  confidence: number;
  category: LifeEventCategory;
  relationshipSubtype: RelationshipEventSubtype | null;
  peopleCount: number;
  evidenceCount: number;
  emotionalIntensity?: number | null;
}): number {
  const categoryBoost: Partial<Record<LifeEventCategory, number>> = {
    career: 0.12,
    relationship: 0.1,
    education: 0.1,
    move: 0.08,
    achievement: 0.08,
    failure: 0.1,
    health: 0.12,
  };

  const subtypeBoost: Partial<Record<RelationshipEventSubtype, number>> = {
    separation: 0.15,
    milestone: 0.12,
    conflict: 0.08,
    reconciliation: 0.07,
    first_meeting: 0.05,
  };

  const socialImpact = Math.min(0.12, input.peopleCount * 0.03);
  const evidenceBoost = Math.min(0.1, input.evidenceCount * 0.025);
  const emotionalBoost = input.emotionalIntensity != null
    ? Math.min(0.1, Math.abs(input.emotionalIntensity) * 0.08)
    : 0;

  const raw =
    input.confidence * 0.45 +
    (categoryBoost[input.category] ?? 0) +
    (input.relationshipSubtype ? (subtypeBoost[input.relationshipSubtype] ?? 0) : 0) +
    socialImpact +
    evidenceBoost +
    emotionalBoost;

  return Math.round(Math.min(0.99, Math.max(0.05, raw)) * 100) / 100;
}
