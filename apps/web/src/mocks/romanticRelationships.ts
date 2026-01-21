// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.
// Mock Data for Love & Relationships Section

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

  return [
    // Active Relationship - High Compatibility
    {
      id: 'rel-001',
      person_id: 'char-001',
      person_type: 'character',
      person_name: 'Alex',
      relationship_type: 'boyfriend',
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
        'He always remembers the little things I mention',
        'We have amazing conversations that last for hours',
        'He supports my career ambitions',
        'We share a love for hiking and nature',
        'He makes me feel safe and understood',
        'Great sense of humor',
        'We balance each other out perfectly'
      ],
      cons: [
        'He works long hours sometimes',
        'Not always great at planning dates',
        'Can be a bit messy'
      ],
      red_flags: [],
      green_flags: [
        'Introduced me to his family early on',
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
      red_flags: [],
      green_flags: [
        'They seem interested in getting to know me',
        'Mutual friends say good things'
      ],
      start_date: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      rank_among_all: 3,
      rank_among_active: 2
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
      red_flags: [],
      green_flags: [
        'Seems like a good person',
        'Mutual friends approve'
      ],
      start_date: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      rank_among_all: 2,
      rank_among_active: undefined
    }
  ];
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
  }

  return events;
}

/**
 * Generate mock analytics for a relationship
 */
export function generateMockRelationshipAnalytics(relationship: MockRomanticRelationship): MockRelationshipAnalytics {
  return {
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
    calculatedAt: new Date().toISOString()
  };
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
  filter: 'all' | 'active' | 'past' | 'situationships' | 'crushes'
): MockRomanticRelationship[] {
  const all = getMockRomanticRelationships();
  
  switch (filter) {
    case 'active':
      return all.filter(r => r.is_current && r.status === 'active');
    case 'past':
      return all.filter(r => !r.is_current || r.status === 'ended');
    case 'situationships':
      return all.filter(r => r.is_situationship);
    case 'crushes':
      return all.filter(r => 
        r.relationship_type === 'crush' || 
        r.relationship_type === 'obsession' || 
        r.relationship_type === 'infatuation'
      );
    default:
      return all;
  }
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
  return generateMockDateEvents(relationshipId);
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
