import type { TrustDomain, TrustOverview } from '../api/trust';

/** Demo trust rollup — founder-validation shape (Abuela, LoreBook, Tío Ray, etc.) */
export function getMockTrustOverview(): TrustOverview {
  return {
    generated_at: new Date().toISOString(),
    overall_coverage_score: 68,
    confidence: { average: 68 },
    state_totals: {
      known: 186,
      suggested: 22,
      unverified: 11,
      conflicted: 5,
      archived: 3,
    },
    coverage: [
      {
        domain: 'characters',
        entity_count: 142,
        evidence_count: 88,
        coverage_score: 71,
        states: { known: 120, suggested: 15, unverified: 3, conflicted: 4, archived: 0 },
      },
      {
        domain: 'locations',
        entity_count: 24,
        evidence_count: 31,
        coverage_score: 58,
        states: { known: 18, suggested: 2, unverified: 4, conflicted: 0, archived: 0 },
      },
      {
        domain: 'organizations',
        entity_count: 12,
        evidence_count: 9,
        coverage_score: 62,
        states: { known: 10, suggested: 1, unverified: 1, conflicted: 0, archived: 0 },
      },
      {
        domain: 'projects',
        entity_count: 8,
        evidence_count: 5,
        coverage_score: 74,
        states: { known: 5, suggested: 3, unverified: 0, conflicted: 0, archived: 0 },
      },
      {
        domain: 'goals',
        entity_count: 6,
        evidence_count: 0,
        coverage_score: 60,
        states: { known: 6, suggested: 0, unverified: 0, conflicted: 0, archived: 0 },
      },
      {
        domain: 'skills',
        entity_count: 14,
        evidence_count: 3,
        coverage_score: 55,
        states: { known: 11, suggested: 2, unverified: 1, conflicted: 0, archived: 0 },
      },
      {
        domain: 'communities',
        entity_count: 4,
        evidence_count: 0,
        coverage_score: 55,
        states: { known: 4, suggested: 0, unverified: 0, conflicted: 0, archived: 0 },
      },
      {
        domain: 'relationships',
        entity_count: 28,
        evidence_count: 22,
        coverage_score: 72,
        states: { known: 26, suggested: 0, unverified: 0, conflicted: 2, archived: 0 },
      },
      {
        domain: 'events',
        entity_count: 45,
        evidence_count: 38,
        coverage_score: 64,
        states: { known: 40, suggested: 5, unverified: 0, conflicted: 0, archived: 0 },
      },
      {
        domain: 'households',
        entity_count: 3,
        evidence_count: 0,
        coverage_score: 70,
        states: { known: 3, suggested: 0, unverified: 0, conflicted: 0, archived: 0 },
      },
    ],
    unknowns: [
      {
        id: 'mock-unknown-tio-ray',
        kind: 'mentioned_person_no_profile',
        label: 'Tío Ray',
        prompt: 'Tell me more about Tío Ray — who are they to you?',
        domain: 'characters',
        priority: 88,
      },
      {
        id: 'mock-unknown-club-metro',
        kind: 'mentioned_place_no_location',
        label: 'Neon Lounge',
        prompt: 'What is Neon Lounge in your life?',
        domain: 'locations',
        priority: 72,
      },
      {
        id: 'mock-unknown-side-gig',
        kind: 'mentioned_project_no_card',
        label: 'Freelance newsletter',
        prompt: 'Is "Freelance newsletter" an active project right now?',
        domain: 'projects',
        priority: 68,
      },
      {
        id: 'mock-unknown-no-rel',
        kind: 'no_relationship',
        label: 'Marcus Chen',
        prompt: 'How do you know Marcus Chen? What\'s your relationship?',
        domain: 'relationships',
        priority: 48,
      },
    ],
    conflicts: [
      {
        id: 'mock-conflict-dup-rel',
        kind: 'duplicate_entity',
        title: 'Duplicate relationship — Alex / Alexandra',
        reason: 'Two edges for the same partner; merge or dismiss',
        domain: 'relationships',
        priority: 90,
      },
      {
        id: 'mock-conflict-name',
        kind: 'duplicate_entity',
        title: 'Jordan (2 characters)',
        reason: 'duplicate name — coworker vs college friend',
        domain: 'characters',
        priority: 82,
      },
    ],
    review_queue: [
      {
        id: 'mock-review-tio-ray',
        kind: 'mentioned_person_no_profile',
        title: 'Tío Ray',
        reason: 'Mentioned in chat — kinship ambiguous (persona vs family)',
        domain: 'characters',
        priority: 88,
        action: 'fill_gap',
      },
      {
        id: 'mock-review-project',
        kind: 'suggested_entity',
        title: 'Robotics Build',
        reason: 'Detected project suggestion awaiting confirmation',
        domain: 'projects',
        priority: 75,
        action: 'confirm_or_reject',
      },
      {
        id: 'mock-review-club',
        kind: 'mentioned_place_no_location',
        title: 'Neon Lounge',
        reason: 'Mentioned 3× in chat — no Places Book entry yet',
        domain: 'locations',
        priority: 72,
        action: 'fill_gap',
      },
    ],
  };
}

export function getMockDomainTrust(domain: TrustDomain) {
  const overview = getMockTrustOverview();
  const row = overview.coverage.find((c) => c.domain === domain);
  return {
    domain,
    entity_count: row?.entity_count ?? 0,
    evidence_count: row?.evidence_count ?? 0,
    coverage_score: row?.coverage_score ?? 0,
    states: row?.states ?? { known: 0, suggested: 0, unverified: 0, conflicted: 0, archived: 0 },
    unknowns: overview.unknowns.filter((u) => u.domain === domain),
    review_items: overview.review_queue.filter((r) => r.domain === domain),
  };
}

/** Demo entity knowledge gaps (voids dashboard — "things Lorebook doesn't know") */
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
