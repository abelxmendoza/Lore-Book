/** Demo timeline voids + stats for Knowledge Gaps dashboard */

export const MOCK_ENTITY_KNOWLEDGE_GAPS = [
  {
    id: 'mock-eg-tio-ray',
    gap_type: 'unknown_entity' as const,
    label: 'Tío Ray',
    prompt: 'Who is Tío Ray to you — family, friend, or a nickname?',
    created_at: new Date(Date.now() - 2 * 864e5).toISOString(),
  },
  {
    id: 'mock-eg-club-metro',
    gap_type: 'sparse_entity' as const,
    label: 'Neon Lounge',
    prompt: 'What role does Neon Lounge play in your story?',
    created_at: new Date(Date.now() - 5 * 864e5).toISOString(),
  },
];

export const MOCK_VOID_STATS = {
  totalGaps: 3,
  totalMissingDays: 47,
  averageGapDuration: 16,
  mostSignificantGap: null as null,
  coveragePercentage: 72,
  timelineSpan: {
    start: new Date(Date.now() - 400 * 864e5).toISOString(),
    end: new Date().toISOString(),
    totalDays: 400,
  },
};

export const MOCK_VOID_PERIODS = [
  {
    id: 'mock-void-1',
    start: new Date(Date.now() - 120 * 864e5).toISOString(),
    end: new Date(Date.now() - 105 * 864e5).toISOString(),
    durationDays: 15,
    type: 'medium_gap' as const,
    significance: 'medium' as const,
    prompts: [
      'What happened during those two quiet weeks in early spring?',
      'Any travel, illness, or head-down work that paused journaling?',
    ],
    engagementScore: 62,
    context: {
      surroundingThemes: ['work ramp-up', 'family'],
    },
  },
  {
    id: 'mock-void-2',
    start: new Date(Date.now() - 60 * 864e5).toISOString(),
    end: new Date(Date.now() - 44 * 864e5).toISOString(),
    durationDays: 16,
    type: 'medium_gap' as const,
    significance: 'high' as const,
    prompts: [
      'You went quiet for over two weeks — what was going on?',
      'Anything you want LoreBook to remember from that stretch?',
    ],
    engagementScore: 78,
    context: {
      surroundingThemes: ['new job onboarding', 'moving'],
    },
  },
  {
    id: 'mock-void-3',
    start: new Date(Date.now() - 21 * 864e5).toISOString(),
    end: new Date(Date.now() - 14 * 864e5).toISOString(),
    durationDays: 7,
    type: 'short_gap' as const,
    significance: 'low' as const,
    prompts: ['Quick check-in — anything worth capturing from that week?'],
    engagementScore: 35,
  },
];
