import type { KnowledgeClaim, EvidenceLink } from '../api/knowledge';

const MOCK_USER = 'mock-user';
const now = Date.now();

function daysAgo(days: number): string {
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

function breakdown(confidence: number): KnowledgeClaim['confidence_breakdown'] {
  return {
    base_evidence: confidence * 0.45,
    temporal_stability: confidence * 0.2,
    cross_context: confidence * 0.25,
    recency_factor: confidence * 0.15,
    contradiction_penalty: 0,
    computed_at: daysAgo(1),
  };
}

function claim(
  id: string,
  human: string,
  type: string,
  status: KnowledgeClaim['status'],
  confidence: number,
  reinforcedDaysAgo: number,
  evidencedDaysAgo: number,
  extras?: Partial<KnowledgeClaim>,
): KnowledgeClaim {
  const ts = daysAgo(reinforcedDaysAgo);
  return {
    id,
    user_id: MOCK_USER,
    machine_claim: human.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 80),
    human_readable_claim: human,
    knowledge_type: type,
    status,
    confidence,
    confidence_breakdown: breakdown(confidence),
    trigger_type: 'behavioral_pattern',
    first_evidenced_at: daysAgo(evidencedDaysAgo),
    last_reinforced_at: ts,
    superseded_by_id: extras?.superseded_by_id ?? null,
    evidence_links: extras?.evidence_links,
    created_at: daysAgo(evidencedDaysAgo),
    updated_at: ts,
    ...extras,
  };
}

/** Demo-mode claims for the About Me / Self Knowledge surface. */
export const mockSelfKnowledgeClaims: KnowledgeClaim[] = [
  claim(
    'mock-self-1',
    'You tend to process difficult emotions through writing before talking them out with others.',
    'behavioral_pattern',
    'ACTIVE',
    0.82,
    3,
    120,
    {
      trigger_type: 'recurring_entry_pattern',
      evidence_links: [
        {
          id: 'mock-ev-1',
          knowledge_id: 'mock-self-1',
          user_id: MOCK_USER,
          evidence_type: 'event_interpretation',
          evidence_id: 'mem-1',
          evidence_weight: 0.85,
          evidence_summary: 'Multiple entries describe sitting down to write after conflict before reaching out.',
          created_at: daysAgo(14),
        },
        {
          id: 'mock-ev-2',
          knowledge_id: 'mock-self-1',
          user_id: MOCK_USER,
          evidence_type: 'life_arc',
          evidence_id: 'arc-1',
          evidence_weight: 0.72,
          evidence_summary: 'Your "Processing in Private" arc spans 4 months of journal entries.',
          created_at: daysAgo(30),
        },
      ],
    },
  ),
  claim(
    'mock-self-2',
    'Authenticity in relationships matters more to you than keeping social harmony.',
    'value',
    'ACTIVE',
    0.78,
    7,
    200,
    {
      trigger_type: 'value_signal',
      evidence_links: [
        {
          id: 'mock-ev-3',
          knowledge_id: 'mock-self-2',
          user_id: MOCK_USER,
          evidence_type: 'resolved_event',
          evidence_id: 'evt-1',
          evidence_weight: 0.8,
          evidence_summary: 'You chose honest conversations over avoiding tension in three separate friendships.',
          created_at: daysAgo(21),
        },
      ],
    },
  ),
  claim(
    'mock-self-3',
    'Creative work feels essential to your sense of self — not a hobby you could set aside indefinitely.',
    'belief',
    'ACTIVE',
    0.85,
    2,
    180,
    { trigger_type: 'identity_anchor' },
  ),
  claim(
    'mock-self-4',
    'You have developed strong narrative self-reflection through consistent journaling.',
    'skill',
    'ACTIVE',
    0.71,
    5,
    365,
    { trigger_type: 'skill_emergence' },
  ),
  claim(
    'mock-self-5',
    'You recharge through solitary morning routines before engaging with other people.',
    'preference',
    'ACTIVE',
    0.68,
    10,
    90,
    { trigger_type: 'routine_pattern' },
  ),
  claim(
    'mock-self-6',
    'You see yourself as someone in active transition rather than settled into a final chapter.',
    'identity',
    'ACTIVE',
    0.74,
    4,
    150,
    { trigger_type: 'self_narrative' },
  ),
  claim(
    'mock-self-7',
    'You gravitate toward work that blends creativity with meaning over pure compensation.',
    'career',
    'ACTIVE',
    0.79,
    6,
    240,
    { trigger_type: 'career_arc' },
  ),
  claim(
    'mock-self-8',
    'Your creative output spikes after periods of unstructured exploration.',
    'creative',
    'ACTIVE',
    0.66,
    12,
    100,
    { trigger_type: 'creative_cycle' },
  ),
  claim(
    'mock-self-9',
    'You maintain fewer but deeper friendships rather than a wide social circle.',
    'relationship',
    'DORMANT',
    0.62,
    45,
    300,
    { trigger_type: 'relationship_topology' },
  ),
  claim(
    'mock-self-10',
    'Past experiences with overcommitment taught you to protect your creative time.',
    'lesson',
    'DORMANT',
    0.58,
    60,
    400,
    { trigger_type: 'lesson_crystallized' },
  ),
  claim(
    'mock-self-11',
    'During your early journaling period, sleep irregularity correlated with more anxious entries.',
    'health',
    'HISTORICAL',
    0.55,
    120,
    500,
    { trigger_type: 'health_correlation' },
  ),
  claim(
    'mock-self-12',
    'Coffee shops were a recurring anchor for reflection before you moved cities.',
    'location',
    'HISTORICAL',
    0.51,
    150,
    420,
    { trigger_type: 'place_pattern' },
  ),
  claim(
    'mock-self-13',
    'You believed quitting your day job immediately was the only path to creative fulfillment.',
    'belief',
    'SUPERSEDED',
    0.45,
    90,
    280,
    {
      trigger_type: 'belief_revision',
      superseded_by_id: 'mock-self-3',
    },
  ),
];

export function filterMockSelfKnowledgeClaims(
  claims: KnowledgeClaim[],
  status: 'ACTIVE' | 'DORMANT' | 'HISTORICAL' | 'SUPERSEDED' | 'ALL',
): KnowledgeClaim[] {
  if (status === 'ALL') return claims;
  return claims.filter(c => c.status === status);
}

export function getMockSelfKnowledgeClaim(
  id: string,
): (KnowledgeClaim & { evidence_links: EvidenceLink[]; supersedence_chain: KnowledgeClaim[] }) | null {
  const found = mockSelfKnowledgeClaims.find(c => c.id === id);
  if (!found) return null;

  const supersedence_chain: KnowledgeClaim[] = [];
  if (found.superseded_by_id) {
    const successor = mockSelfKnowledgeClaims.find(c => c.id === found.superseded_by_id);
    if (successor) supersedence_chain.push(successor);
  }
  const superseded = mockSelfKnowledgeClaims.filter(c => c.superseded_by_id === found.id);
  supersedence_chain.push(...superseded);

  return {
    ...found,
    evidence_links: found.evidence_links ?? [],
    supersedence_chain,
  };
}
