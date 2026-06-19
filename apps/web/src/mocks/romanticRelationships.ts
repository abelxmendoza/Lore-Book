// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.
// Mock Data for Love & Relationships Section

import type { CharacterSuggestion } from '../api/entitySuggestions';
import { enrichMockAnalytics } from './romanticDemoProfiles';

export type MockRomanticRelationship = {
  id: string;
  person_id: string;
  person_type: 'character' | 'omega_entity';
  person_name: string;
  relationship_type: string;
  status: string;
  is_current: boolean;
  affection_score: number;
  emotional_intensity: number;
  compatibility_score: number;
  relationship_health: number;
  is_situationship: boolean;
  exclusivity_status?: string;
  strengths: string[];
  weaknesses: string[];
  pros: string[];
  cons: string[];
  red_flags: string[];
  green_flags: string[];
  start_date?: string;
  end_date?: string;
  created_at: string;
  rank_among_all?: number;
  rank_among_active?: number;
  // Sprint AD: deterministic dynamics (attachment + obsession) for demo showcase.
  metadata?: {
    signals?: {
      obsession_score?: number;
      attachment_intensity?: number;
      evidence_strength?: number;
      signal_strength?: 'low' | 'moderate' | 'high';
    };
  } & Record<string, unknown>;
};

/**
 * Sprint AD demo showcase: derive attachment + obsession signals from a mock
 * relationship's own fields so demo cards/modals light up the new UI exactly
 * like real, enriched relationships do.
 */
const FIXATION_TYPES = new Set(['crush', 'obsession', 'infatuation', 'lust', 'situationship']);

import { getLoreLexicalSnippetMap } from './romanticLoreStory';

function withDemoSignals(rel: MockRomanticRelationship): MockRomanticRelationship {
  const status = rel.status.toLowerCase();
  const type = rel.relationship_type.toLowerCase();
  const clamp = (n: number) => Math.max(0, Math.min(1, Math.round(n * 100) / 100));

  const attachment_intensity = clamp(
    rel.emotional_intensity * 0.5 +
    rel.affection_score * 0.3 +
    (FIXATION_TYPES.has(type) ? 0.2 : 0)
  );
  const obsession_score = clamp(
    (status === 'ghosted' || status === 'blocked' ? 0.4 : 0) +    // pining after cut-off
    (type === 'obsession' || type === 'infatuation' ? 0.4 : 0) +
    (rel.is_situationship && rel.relationship_health < 0.5 ? 0.3 : 0) +
    (type === 'crush' ? 0.25 : 0) +
    attachment_intensity * 0.25
  );
  // Most curated demo rows are evidence-rich; the early "talking/crush" ones are
  // intentionally thin to showcase the "Still Learning" state.
  const evidence_strength = clamp(
    (rel.red_flags.length + rel.green_flags.length) * 0.15 +
    (rel.is_current ? 0.3 : 0.2) +
    rel.affection_score * 0.3
  );
  const signal_strength: 'low' | 'moderate' | 'high' =
    type === 'talking' || (type === 'crush' && rel.green_flags.length === 0) ? 'low'
    : evidence_strength >= 0.6 ? 'high'
    : 'moderate';

  const lexical = getLoreLexicalSnippetMap()[rel.person_name];
  const glossary_cues = lexical
    ? [lexical.cue]
    : type === 'situationship'
      ? ['situationship']
      : type.startsWith('ex_')
        ? ['my ex', 'broke up']
        : ['dating'];

  return {
    ...rel,
    metadata: {
      ...(rel.metadata ?? {}),
      signals: { obsession_score, attachment_intensity, evidence_strength, signal_strength },
      lexical_evidence: lexical?.snippet ?? rel.pros[0] ?? rel.strengths[0],
      glossary_cues,
      ontology_tags: ['CONCEPT/RELATIONSHIP_VERB'],
      parsing: 'lexical_intelligence',
      lore_chapter: ROMANTIC_LORE_CHAPTER_BY_NAME[rel.person_name],
    },
  };
}

const ROMANTIC_LORE_CHAPTER_BY_NAME: Record<string, number> = {
  Morgan: 1,
  Nova: 1,
  Taylor: 2,
  Jordan: 2,
  Alex: 3,
  Sam: 3,
  Casey: 3,
  Riley: 4,
  Elena: 4,
};

export type MockDateEvent = {
  id: string;
  date_type: string;
  date_time: string;
  location?: string;
  description?: string;
  sentiment?: number;
  was_positive?: boolean;
};

export type MockRelationshipAnalytics = {
  relationshipId: string;
  personId: string;
  personName: string;
  affectionScore: number;
  compatibilityScore: number;
  healthScore: number;
  intensityScore: number;
  strengths: string[];
  weaknesses: string[];
  pros: string[];
  cons: string[];
  redFlags: string[];
  greenFlags: string[];
  insights: string[];
  recommendations: string[];
  affectionTrend: string;
  healthTrend: string;
  calculatedAt: string;
};

/**
 * Generate comprehensive mock romantic relationships data
 */
export function generateMockRomanticRelationships(): MockRomanticRelationship[] {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const twoYearsAgo = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
  const threeYearsAgo = new Date(now.getTime() - 1095 * 24 * 60 * 60 * 1000);

  const base: MockRomanticRelationship[] = [
    // Active Relationship - High Compatibility
    {
      id: 'rel-001',
      person_id: 'char-001',
      person_type: 'character',
      person_name: 'Alex',
      relationship_type: 'girlfriend',
      status: 'active',
      is_current: true,
      affection_score: 0.92,
      emotional_intensity: 0.88,
      compatibility_score: 0.95,
      relationship_health: 0.90,
      is_situationship: false,
      exclusivity_status: 'exclusive',
      strengths: [
        'Great communication',
        'Supportive of my goals',
        'Makes me laugh',
        'We share similar values',
        'Respects my boundaries'
      ],
      weaknesses: [
        'Sometimes too busy with work',
        'Can be forgetful about small things'
      ],
      pros: [
        'She always remembers the little things I mention',
        'We have amazing conversations that last for hours',
        'She supports my career ambitions',
        'We share a love for hiking and nature',
        'She makes me feel safe and understood',
        'Great sense of humor',
        'We balance each other out perfectly',
        'Fun to be around'
      ],
      cons: [
        'She works long hours sometimes',
        'Not always great at planning dates',
        'Can be a bit messy',
        'Can be forgetful'
      ],
      red_flags: [
        'Long work stretches can leave little quality time — worth watching, not a dealbreaker',
      ],
      green_flags: [
        'Always follows through on promises',
        'Apologizes when wrong',
        'Respects my alone time',
        'We have healthy disagreements'
      ],
      start_date: sixMonthsAgo.toISOString(),
      created_at: sixMonthsAgo.toISOString(),
      rank_among_all: 1,
      rank_among_active: 1
    },

    // Active Crush
    {
      id: 'rel-002',
      person_id: 'char-002',
      person_type: 'character',
      person_name: 'Jordan',
      relationship_type: 'crush',
      status: 'active',
      is_current: true,
      affection_score: 0.75,
      emotional_intensity: 0.82,
      compatibility_score: 0.70,
      relationship_health: 0.65,
      is_situationship: false,
      exclusivity_status: undefined,
      strengths: [
        'Very attractive',
        'Interesting conversations',
        'Creative and artistic'
      ],
      weaknesses: [
        'Unclear about intentions',
        'Sometimes hard to read'
      ],
      pros: [
        'Incredibly attractive',
        'We have great chemistry',
        'Interesting perspectives on life',
        'Makes me feel excited',
        'Creative and inspiring'
      ],
      cons: [
        'Not sure if they feel the same',
        'Hard to read their signals',
        'We don\'t know each other that well yet'
      ],
      red_flags: [
        'Mixed signals — replies inconsistently and keeps intentions vague',
      ],
      green_flags: [
        'They seem interested in getting to know me',
        'Mutual friends say good things'
      ],
      start_date: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      rank_among_all: 3,
      rank_among_active: 2
    },

    // Ghosted — real endings aren't always clean breakups
    {
      id: 'rel-007',
      person_id: 'char-005',
      person_type: 'character',
      person_name: 'Riley',
      relationship_type: 'hooking_up',
      status: 'ghosted',
      is_current: false,
      affection_score: 0.4,
      emotional_intensity: 0.6,
      compatibility_score: 0.35,
      relationship_health: 0.1,
      is_situationship: true,
      exclusivity_status: undefined,
      strengths: ['Great chemistry early on'],
      weaknesses: ['Communication dropped off completely'],
      pros: ['Fun while it lasted'],
      cons: ['Left on read for two weeks', 'Never explained what changed'],
      red_flags: ['Disappeared without a word'],
      green_flags: [],
      start_date: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      rank_among_all: 5,
      rank_among_active: 0
    },

    // Situationship
    {
      id: 'rel-003',
      person_id: 'char-003',
      person_type: 'character',
      person_name: 'Sam',
      relationship_type: 'situationship',
      status: 'active',
      is_current: true,
      affection_score: 0.65,
      emotional_intensity: 0.70,
      compatibility_score: 0.60,
      relationship_health: 0.55,
      is_situationship: true,
      exclusivity_status: 'not_exclusive',
      strengths: [
        'Fun to be around',
        'No pressure or expectations'
      ],
      weaknesses: [
        'Lack of commitment',
        'Unclear boundaries',
        'Emotional distance'
      ],
      pros: [
        'We have fun together',
        'No pressure or expectations',
        'Good physical chemistry',
        'Flexible arrangement'
      ],
      cons: [
        'Not sure where this is going',
        'Sometimes feel like I want more',
        'Lack of emotional intimacy',
        'Unclear boundaries'
      ],
      red_flags: [
        'Avoids defining the relationship',
        'Sometimes disappears for days'
      ],
      green_flags: [
        'Honest about not wanting commitment',
        'Respects when I need space'
      ],
      start_date: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      rank_among_all: 4,
      rank_among_active: 3
    },

    // Past Relationship - Ended
    {
      id: 'rel-004',
      person_id: 'char-004',
      person_type: 'character',
      person_name: 'Taylor',
      relationship_type: 'ex_girlfriend',
      status: 'ended',
      is_current: false,
      affection_score: 0.40,
      emotional_intensity: 0.85,
      compatibility_score: 0.65,
      relationship_health: 0.45,
      is_situationship: false,
      exclusivity_status: undefined,
      strengths: [
        'Passionate',
        'Adventurous',
        'Great memories together'
      ],
      weaknesses: [
        'Communication issues',
        'Different life goals',
        'Jealousy problems'
      ],
      pros: [
        'We had amazing adventures together',
        'She pushed me out of my comfort zone',
        'Great physical chemistry',
        'Shared love for travel',
        'Made me feel alive'
      ],
      cons: [
        'Frequent arguments',
        'Different values about commitment',
        'Jealousy issues',
        'Communication breakdown',
        'We wanted different things in life'
      ],
      red_flags: [
        'Controlling behavior',
        'Frequent jealousy',
        'Poor conflict resolution'
      ],
      green_flags: [
        'Was supportive of my dreams',
        'Made an effort to understand me'
      ],
      start_date: twoYearsAgo.toISOString(),
      end_date: oneYearAgo.toISOString(),
      created_at: twoYearsAgo.toISOString(),
      rank_among_all: 5,
      rank_among_active: undefined
    },

    // Past Relationship - High Intensity
    {
      id: 'rel-005',
      person_id: 'char-005',
      person_type: 'character',
      person_name: 'Morgan',
      relationship_type: 'ex_lover',
      status: 'ended',
      is_current: false,
      affection_score: 0.55,
      emotional_intensity: 0.95,
      compatibility_score: 0.70,
      relationship_health: 0.50,
      is_situationship: false,
      exclusivity_status: undefined,
      strengths: [
        'Intense connection',
        'Deep emotional bond',
        'Great intellectual chemistry'
      ],
      weaknesses: [
        'Too intense',
        'Unhealthy patterns',
        'Codependency'
      ],
      pros: [
        'Deepest emotional connection I\'ve ever felt',
        'Incredible intellectual conversations',
        'We understood each other on a profound level',
        'Passionate and intense',
        'Made me grow as a person'
      ],
      cons: [
        'Too intense and overwhelming',
        'Unhealthy codependency',
        'Emotional rollercoaster',
        'Hard to maintain boundaries',
        'Burned out quickly'
      ],
      red_flags: [
        'Codependent patterns',
        'Emotional volatility',
        'Boundary issues'
      ],
      green_flags: [
        'Genuine care and concern',
        'Wanted the best for me'
      ],
      start_date: threeYearsAgo.toISOString(),
      end_date: twoYearsAgo.toISOString(),
      created_at: threeYearsAgo.toISOString(),
      rank_among_all: 6,
      rank_among_active: undefined
    },

    // Infatuation
    {
      id: 'rel-006',
      person_id: 'char-006',
      person_type: 'character',
      person_name: 'Casey',
      relationship_type: 'infatuation',
      status: 'active',
      is_current: true,
      affection_score: 0.80,
      emotional_intensity: 0.90,
      compatibility_score: 0.65,
      relationship_health: 0.60,
      is_situationship: false,
      exclusivity_status: undefined,
      strengths: [
        'Very attractive',
        'Charismatic',
        'Exciting'
      ],
      weaknesses: [
        'Don\'t know them well',
        'Might be infatuation vs real connection'
      ],
      pros: [
        'Extremely attractive',
        'Charismatic and charming',
        'Makes me feel butterflies',
        'Exciting and unpredictable',
        'Great style and presence'
      ],
      cons: [
        'Don\'t really know them yet',
        'Might just be infatuation',
        'Hard to tell if there\'s real connection',
        'Not sure if they\'re interested'
      ],
      red_flags: [
        'Mostly surface-level so far — hard to tell infatuation from real compatibility',
      ],
      green_flags: [
        'Seems like a good person',
        'Mutual friends approve'
      ],
      start_date: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      rank_among_all: 2,
      rank_among_active: undefined
    },

    // Past + No Contact + High Risk
    {
      id: 'rel-008',
      person_id: 'char-008',
      person_type: 'character',
      person_name: 'Nova',
      relationship_type: 'ex_lover',
      status: 'blocked',
      is_current: false,
      affection_score: 0.68,
      emotional_intensity: 0.92,
      compatibility_score: 0.58,
      relationship_health: 0.18,
      is_situationship: false,
      exclusivity_status: undefined,
      strengths: [
        'Strong emotional memory',
        'Meaningful history',
        'Real chemistry'
      ],
      weaknesses: [
        'No current communication',
        'Blocked and unresolved',
        'High emotional volatility'
      ],
      pros: [
        'The connection felt important in the moment',
        'There were moments of genuine closeness',
        'The story has enough context for reflection'
      ],
      cons: [
        'Blocked and unavailable',
        'Ghosting created uncertainty',
        'Reaching out would not respect the current boundary'
      ],
      red_flags: [
        'Blocked communication',
        'Ghosted after emotional intensity',
        'Unresolved ending'
      ],
      green_flags: [
        'The connection revealed what mattered emotionally'
      ],
      start_date: new Date(now.getTime() - 420 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(now.getTime() - 420 * 24 * 60 * 60 * 1000).toISOString(),
      rank_among_all: 7,
      rank_among_active: undefined
    },

    // Past with possible reconciliation
    {
      id: 'rel-009',
      person_id: 'char-009',
      person_type: 'character',
      person_name: 'Elena',
      relationship_type: 'ex_girlfriend',
      status: 'rekindled',
      is_current: false,
      affection_score: 0.62,
      emotional_intensity: 0.66,
      compatibility_score: 0.76,
      relationship_health: 0.64,
      is_situationship: false,
      exclusivity_status: undefined,
      strengths: [
        'Respectful communication',
        'Good shared values',
        'Healthy closure'
      ],
      weaknesses: [
        'Timing was difficult',
        'Distance made consistency hard'
      ],
      pros: [
        'Ended without major harm',
        'Still has mutual respect',
        'Compatibility stayed relatively strong'
      ],
      cons: [
        'Needs better timing',
        'Would require a real conversation before reopening anything'
      ],
      red_flags: [
        'Timing and distance made consistency hard — logistics never fully aligned',
      ],
      green_flags: [
        'Mutual respect remained after the ending',
        'Healthy communication patterns',
        'No current no-contact boundary'
      ],
      start_date: new Date(now.getTime() - 640 * 24 * 60 * 60 * 1000).toISOString(),
      end_date: new Date(now.getTime() - 250 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(now.getTime() - 640 * 24 * 60 * 60 * 1000).toISOString(),
      rank_among_all: 8,
      rank_among_active: undefined
    }
  ];
  return base.map(withDemoSignals);
}

/**
 * Generate mock date events for a relationship
 */
export function generateMockDateEvents(relationshipId: string): MockDateEvent[] {
  const now = new Date();
  const events: MockDateEvent[] = [];

  if (relationshipId === 'rel-001') {
    // Alex - Active boyfriend
    events.push(
      {
        id: 'date-001',
        date_type: 'first_date',
        date_time: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Coffee shop downtown',
        description: 'First date - we talked for 4 hours',
        sentiment: 0.9,
        was_positive: true
      },
      {
        id: 'date-002',
        date_type: 'first_kiss',
        date_time: new Date(now.getTime() - 170 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Park after dinner',
        description: 'First kiss under the stars',
        sentiment: 0.95,
        was_positive: true
      },
      {
        id: 'date-003',
        date_type: 'love_declaration',
        date_time: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'My apartment',
        description: 'He said "I love you" first',
        sentiment: 0.98,
        was_positive: true
      },
      {
        id: 'date-004',
        date_type: 'anniversary',
        date_time: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Fancy restaurant',
        description: '3 month anniversary dinner',
        sentiment: 0.92,
        was_positive: true
      }
    );
  } else if (relationshipId === 'rel-004') {
    // Taylor - Ex girlfriend
    events.push(
      {
        id: 'date-005',
        date_type: 'first_date',
        date_time: new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Art museum',
        description: 'First date at the museum',
        sentiment: 0.85,
        was_positive: true
      },
      {
        id: 'date-006',
        date_type: 'first_kiss',
        date_time: new Date(now.getTime() - 720 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Her car',
        description: 'Kissed after the date',
        sentiment: 0.80,
        was_positive: true
      },
      {
        id: 'date-007',
        date_type: 'breakup',
        date_time: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Her apartment',
        description: 'Mutual breakup - we wanted different things',
        sentiment: 0.30,
        was_positive: false
      }
    );
  } else if (relationshipId === 'rel-002') {
    events.push(
      {
        id: 'date-jordan-1',
        date_type: 'vulnerability_moment',
        date_time: new Date(now.getTime() - 22 * 86400000).toISOString(),
        location: 'Gallery opening',
        description: 'Two-hour talk about art and ambition — felt like real seeing',
        sentiment: 0.78,
        was_positive: true,
      },
      {
        id: 'date-jordan-2',
        date_type: 'distance',
        date_time: new Date(now.getTime() - 8 * 86400000).toISOString(),
        description: 'Three-day reply gap after a warm night — signal went fuzzy again',
        sentiment: 0.35,
        was_positive: false,
      },
    );
  } else if (relationshipId === 'rel-003') {
    events.push(
      {
        id: 'date-sam-1',
        date_type: 'connection_began',
        date_time: new Date(now.getTime() - 88 * 86400000).toISOString(),
        location: 'House party',
        description: 'Met Sam — easy chemistry, no talk of labels',
        sentiment: 0.72,
        was_positive: true,
      },
      {
        id: 'date-sam-2',
        date_type: 'physical_intimacy',
        date_time: new Date(now.getTime() - 60 * 86400000).toISOString(),
        description: 'First night together — fun, then they dodged the “what are we” question',
        sentiment: 0.68,
        was_positive: true,
      },
      {
        id: 'date-sam-3',
        date_type: 'distance',
        date_time: new Date(now.getTime() - 12 * 86400000).toISOString(),
        description: 'Vanished for four days — you journaled about wanting clarity',
        sentiment: 0.25,
        was_positive: false,
      },
    );
  } else if (relationshipId === 'rel-005') {
    events.push(
      {
        id: 'date-morgan-1',
        date_type: 'emotional_intimacy',
        date_time: new Date(now.getTime() - 900 * 86400000).toISOString(),
        description: 'All-night talk — felt like merging minds',
        sentiment: 0.96,
        was_positive: true,
      },
      {
        id: 'date-morgan-2',
        date_type: 'connection_deepening',
        date_time: new Date(now.getTime() - 800 * 86400000).toISOString(),
        description: 'Said things you had never told anyone',
        sentiment: 0.94,
        was_positive: true,
      },
      {
        id: 'date-morgan-3',
        date_type: 'fight',
        date_time: new Date(now.getTime() - 750 * 86400000).toISOString(),
        description: 'Jealous spiral after a work dinner — repair took days',
        sentiment: 0.2,
        was_positive: false,
      },
      {
        id: 'date-morgan-4',
        date_type: 'breakup',
        date_time: new Date(now.getTime() - 730 * 86400000).toISOString(),
        description: 'Mutual exhaustion — too much heat, not enough rest',
        sentiment: 0.32,
        was_positive: false,
      },
    );
  } else if (relationshipId === 'rel-006') {
    events.push(
      {
        id: 'date-casey-1',
        date_type: 'connection_began',
        date_time: new Date(now.getTime() - 12 * 86400000).toISOString(),
        location: 'Rooftop party',
        description: 'Locked eyes across the room — mostly vibes so far',
        sentiment: 0.7,
        was_positive: true,
      },
    );
  } else if (relationshipId === 'rel-007') {
    events.push(
      {
        id: 'date-riley-1',
        date_type: 'physical_intimacy',
        date_time: new Date(now.getTime() - 75 * 86400000).toISOString(),
        description: 'Great chemistry for a few weeks',
        sentiment: 0.75,
        was_positive: true,
      },
      {
        id: 'date-riley-2',
        date_type: 'distance',
        date_time: new Date(now.getTime() - 45 * 86400000).toISOString(),
        description: 'Replies slowed to nothing — never explained why',
        sentiment: 0.15,
        was_positive: false,
      },
    );
  } else if (relationshipId === 'rel-008') {
    events.push(
      {
        id: 'date-nova-1',
        date_type: 'love_declaration',
        date_time: new Date(now.getTime() - 300 * 86400000).toISOString(),
        description: 'Said “I love you” during a volatile week',
        sentiment: 0.88,
        was_positive: true,
      },
      {
        id: 'date-nova-2',
        date_type: 'fight',
        date_time: new Date(now.getTime() - 150 * 86400000).toISOString(),
        description: 'Explosive argument — blocked each other after',
        sentiment: 0.12,
        was_positive: false,
      },
    );
  } else if (relationshipId === 'rel-009') {
    events.push(
      {
        id: 'date-elena-1',
        date_type: 'first_date',
        date_time: new Date(now.getTime() - 620 * 86400000).toISOString(),
        location: 'Bookstore café',
        description: 'Quiet first date — easy respect, slow warmth',
        sentiment: 0.82,
        was_positive: true,
      },
      {
        id: 'date-elena-2',
        date_type: 'emotional_intimacy',
        date_time: new Date(now.getTime() - 400 * 86400000).toISOString(),
        description: 'Long-distance got hard — ended with kindness, not fireworks',
        sentiment: 0.55,
        was_positive: true,
      },
      {
        id: 'date-elena-3',
        date_type: 'reconciliation',
        date_time: new Date(now.getTime() - 60 * 86400000).toISOString(),
        description: 'Brief catch-up coffee — curiosity, not a plan',
        sentiment: 0.62,
        was_positive: true,
      },
    );
  }

  return events;
}

function appendFallbackIntimacyEvents(relationshipId: string, events: MockDateEvent[]): MockDateEvent[] {
  if (events.length > 0) return events;
  const rel = getMockRomanticRelationshipById(relationshipId);
  if (!rel?.start_date) return events;

  const start = new Date(rel.start_date);
  const out: MockDateEvent[] = [
    {
      id: `${relationshipId}-connection-began`,
      date_type: 'connection_began',
      date_time: rel.start_date,
      description: `Romantic connection with ${rel.person_name ?? 'them'} started showing up in your story`,
      sentiment: 0.62,
      was_positive: true,
    },
  ];

  if (rel.affection_score >= 0.5) {
    out.push({
      id: `${relationshipId}-intimacy-deepening`,
      date_type: 'emotional_intimacy',
      date_time: new Date(start.getTime() + 21 * 86400000).toISOString(),
      description: 'Emotional intimacy began deepening through shared vulnerability',
      sentiment: rel.affection_score,
      was_positive: true,
    });
  }

  if (rel.emotional_intensity >= 0.7) {
    out.push({
      id: `${relationshipId}-intensity-peak`,
      date_type: 'connection_deepening',
      date_time: new Date(start.getTime() + 45 * 86400000).toISOString(),
      description: 'Connection intensity peaked — strong pull and presence in your thoughts',
      sentiment: rel.emotional_intensity,
      was_positive: true,
    });
  }

  if (rel.end_date) {
    out.push({
      id: `${relationshipId}-bond-shift`,
      date_type: rel.status === 'ended' ? 'breakup' : 'distance',
      date_time: rel.end_date,
      description: 'Bond shifted — the romantic connection changed course',
      sentiment: 0.28,
      was_positive: false,
    });
  }

  return out;
}

/**
 * Generate mock analytics for a relationship
 */
export function generateMockRelationshipAnalytics(relationship: MockRomanticRelationship): MockRelationshipAnalytics {
  const base: MockRelationshipAnalytics = {
    relationshipId: relationship.id,
    personId: relationship.person_id,
    personName: relationship.person_name,
    affectionScore: relationship.affection_score,
    compatibilityScore: relationship.compatibility_score,
    healthScore: relationship.relationship_health,
    intensityScore: relationship.emotional_intensity,
    strengths: relationship.strengths,
    weaknesses: relationship.weaknesses,
    pros: relationship.pros,
    cons: relationship.cons,
    redFlags: relationship.red_flags,
    greenFlags: relationship.green_flags,
    insights: [
      relationship.status === 'active' && relationship.compatibility_score > 0.8
        ? 'This relationship shows strong compatibility and healthy communication patterns.'
        : relationship.status === 'ended'
        ? 'This relationship ended due to fundamental differences in values and life goals.'
        : 'This relationship is still developing. Give it time to see how it evolves.',
      relationship.affection_score > 0.8
        ? 'High affection levels indicate strong emotional connection.'
        : 'Affection levels suggest room for growth in emotional intimacy.',
      relationship.red_flags.length > 0
        ? `Be mindful of the ${relationship.red_flags.length} red flag(s) identified.`
        : 'No significant red flags detected in this relationship.'
    ].filter(Boolean) as string[],
    recommendations: [
      relationship.status === 'active' && relationship.relationship_health < 0.7
        ? 'Focus on improving communication and addressing concerns openly.'
        : relationship.status === 'active'
        ? 'Continue nurturing this relationship with quality time and open communication.'
        : 'Reflect on what you learned from this relationship for future connections.',
      relationship.pros.length > relationship.cons.length
        ? 'The pros outweigh the cons - this relationship has strong potential.'
        : 'Consider whether the cons are deal-breakers or areas for growth.'
    ].filter(Boolean) as string[],
    affectionTrend: relationship.status === 'active' ? 'increasing' : 'stable',
    healthTrend: relationship.relationship_health > 0.7 ? 'improving' : 'stable',
    calculatedAt: new Date().toISOString(),
  };
  return enrichMockAnalytics(relationship.id, base);
}

/**
 * Demo UI: materialize a romantic suggestion as a new relationship card.
 */
export function buildSimulatedRomanticRelationship(
  suggestion: CharacterSuggestion
): MockRomanticRelationship {
  const ctx = (suggestion.context ?? '').toLowerCase();
  const isTalking = ctx.includes('talking stage');
  const isDate = ctx.includes('date');
  const relationship_type = isTalking ? 'crush' : isDate ? 'dating' : 'romantic_interest';
  const now = new Date();
  const affection = Math.min(0.88, suggestion.confidence * 0.75 + 0.15);

  const base: MockRomanticRelationship = {
    id: `sim-${suggestion.id}`,
    person_id: `sim-person-${suggestion.id}`,
    person_type: 'character',
    person_name: suggestion.name,
    relationship_type,
    status: 'active',
    is_current: true,
    affection_score: affection,
    emotional_intensity: isTalking ? 0.55 : 0.72,
    compatibility_score: isTalking ? 0.52 : 0.68,
    relationship_health: isTalking ? 0.58 : 0.72,
    is_situationship: isTalking,
    strengths: isTalking ? ['Easy rapport in group settings'] : ['Great conversation chemistry'],
    weaknesses: isTalking ? ['Still undefined boundaries'] : ['Early — still getting to know each other'],
    pros: [suggestion.context ?? 'Detected from your chats'],
    cons: [],
    red_flags: [],
    green_flags: isTalking ? [] : ['Strong first connection'],
    start_date: now.toISOString(),
    created_at: now.toISOString(),
    metadata: {
      lexical_evidence: suggestion.context,
      glossary_cues: isTalking ? ['talking stage'] : isDate ? ['went on a date'] : ['romantic interest'],
      parsing: 'simulated_from_suggestion',
      from_suggestion: true,
    },
  };

  return withDemoSignals(base);
}

/**
 * Get all mock relationships
 */
export function getMockRomanticRelationships(): MockRomanticRelationship[] {
  return generateMockRomanticRelationships();
}

/**
 * Get mock relationships by filter
 */
export function getMockRomanticRelationshipsByFilter(
  filter: 'all' | 'active' | 'past' | 'no_contact' | 'reconnection' | 'situationships' | 'dating' | 'crushes' | 'high_risk' | 'rankings'
): MockRomanticRelationship[] {
  const all = getMockRomanticRelationships();
  
  switch (filter) {
    case 'active':
      return all.filter(isActiveMockRelationship);
    case 'past':
      return all.filter(isEndedMockRelationship);
    case 'no_contact':
      return all.filter(isNoContactMockRelationship);
    case 'reconnection':
      return all.filter(r => isEndedMockRelationship(r) && hasMockReconnectionPotential(r));
    case 'situationships':
      return all.filter(r => r.is_situationship);
    case 'dating':
      return all.filter(isDatingMockRelationship);
    case 'crushes':
      return all.filter(isCrushMockRelationship);
    case 'high_risk':
      return all.filter(isHighRiskMockRelationship);
    default:
      return all;
  }
}

const END_STATE_STATUSES = new Set(['ended', 'broken_up', 'separated', 'ghosted', 'blocked']);
const NO_CONTACT_STATUSES = new Set(['ghosted', 'blocked']);
const RECONNECTION_STATUSES = new Set(['rekindled', 'fading']);
const CRUSH_TYPES = new Set(['crush', 'obsession', 'infatuation']);
const DATING_TYPES = new Set(['dating', 'girlfriend', 'boyfriend', 'partner', 'romantic_interest']);

function normalizedMockStatus(relationship: MockRomanticRelationship): string {
  return relationship.status.toLowerCase();
}

function normalizedMockType(relationship: MockRomanticRelationship): string {
  return relationship.relationship_type.toLowerCase();
}

function isEndedMockRelationship(relationship: MockRomanticRelationship): boolean {
  const status = normalizedMockStatus(relationship);
  const type = normalizedMockType(relationship);
  return !relationship.is_current || END_STATE_STATUSES.has(status) || type.startsWith('ex_');
}

function isActiveMockRelationship(relationship: MockRomanticRelationship): boolean {
  return relationship.is_current && !isEndedMockRelationship(relationship);
}

function isCrushMockRelationship(relationship: MockRomanticRelationship): boolean {
  return CRUSH_TYPES.has(normalizedMockType(relationship));
}

function isDatingMockRelationship(relationship: MockRomanticRelationship): boolean {
  return isActiveMockRelationship(relationship) && DATING_TYPES.has(normalizedMockType(relationship));
}

function isNoContactMockRelationship(relationship: MockRomanticRelationship): boolean {
  return NO_CONTACT_STATUSES.has(normalizedMockStatus(relationship));
}

function hasMockReconnectionPotential(relationship: MockRomanticRelationship): boolean {
  if (isNoContactMockRelationship(relationship)) return false;

  return (
    RECONNECTION_STATUSES.has(normalizedMockStatus(relationship)) ||
    (relationship.compatibility_score >= 0.7 &&
      relationship.relationship_health >= 0.45 &&
      relationship.green_flags.length > relationship.red_flags.length)
  );
}

function isHighRiskMockRelationship(relationship: MockRomanticRelationship): boolean {
  const status = normalizedMockStatus(relationship);
  const type = normalizedMockType(relationship);
  return (
    relationship.red_flags.length >= 2 ||
    relationship.relationship_health < 0.35 ||
    NO_CONTACT_STATUSES.has(status) ||
    status === 'complicated' ||
    type === 'obsession'
  );
}

/**
 * Get mock relationship by ID
 */
export function getMockRomanticRelationshipById(id: string): MockRomanticRelationship | undefined {
  return getMockRomanticRelationships().find(r => r.id === id);
}

/**
 * Get mock dates for a relationship
 */
export function getMockDateEvents(relationshipId: string): MockDateEvent[] {
  return appendFallbackIntimacyEvents(relationshipId, generateMockDateEvents(relationshipId));
}

/**
 * Get mock analytics for a relationship
 */
export function getMockRelationshipAnalytics(relationshipId: string): MockRelationshipAnalytics | undefined {
  const relationship = getMockRomanticRelationshipById(relationshipId);
  if (!relationship) return undefined;
  return generateMockRelationshipAnalytics(relationship);
}

/**
 * Get mock rankings data sorted by category
 */
export function getMockRankings(category: 'overall' | 'active' | 'compatibility' | 'intensity' | 'health'): MockRomanticRelationship[] {
  const all = getMockRomanticRelationships();
  
  // Convert to RankedRelationship format and sort
  const ranked = [...all].map(rel => ({
    ...rel,
    person_name: rel.person_name || 'Unknown'
  }));

  switch (category) {
    case 'overall':
      return ranked.sort((a, b) => (a.rank_among_all || 999) - (b.rank_among_all || 999));
    case 'active':
      return ranked
        .filter(r => r.is_current && r.status === 'active')
        .sort((a, b) => (a.rank_among_active || 999) - (b.rank_among_active || 999));
    case 'compatibility':
      return ranked.sort((a, b) => b.compatibility_score - a.compatibility_score);
    case 'intensity':
      return ranked.sort((a, b) => b.emotional_intensity - a.emotional_intensity);
    case 'health':
      return ranked.sort((a, b) => b.relationship_health - a.relationship_health);
    default:
      return ranked;
  }
}
