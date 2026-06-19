import { getMockRomanticRelationships } from './romanticRelationships';

export type MockRelationshipInfluence = {
  autobiographical_impact: number;
  impact_label: string;
  impact_summary?: string;
  life_arcs_influenced: Array<{
    id: string;
    title: string;
    arc_type?: string;
    confidence?: number;
  }>;
  knowledge_claims_crystallized: Array<{ id: string; evidence_summary: string }>;
  breakup_aftermath?: {
    closure_level?: number;
    recovery_status?: string;
  };
  relationship_patterns?: Array<{
    pattern_description?: string;
    pattern_type?: string;
    frequency?: number;
  }>;
};

const MOCK_INFLUENCE_BY_REL_ID: Record<string, MockRelationshipInfluence> = {
  'rel-001': {
    autobiographical_impact: 0.88,
    impact_label: 'Transformative',
    impact_summary:
      'Alex became your anchor while you bet on LoreBook — she made ambition feel compatible with intimacy, not opposed to it.',
    life_arcs_influenced: [
      { id: 'arc-alex-1', title: 'Creative career leap', arc_type: 'career', confidence: 0.94 },
      { id: 'arc-alex-2', title: 'Building a steady partnership', arc_type: 'relationship', confidence: 0.91 },
      { id: 'arc-alex-3', title: 'Outdoor rhythm & recovery habits', arc_type: 'health', confidence: 0.78 },
    ],
    knowledge_claims_crystallized: [
      {
        id: 'kc-alex-1',
        evidence_summary:
          'You can pursue big creative bets without burning the relationship — Alex responds to honesty, not perfection.',
      },
      {
        id: 'kc-alex-2',
        evidence_summary:
          'Shared hikes and long talks are how you regulate stress; losing that rhythm shows up fast in your journal tone.',
      },
    ],
    relationship_patterns: [
      {
        pattern_description: 'You open up most after physical activity together — walks and hikes unlock deeper talks.',
        pattern_type: 'regulation_together',
        frequency: 12,
      },
    ],
  },
  'rel-002': {
    autobiographical_impact: 0.44,
    impact_label: 'Emerging',
    impact_summary:
      'Jordan sparks curiosity and creative energy, but the story is still thin — more signal than history so far.',
    life_arcs_influenced: [
      { id: 'arc-jordan-1', title: 'Testing attraction without rushing labels', arc_type: 'exploration', confidence: 0.72 },
      { id: 'arc-jordan-2', title: 'Art & nightlife social expansion', arc_type: 'social', confidence: 0.65 },
    ],
    knowledge_claims_crystallized: [
      {
        id: 'kc-jordan-1',
        evidence_summary:
          'Ambiguous crushes energize you creatively but also make it hard to focus — you journal more when signals are unclear.',
      },
    ],
    relationship_patterns: [
      {
        pattern_description: 'You replay small interactions looking for meaning when replies are inconsistent.',
        pattern_type: 'signal_seeking',
        frequency: 5,
      },
    ],
  },
  'rel-003': {
    autobiographical_impact: 0.58,
    impact_label: 'Significant',
    impact_summary:
      'Sam kept things light on paper, but the undefined status quietly shaped how you think about commitment and boundaries.',
    life_arcs_influenced: [
      { id: 'arc-sam-1', title: 'Negotiating undefined intimacy', arc_type: 'relationship', confidence: 0.86 },
      { id: 'arc-sam-2', title: 'Weekend social spontaneity', arc_type: 'lifestyle', confidence: 0.71 },
    ],
    knowledge_claims_crystallized: [
      {
        id: 'kc-sam-1',
        evidence_summary:
          'Situationships can feel freeing until you want clarity — your entries shift from fun to restless when boundaries blur.',
      },
      {
        id: 'kc-sam-2',
        evidence_summary:
          'Honesty about non-exclusivity helped more than pretending you did not care.',
      },
    ],
    relationship_patterns: [
      {
        pattern_description: 'You tolerate ambiguity longer with people who are fun in the moment but vague about future intent.',
        pattern_type: 'ambiguous_tolerance',
        frequency: 3,
      },
    ],
  },
  'rel-004': {
    autobiographical_impact: 0.76,
    impact_label: 'Formative',
    impact_summary:
      'Taylor pushed you into adventure and intensity — the breakup taught you where passion ends and compatibility begins.',
    life_arcs_influenced: [
      { id: 'arc-taylor-1', title: 'Travel & risk-taking chapter', arc_type: 'adventure', confidence: 0.89 },
      { id: 'arc-taylor-2', title: 'Learning limits of jealousy & control', arc_type: 'growth', confidence: 0.84 },
    ],
    knowledge_claims_crystallized: [
      {
        id: 'kc-taylor-1',
        evidence_summary:
          'High chemistry does not guarantee aligned life goals — you still reference the trips, not just the fights.',
      },
      {
        id: 'kc-taylor-2',
        evidence_summary:
          'Frequent conflict eroded trust faster than distance ever did.',
      },
    ],
    breakup_aftermath: {
      closure_level: 0.72,
      recovery_status: 'mostly_healed',
    },
    relationship_patterns: [
      {
        pattern_description: 'Jealousy spikes correlate with periods when you felt career uncertainty.',
        pattern_type: 'conflict_under_stress',
        frequency: 4,
      },
    ],
  },
  'rel-005': {
    autobiographical_impact: 0.82,
    impact_label: 'Intense',
    impact_summary:
      'Morgan marked the deepest emotional bandwidth you have spent on one person — growth came with exhaustion.',
    life_arcs_influenced: [
      { id: 'arc-morgan-1', title: 'Intellectual & emotional depth pursuit', arc_type: 'identity', confidence: 0.92 },
      { id: 'arc-morgan-2', title: 'Codependency awareness', arc_type: 'growth', confidence: 0.88 },
    ],
    knowledge_claims_crystallized: [
      {
        id: 'kc-morgan-1',
        evidence_summary:
          'Intensity can feel like destiny — you now watch for losing yourself inside someone else’s mood.',
      },
      {
        id: 'kc-morgan-2',
        evidence_summary:
          'The conversations were real; the pace was not sustainable for either of you.',
      },
    ],
    breakup_aftermath: {
      closure_level: 0.61,
      recovery_status: 'still_processing',
    },
    relationship_patterns: [
      {
        pattern_description: 'You merge identities when someone mirrors your ambitions too perfectly.',
        pattern_type: 'identity_merge',
        frequency: 2,
      },
    ],
  },
  'rel-006': {
    autobiographical_impact: 0.38,
    impact_label: 'Early',
    impact_summary:
      'Casey is mostly butterflies and projection so far — the lore is still deciding whether this becomes real connection.',
    life_arcs_influenced: [
      { id: 'arc-casey-1', title: 'Infatuation vs genuine knowing', arc_type: 'exploration', confidence: 0.68 },
    ],
    knowledge_claims_crystallized: [
      {
        id: 'kc-casey-1',
        evidence_summary:
          'Charisma alone is not compatibility — you are learning to slow down before upgrading a crush in your story.',
      },
    ],
  },
  'rel-007': {
    autobiographical_impact: 0.52,
    impact_label: 'Disruptive',
    impact_summary:
      'Riley’s ghosting left a sharp lesson about ambiguity after intimacy — short arc, long aftertaste.',
    life_arcs_influenced: [
      { id: 'arc-riley-1', title: 'Trust after sudden silence', arc_type: 'recovery', confidence: 0.81 },
    ],
    knowledge_claims_crystallized: [
      {
        id: 'kc-riley-1',
        evidence_summary:
          'Disappearing without explanation hurts more when there was real chemistry — closure matters as much as chemistry.',
      },
    ],
    breakup_aftermath: {
      closure_level: 0.28,
      recovery_status: 'unresolved',
    },
    relationship_patterns: [
      {
        pattern_description: 'You blame yourself first when someone goes quiet — then anger follows in later entries.',
        pattern_type: 'self_blame_then_anger',
        frequency: 2,
      },
    ],
  },
  'rel-008': {
    autobiographical_impact: 0.79,
    impact_label: 'Scarring',
    impact_summary:
      'Nova’s intensity followed by a hard cutoff reshaped how you handle blocked endings and emotional volatility.',
    life_arcs_influenced: [
      { id: 'arc-nova-1', title: 'Boundaries after volatile love', arc_type: 'growth', confidence: 0.9 },
      { id: 'arc-nova-2', title: 'Rebuilding trust in your own judgment', arc_type: 'identity', confidence: 0.83 },
    ],
    knowledge_claims_crystallized: [
      {
        id: 'kc-nova-1',
        evidence_summary:
          'A blocked door is information — reaching through it would disrespect the boundary you set together.',
      },
      {
        id: 'kc-nova-2',
        evidence_summary:
          'Heat without repair cycles into damage; you now name that pattern early in new connections.',
      },
    ],
    breakup_aftermath: {
      closure_level: 0.45,
      recovery_status: 'guarded_recovery',
    },
    relationship_patterns: [
      {
        pattern_description: 'High intensity + poor repair predicts endings you still feel in your body before your mind.',
        pattern_type: 'intensity_without_repair',
        frequency: 3,
      },
    ],
  },
  'rel-009': {
    autobiographical_impact: 0.64,
    impact_label: 'Meaningful',
    impact_summary:
      'Elena ended with respect intact — timing failed you, not kindness — and that still shapes what you want next.',
    life_arcs_influenced: [
      { id: 'arc-elena-1', title: 'Long-distance & life timing', arc_type: 'relationship', confidence: 0.87 },
      { id: 'arc-elena-2', title: 'Healthy endings as a model', arc_type: 'growth', confidence: 0.8 },
    ],
    knowledge_claims_crystallized: [
      {
        id: 'kc-elena-1',
        evidence_summary:
          'Compatibility can stay strong while logistics fail — you reference Elena when talking about mature closure.',
      },
      {
        id: 'kc-elena-2',
        evidence_summary:
          'Reopening something requires a real conversation, not nostalgia alone.',
      },
    ],
    breakup_aftermath: {
      closure_level: 0.84,
      recovery_status: 'peaceful_distance',
    },
  },
};

export function getMockRelationshipInfluence(relationshipId: string): MockRelationshipInfluence | undefined {
  return MOCK_INFLUENCE_BY_REL_ID[relationshipId];
}

export function getMockRelationshipInfluenceForPerson(
  personId?: string,
  personName?: string,
): MockRelationshipInfluence | undefined {
  const rel =
    (personId ? getMockRomanticRelationships().find((r) => r.person_id === personId) : undefined) ??
    (personName
      ? getMockRomanticRelationships().find(
          (r) => r.person_name?.toLowerCase() === personName.toLowerCase(),
        )
      : undefined);
  if (!rel) return undefined;
  return getMockRelationshipInfluence(rel.id);
}

export function getMockRomanticRelationshipByPersonId(personId: string) {
  return getMockRomanticRelationships().find((r) => r.person_id === personId);
}

export function getMockRomanticRelationshipByPersonName(name: string) {
  const key = name.trim().toLowerCase();
  return getMockRomanticRelationships().find((r) => r.person_name?.toLowerCase() === key);
}

export function getMockRomanticRelationshipForCharacter(personId: string, personName?: string) {
  return (
    getMockRomanticRelationshipByPersonId(personId) ??
    (personName ? getMockRomanticRelationshipByPersonName(personName) : undefined)
  );
}

export function resolveMockRelationshipInfluence(opts: {
  relationshipId?: string;
  personId?: string;
  personName?: string;
}): MockRelationshipInfluence | undefined {
  if (opts.relationshipId) {
    const direct = getMockRelationshipInfluence(opts.relationshipId);
    if (direct) return direct;
  }
  return getMockRelationshipInfluenceForPerson(opts.personId, opts.personName);
}
