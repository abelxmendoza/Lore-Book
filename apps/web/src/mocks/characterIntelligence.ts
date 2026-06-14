/**
 * Centralized demo-mode "character intelligence" generator.
 *
 * Demo mode used to hardcode intelligence inline in CharacterDetailModal for a
 * handful of named characters (4 had dynamics/influence, ~10 had attributes,
 * the "What I Know" tab had none). Every other demo character rendered empty or
 * generic cards, so demo was inconsistent with itself and structurally
 * different from real users.
 *
 * This module gives every demo character a complete, internally consistent
 * intelligence profile that matches the real backend response shapes. Curated
 * heroes keep their hand-written data; everyone else is generated
 * deterministically from their own fields (archetype, closeness, importance,
 * first-met date, memory count, role, tags) so the same character always
 * produces the same profile across renders.
 */

import type { Character } from '../components/characters/CharacterProfileCard';

const DAY = 24 * 60 * 60 * 1000;

// ── Public shapes (mirror the real API responses the modal renders) ──────────
export interface MockAttribute {
  attributeType: string;
  attributeValue: string;
  confidence: number;
  isCurrent: boolean;
  evidence?: string;
  startTime?: string;
  endTime?: string;
}

export interface MockDynamics {
  person_name: string;
  metrics: {
    interaction_frequency: number;
    average_sentiment: number;
    positive_ratio: number;
    conflict_frequency: number;
    support_frequency: number;
    last_interaction_days_ago: number;
    interaction_consistency: number;
  };
  health: {
    overall_health: 'excellent' | 'good' | 'fair' | 'poor';
    health_score: number;
    factors: Record<string, number>;
    trends: { health_trend: string; sentiment_trend: string; frequency_trend: string };
    strengths: string[];
    concerns?: string[];
  };
  lifecycle: {
    current_stage: string;
    stage_confidence: number;
    stage_history: Array<{ stage: string; start_date: string; duration_days: number }>;
  };
  common_topics: string[];
  total_interactions: number;
}

export interface MockInfluence {
  person: string;
  emotional_impact: number;
  behavioral_impact: number;
  toxicity_score: number;
  uplift_score: number;
  net_influence: number;
  interaction_count: number;
}

export interface MockInsight {
  type: string;
  message: string;
  confidence: number;
}

export interface MockFact {
  id: string;
  category: string;
  fact: string;
  confidence: number;
  status?: string;
  previous_value?: string;
}

export interface MockKnowledgeClaim {
  id: string;
  human_readable_claim: string;
  confidence: number;
  evidence_count: number;
  knowledge_type: string;
  evidence_links: Array<{ evidence_summary: string }>;
  last_reinforced_at: string;
}

export interface MockSceneCandidate {
  id: string;
  canonical_title: string;
  recurring_activities: string[];
  continuity_strength: number;
  occurrence_count: number;
  last_seen_at: string;
}

// ── Deterministic helpers ────────────────────────────────────────────────────
function hashName(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable value in [-range, range] seeded by name + salt. */
function jitter(name: string, salt: string, range: number): number {
  return (((hashName(name + salt) % 1000) / 1000) * 2 - 1) * range;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const isoDate = (ms: number) => new Date(ms).toISOString().split('T')[0];
const daysAgoIso = (days: number) => new Date(Date.now() - days * DAY).toISOString();

interface Signals {
  name: string;
  firstName: string;
  archetype: string;
  relType: string;
  role: string;
  tags: string[];
  closeness: number; // 0..1
  importance: number; // 0..100
  firstMet: string;
  yearsKnown: number;
  memoryCount: number;
}

function extractSignals(c: Character): Signals {
  const md = (c.metadata ?? {}) as Record<string, unknown>;
  const closenessRaw = Number(
    (md.closeness_score as number) ??
      c.analytics?.closeness_score ??
      c.importance_score ??
      50,
  );
  const firstMet =
    (md.first_met as string) || c.first_appearance || '2021-01-01';
  const firstMetMs = new Date(firstMet).getTime();
  return {
    name: c.name,
    firstName: c.first_name || c.name.split(' ')[0],
    archetype: (c.archetype || 'friend').toLowerCase(),
    relType: String(md.relationship_type || c.archetype || 'friend'),
    role: c.role || '',
    tags: c.tags ?? [],
    closeness: clamp(closenessRaw / 100, 0, 1),
    importance: Number(c.importance_score ?? 50),
    firstMet,
    yearsKnown: Math.max((Date.now() - firstMetMs) / (365 * DAY), 0.25),
    memoryCount: Number(c.memory_count ?? 0),
  };
}

// ── Archetype flavor pools ───────────────────────────────────────────────────
const ARCHETYPE_TOPICS: Record<string, string[]> = {
  mentor: ['career growth', 'life advice', 'self-improvement'],
  coach: ['goals', 'mindset', 'accountability'],
  family: ['family', 'life updates', 'support'],
  romantic: ['the future', 'feelings', 'shared plans'],
  collaborator: ['creative work', 'projects', 'ideas'],
  colleague: ['work', 'industry', 'projects'],
  ally: ['friendship', 'support', 'life'],
  friend: ['catching up', 'life', 'plans'],
};

const ARCHETYPE_TRAITS: Record<string, Array<{ value: string; evidence: (n: string) => string }>> = {
  mentor: [
    { value: 'Patient and deliberate', evidence: (n) => `${n} listens fully before offering perspective` },
    { value: 'Wise and experienced', evidence: () => `Draws on years of experience when giving advice` },
  ],
  coach: [
    { value: 'Encouraging', evidence: (n) => `${n} pushes you toward your goals without pressure` },
    { value: 'Structured', evidence: () => `Brings focus and follow-through to your conversations` },
  ],
  family: [
    { value: 'Dependable', evidence: (n) => `${n} shows up for the moments that matter` },
    { value: 'Unconditionally supportive', evidence: () => `Support has been steady for as long as you can remember` },
  ],
  romantic: [
    { value: 'Deeply caring', evidence: (n) => `${n} remembers the small things and anticipates what you need` },
    { value: 'Emotionally present', evidence: () => `Makes you feel grounded and understood` },
  ],
  collaborator: [
    { value: 'Detail-oriented', evidence: () => `Sweats the details until the work is right` },
    { value: 'Collaborative', evidence: (n) => `${n} brings out your best creative thinking` },
  ],
  colleague: [
    { value: 'Reliable', evidence: (n) => `${n} is someone you can count on at work` },
    { value: 'Sharp', evidence: () => `Quick to grasp the heart of a problem` },
  ],
  ally: [
    { value: 'Honest and direct', evidence: (n) => `${n} tells you the truth, even when it is hard to hear` },
    { value: 'Loyal', evidence: () => `A consistent presence through the ups and downs` },
  ],
  friend: [
    { value: 'Easygoing', evidence: (n) => `Time with ${n} feels effortless` },
    { value: 'Thoughtful', evidence: () => `Remembers what is going on in your life and checks in` },
  ],
};

function topicsFor(s: Signals): string[] {
  const base = ARCHETYPE_TOPICS[s.archetype] ?? ARCHETYPE_TOPICS.friend;
  const fromTags = s.tags.slice(0, 1);
  return Array.from(new Set([...fromTags, ...base])).slice(0, 4);
}

// ── Generators ───────────────────────────────────────────────────────────────
function genDynamics(s: Signals): MockDynamics {
  const cl = s.closeness;
  const interaction_frequency = r1(
    clamp(s.memoryCount / Math.max(1, s.yearsKnown * 12) * 3 + cl * 4, 1.5, 14),
  );
  const average_sentiment = r2(clamp(0.62 + cl * 0.32 + jitter(s.name, 'sent', 0.03), 0.45, 0.97));
  const positive_ratio = r2(clamp(0.7 + cl * 0.27, 0.5, 0.98));
  const conflict_frequency = r2(clamp(0.18 - cl * 0.15 + jitter(s.name, 'conf', 0.02), 0.01, 0.25));
  const support_frequency = r1(clamp(cl * 5, 0.5, 6));
  const last_interaction_days_ago = Math.round(
    clamp((s.importance >= 80 ? 4 : s.importance >= 60 ? 9 : 21) + jitter(s.name, 'last', 4), 1, 60),
  );
  const interaction_consistency = r2(clamp(0.6 + cl * 0.35, 0.4, 0.97));

  const health_score = Math.round(clamp(s.closeness * 100 * 0.9 + 6 + jitter(s.name, 'hp', 3), 30, 98));
  const overall_health: MockDynamics['health']['overall_health'] =
    health_score >= 90 ? 'excellent' : health_score >= 75 ? 'good' : health_score >= 58 ? 'fair' : 'poor';

  const factors = {
    sentiment: Math.round(average_sentiment * 100),
    frequency: Math.round(clamp(interaction_frequency * 7, 30, 98)),
    consistency: Math.round(interaction_consistency * 100),
    conflict_level: Math.round(clamp(100 - conflict_frequency * 220, 60, 99)),
    support_level: Math.round(clamp(support_frequency * 17, 40, 98)),
  };

  const traits = ARCHETYPE_TRAITS[s.archetype] ?? ARCHETYPE_TRAITS.friend;
  const strengths = [traits[0].value, traits[1]?.value].filter(Boolean) as string[];
  if (interaction_consistency > 0.85) strengths.push('Consistent contact');

  const concerns: string[] = [];
  if (health_score < 70) concerns.push('Connection has felt less vibrant lately');
  if (last_interaction_days_ago > 30) concerns.push(`It has been a while since you connected with ${s.firstName}`);
  if (conflict_frequency > 0.15) concerns.push('Occasional friction worth keeping an eye on');

  const current_stage =
    s.yearsKnown > 5 && cl > 0.7 ? 'deepening'
    : s.yearsKnown > 2 ? 'established'
    : s.yearsKnown > 0.5 ? 'developing'
    : 'forming';

  return {
    person_name: s.name,
    metrics: {
      interaction_frequency,
      average_sentiment,
      positive_ratio,
      conflict_frequency,
      support_frequency,
      last_interaction_days_ago,
      interaction_consistency,
    },
    health: {
      overall_health,
      health_score,
      factors,
      trends: {
        health_trend: s.importance >= 70 ? 'improving' : 'stable',
        sentiment_trend: cl > 0.75 ? 'improving' : 'stable',
        frequency_trend: last_interaction_days_ago > 21 ? 'declining' : 'stable',
      },
      strengths,
      concerns: concerns.length > 0 ? concerns : undefined,
    },
    lifecycle: {
      current_stage,
      stage_confidence: r2(clamp(0.7 + cl * 0.27, 0.6, 0.98)),
      stage_history: buildStageHistory(s.firstMet, current_stage),
    },
    common_topics: topicsFor(s),
    total_interactions: Math.max(s.memoryCount, Math.round(s.memoryCount * (1 + cl))),
  };
}

function buildStageHistory(firstMet: string, currentStage: string) {
  const stages = ['forming', 'developing', 'established', 'deepening'];
  const idx = Math.max(0, stages.indexOf(currentStage));
  const start = new Date(firstMet).getTime();
  const total = Math.max(Date.now() - start, 90 * DAY);
  const n = idx + 1;
  const hist: Array<{ stage: string; start_date: string; duration_days: number }> = [];
  for (let i = 0; i <= idx; i++) {
    hist.push({
      stage: stages[i],
      start_date: isoDate(start + total * (i / n)),
      duration_days: Math.round(total / n / DAY),
    });
  }
  return hist;
}

function genInfluence(s: Signals): MockInfluence {
  const cl = s.closeness;
  const behaviorBoost = ['mentor', 'coach', 'collaborator', 'colleague'].includes(s.archetype) ? 0.7 : 0.5;
  const emotionBoost = ['romantic', 'family', 'ally'].includes(s.archetype) ? 0.1 : 0;
  const emotional_impact = r2(clamp(cl * 0.9 + emotionBoost, 0.2, 0.95));
  const behavioral_impact = r2(clamp(behaviorBoost * cl + 0.2, 0.2, 0.9));
  const toxicity_score = r2(clamp(0.12 - cl * 0.1 + jitter(s.name, 'tox', 0.02), 0.01, 0.2));
  const uplift_score = r2(clamp(0.55 + cl * 0.4, 0.4, 0.96));
  const net_influence = r2(clamp((emotional_impact + uplift_score) / 2 - toxicity_score, 0.2, 0.95));
  return {
    person: s.name,
    emotional_impact,
    behavioral_impact,
    toxicity_score,
    uplift_score,
    net_influence,
    interaction_count: Math.max(s.memoryCount, 8),
  };
}

function genInsights(s: Signals): MockInsight[] {
  const cl = s.closeness;
  const high = cl > 0.7;
  const out: MockInsight[] = [];
  const archetypeLine: Record<string, string> = {
    mentor: `${s.firstName}'s guidance has measurably shaped your decisions`,
    coach: `${s.firstName} keeps you accountable to the goals you set`,
    family: `${s.firstName} is one of your most stabilizing sources of support`,
    romantic: `${s.firstName} has been a steadying presence through recent changes`,
    collaborator: `Your most productive creative work happens alongside ${s.firstName}`,
    colleague: `${s.firstName} shapes how you navigate work challenges`,
    ally: `${s.firstName} consistently brings out your confidence`,
    friend: `Time with ${s.firstName} reliably lifts your mood`,
  };
  out.push({
    type: high ? 'positive_influence' : 'influence_score',
    message: high
      ? archetypeLine[s.archetype] ?? archetypeLine.friend
      : `LoreBook is still building intelligence about your relationship with ${s.firstName}`,
    confidence: high ? r2(0.78 + cl * 0.15) : 0.55,
  });
  if (high) {
    out.push({
      type: 'uplifting_person',
      message: `Your journaling tends to be more positive around time spent with ${s.firstName}`,
      confidence: r2(0.6 + cl * 0.3),
    });
  }
  return out;
}

function genAttributes(s: Signals): MockAttribute[] {
  const out: MockAttribute[] = [];
  if (s.role) {
    out.push({
      attributeType: 'occupation',
      attributeValue: s.role,
      confidence: r2(clamp(0.7 + s.closeness * 0.2, 0.6, 0.95)),
      isCurrent: true,
      evidence: `${s.firstName} appears in your entries primarily in this role`,
    });
  }
  const traits = ARCHETYPE_TRAITS[s.archetype] ?? ARCHETYPE_TRAITS.friend;
  traits.forEach((t, i) => {
    out.push({
      attributeType: 'personality_trait',
      attributeValue: t.value,
      confidence: r2(clamp(0.75 + s.closeness * 0.15 - i * 0.04, 0.6, 0.95)),
      isCurrent: true,
      evidence: t.evidence(s.firstName),
    });
  });
  if (s.tags[0]) {
    out.push({
      attributeType: 'lifestyle_pattern',
      attributeValue: s.tags[0].replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
      confidence: r2(clamp(0.65 + s.closeness * 0.2, 0.55, 0.9)),
      isCurrent: true,
    });
  }
  if (s.archetype === 'romantic') {
    out.push({
      attributeType: 'relationship_status',
      attributeValue: 'In a relationship with you',
      confidence: 0.97,
      isCurrent: true,
      startTime: s.firstMet,
    });
  } else if (s.archetype !== 'family') {
    out.push({
      attributeType: 'relationship_status',
      attributeValue: 'Status unknown',
      confidence: 0.4,
      isCurrent: true,
      evidence: 'Not enough data to determine with confidence',
    });
  }
  return out;
}

function genFacts(s: Signals): MockFact[] {
  const conf = (base: number) => r2(clamp(base + s.closeness * 0.1, 0.5, 0.95));
  const facts: MockFact[] = [];
  if (s.role) {
    facts.push({ id: `fact-${s.name}-role`, category: 'career', fact: `${s.firstName}'s role in your life: ${s.role}`, confidence: conf(0.78) });
  }
  const traits = ARCHETYPE_TRAITS[s.archetype] ?? ARCHETYPE_TRAITS.friend;
  facts.push({ id: `fact-${s.name}-trait`, category: 'personality', fact: `${s.firstName} is ${traits[0].value.toLowerCase()}`, confidence: conf(0.75) });
  facts.push({
    id: `fact-${s.name}-rel`,
    category: 'relationship',
    fact: `You have known ${s.firstName} for about ${Math.round(s.yearsKnown)} year${Math.round(s.yearsKnown) === 1 ? '' : 's'}`,
    confidence: conf(0.7),
  });
  if (s.tags[1]) {
    facts.push({ id: `fact-${s.name}-tag`, category: 'general', fact: `${s.firstName} is associated with ${s.tags[1].replace(/_/g, ' ')}`, confidence: conf(0.65) });
  }
  return facts;
}

function genKnowledgeClaims(s: Signals): MockKnowledgeClaim[] {
  if (s.closeness < 0.55) return []; // thin relationships honestly have little crystallized
  const topics = topicsFor(s);
  const claims: MockKnowledgeClaim[] = [
    {
      id: `claim-${s.name}-1`,
      human_readable_claim: `${s.firstName} is a consistent source of ${s.archetype === 'mentor' || s.archetype === 'coach' ? 'guidance' : s.archetype === 'family' ? 'support' : 'connection'} in your life`,
      confidence: r2(clamp(0.6 + s.closeness * 0.3, 0.6, 0.95)),
      evidence_count: Math.max(2, Math.round(s.memoryCount / 6)),
      knowledge_type: 'relationship_pattern',
      evidence_links: [
        { evidence_summary: `Recurring positive mentions of ${s.firstName} across your entries` },
        { evidence_summary: `${s.firstName} appears at several significant moments` },
      ],
      last_reinforced_at: daysAgoIso(Math.round(7 + jitter(s.name, 'kc', 10))),
    },
  ];
  if (topics[0]) {
    claims.push({
      id: `claim-${s.name}-2`,
      human_readable_claim: `You and ${s.firstName} consistently connect over ${topics[0]}`,
      confidence: r2(clamp(0.55 + s.closeness * 0.25, 0.55, 0.9)),
      evidence_count: Math.max(2, Math.round(s.memoryCount / 8)),
      knowledge_type: 'shared_interest',
      evidence_links: [{ evidence_summary: `${topics[0]} comes up repeatedly when you write about ${s.firstName}` }],
      last_reinforced_at: daysAgoIso(Math.round(14 + jitter(s.name, 'kc2', 12))),
    });
  }
  return claims;
}

function genSceneCandidates(s: Signals): MockSceneCandidate[] {
  if (s.memoryCount < 10) return [];
  const topics = topicsFor(s);
  return [
    {
      id: `scene-${s.name}-1`,
      canonical_title: `Regular time with ${s.firstName}`,
      recurring_activities: topics.slice(0, 3),
      continuity_strength: r2(clamp(0.55 + s.closeness * 0.35, 0.5, 0.95)),
      occurrence_count: Math.max(2, Math.round(s.memoryCount / 5)),
      last_seen_at: daysAgoIso(Math.round(10 + jitter(s.name, 'scene', 8))),
    },
  ];
}

// ── Curated hero overrides (preserve the original hand-written richness) ──────
const CURATED_DYNAMICS: Record<string, MockDynamics> = {
  'Sarah Chen': { person_name: 'Sarah Chen', metrics: { interaction_frequency: 8.2, average_sentiment: 0.82, positive_ratio: 0.91, conflict_frequency: 0.1, support_frequency: 3.1, last_interaction_days_ago: 7, interaction_consistency: 0.88 }, health: { overall_health: 'excellent', health_score: 91, factors: { sentiment: 94, frequency: 88, consistency: 90, conflict_level: 97, support_level: 85 }, trends: { health_trend: 'improving', sentiment_trend: 'improving', frequency_trend: 'stable' }, strengths: ['Consistent support', 'High mutual trust', 'Deep conversation quality'] }, lifecycle: { current_stage: 'deepening', stage_confidence: 0.93, stage_history: [{ stage: 'forming', start_date: '2018-09-15', duration_days: 90 }, { stage: 'developing', start_date: '2018-12-15', duration_days: 365 }, { stage: 'established', start_date: '2019-12-15', duration_days: 730 }, { stage: 'deepening', start_date: '2021-12-15', duration_days: 900 }] }, common_topics: ['creative work', 'relationships', 'career growth'], total_interactions: 156 },
  'Alex': { person_name: 'Alex', metrics: { interaction_frequency: 12.5, average_sentiment: 0.89, positive_ratio: 0.95, conflict_frequency: 0.05, support_frequency: 5.2, last_interaction_days_ago: 2, interaction_consistency: 0.94 }, health: { overall_health: 'excellent', health_score: 96, factors: { sentiment: 97, frequency: 95, consistency: 94, conflict_level: 99, support_level: 96 }, trends: { health_trend: 'improving', sentiment_trend: 'improving', frequency_trend: 'increasing' }, strengths: ['Emotional intimacy', 'Frequent contact', 'Shared growth'] }, lifecycle: { current_stage: 'deepening', stage_confidence: 0.97, stage_history: [{ stage: 'forming', start_date: '2023-06-01', duration_days: 60 }, { stage: 'developing', start_date: '2023-08-01', duration_days: 120 }, { stage: 'deepening', start_date: '2023-12-01', duration_days: 180 }] }, common_topics: ['creativity', 'future', 'nature', 'music'], total_interactions: 210 },
  'Marcus Johnson': { person_name: 'Marcus Johnson', metrics: { interaction_frequency: 4.1, average_sentiment: 0.76, positive_ratio: 0.88, conflict_frequency: 0.05, support_frequency: 2.8, last_interaction_days_ago: 14, interaction_consistency: 0.72 }, health: { overall_health: 'good', health_score: 82, factors: { sentiment: 84, frequency: 72, consistency: 74, conflict_level: 96, support_level: 88 }, trends: { health_trend: 'stable', sentiment_trend: 'stable', frequency_trend: 'stable' }, strengths: ['Trusted guidance', 'Career impact', 'Long-term consistency'] }, lifecycle: { current_stage: 'established', stage_confidence: 0.88, stage_history: [{ stage: 'forming', start_date: '2020-03-10', duration_days: 120 }, { stage: 'developing', start_date: '2020-07-10', duration_days: 365 }, { stage: 'established', start_date: '2021-07-10', duration_days: 1100 }] }, common_topics: ['career', 'creativity', 'self-improvement'], total_interactions: 98 },
  'Jordan Kim': { person_name: 'Jordan Kim', metrics: { interaction_frequency: 6.8, average_sentiment: 0.85, positive_ratio: 0.93, conflict_frequency: 0.02, support_frequency: 4.1, last_interaction_days_ago: 5, interaction_consistency: 0.85 }, health: { overall_health: 'excellent', health_score: 93, factors: { sentiment: 93, frequency: 86, consistency: 87, conflict_level: 99, support_level: 94 }, trends: { health_trend: 'stable', sentiment_trend: 'stable', frequency_trend: 'stable' }, strengths: ['Unconditional support', 'Lifelong bond', 'Emotional safety'] }, lifecycle: { current_stage: 'established', stage_confidence: 0.98, stage_history: [{ stage: 'forming', start_date: '1995-01-01', duration_days: 3650 }, { stage: 'established', start_date: '2005-01-01', duration_days: 7300 }] }, common_topics: ['family', 'life goals', 'support', 'health'], total_interactions: 312 },
};

const CURATED_INFLUENCE: Record<string, MockInfluence> = {
  'Sarah Chen': { person: 'Sarah Chen', emotional_impact: 0.78, behavioral_impact: 0.65, toxicity_score: 0.04, uplift_score: 0.88, net_influence: 0.82, interaction_count: 156 },
  'Alex': { person: 'Alex', emotional_impact: 0.91, behavioral_impact: 0.72, toxicity_score: 0.02, uplift_score: 0.94, net_influence: 0.91, interaction_count: 210 },
  'Marcus Johnson': { person: 'Marcus Johnson', emotional_impact: 0.62, behavioral_impact: 0.81, toxicity_score: 0.06, uplift_score: 0.79, net_influence: 0.74, interaction_count: 98 },
  'Jordan Kim': { person: 'Jordan Kim', emotional_impact: 0.84, behavioral_impact: 0.55, toxicity_score: 0.01, uplift_score: 0.93, net_influence: 0.88, interaction_count: 312 },
};

const CURATED_INSIGHTS: Record<string, MockInsight[]> = {
  'Sarah Chen': [{ type: 'positive_influence', message: 'Sarah consistently brings out your creative confidence', confidence: 0.89 }, { type: 'uplifting_person', message: 'Interactions with Sarah correlate with increased journaling output', confidence: 0.82 }],
  'Alex': [{ type: 'positive_influence', message: 'Alex has been the most stabilizing presence during your creative transition', confidence: 0.95 }, { type: 'uplifting_person', message: 'Your emotional wellbeing scores are consistently higher after time with Alex', confidence: 0.93 }],
  'Marcus Johnson': [{ type: 'positive_influence', message: 'Marcus shaped your decision to pursue creative work full-time', confidence: 0.87 }, { type: 'behavior_shift_detected', message: 'Your risk tolerance for career decisions increased after mentorship sessions', confidence: 0.78 }],
  'Jordan Kim': [{ type: 'positive_influence', message: 'Jordan provides your most consistent source of unconditional support', confidence: 0.94 }, { type: 'uplifting_person', message: 'Interactions with Jordan correlate with improved emotional regulation', confidence: 0.86 }],
};

const CURATED_ATTRIBUTES: Record<string, MockAttribute[]> = {
  'Sarah Chen': [
    { attributeType: 'occupation', attributeValue: 'Product Manager', confidence: 0.92, isCurrent: true, evidence: 'Mentioned transitioning from engineering to product management at her tech company', startTime: '2022-06-01' },
    { attributeType: 'employment_status', attributeValue: 'Full-time employed', confidence: 0.95, isCurrent: true },
    { attributeType: 'workplace', attributeValue: 'Mid-size Tech Company', confidence: 0.80, isCurrent: true, evidence: 'Works at a mid-size tech company in the city' },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Coffee shop regular', confidence: 0.91, isCurrent: true, evidence: 'Meets you at coffee shops for writing sessions frequently' },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Evening socializer', confidence: 0.78, isCurrent: true },
    { attributeType: 'personality_trait', attributeValue: 'Honest and direct', confidence: 0.88, isCurrent: true, evidence: 'Described as someone who says what she thinks, even when it is hard to hear' },
    { attributeType: 'personality_trait', attributeValue: 'Loyal', confidence: 0.93, isCurrent: true, evidence: 'Has been a consistent presence since college' },
    { attributeType: 'relationship_status', attributeValue: 'In a relationship', confidence: 0.85, isCurrent: true, evidence: 'Mentioned her partner in recent conversations', startTime: '2023-01-01' },
    { attributeType: 'living_situation', attributeValue: 'City apartment', confidence: 0.76, isCurrent: true },
  ],
  'Marcus Johnson': [
    { attributeType: 'employment_status', attributeValue: 'Self-employed', confidence: 0.95, isCurrent: true },
    { attributeType: 'occupation', attributeValue: 'Executive Coach', confidence: 0.97, isCurrent: true, evidence: 'Runs his own executive coaching practice — has been doing this for over a decade' },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Early riser', confidence: 0.82, isCurrent: true, evidence: 'Often references morning routines and starting the day early' },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Meditation practitioner', confidence: 0.78, isCurrent: true, evidence: 'Frequently mentions mindfulness practices in your conversations' },
    { attributeType: 'personality_trait', attributeValue: 'Patient and deliberate', confidence: 0.90, isCurrent: true, evidence: 'Never rushes advice — always listens fully before responding' },
    { attributeType: 'personality_trait', attributeValue: 'Wise and experienced', confidence: 0.94, isCurrent: true },
    { attributeType: 'relationship_status', attributeValue: 'Married', confidence: 0.88, isCurrent: true, evidence: 'Has mentioned his wife in passing during conversations' },
    { attributeType: 'living_situation', attributeValue: 'Homeowner', confidence: 0.72, isCurrent: true },
  ],
  'Alex Rivera': [
    { attributeType: 'employment_status', attributeValue: 'Freelance / Independent', confidence: 0.89, isCurrent: true },
    { attributeType: 'occupation', attributeValue: 'Music Producer', confidence: 0.96, isCurrent: true, evidence: 'Has produced numerous tracks with you in your home studio' },
    { attributeType: 'occupation', attributeValue: 'Audio Engineer', confidence: 0.88, isCurrent: true, evidence: 'Also works as an audio engineer — how you both met through Marcus' },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Night studio sessions', confidence: 0.85, isCurrent: true, evidence: 'Most of your studio sessions together run late into the night' },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Tech-savvy creator', confidence: 0.80, isCurrent: true },
    { attributeType: 'personality_trait', attributeValue: 'Detail-oriented', confidence: 0.87, isCurrent: true, evidence: 'Spends hours perfecting a single track element — very meticulous' },
    { attributeType: 'personality_trait', attributeValue: 'Collaborative', confidence: 0.91, isCurrent: true, evidence: 'Described as someone who brings out the best in creative partners' },
    { attributeType: 'relationship_status', attributeValue: 'Single', confidence: 0.65, isCurrent: true },
    { attributeType: 'living_situation', attributeValue: 'Home studio setup', confidence: 0.84, isCurrent: true, evidence: 'Has their own home studio in addition to your sessions together' },
  ],
  'Alex': [
    { attributeType: 'occupation', attributeValue: 'Environmental Scientist', confidence: 0.88, isCurrent: true, evidence: 'Works in environmental research — you have talked about her work on sustainability projects' },
    { attributeType: 'employment_status', attributeValue: 'Full-time employed', confidence: 0.91, isCurrent: true },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Outdoor enthusiast', confidence: 0.94, isCurrent: true, evidence: 'Hiking, trail running, and nature trips are a regular part of her life' },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Early riser', confidence: 0.81, isCurrent: true, evidence: 'Frequently up before dawn for trail runs' },
    { attributeType: 'personality_trait', attributeValue: 'Grounded and present', confidence: 0.89, isCurrent: true, evidence: 'Described as someone who makes you feel calm just by being in the room' },
    { attributeType: 'personality_trait', attributeValue: 'Adventurous', confidence: 0.92, isCurrent: true },
    { attributeType: 'personality_trait', attributeValue: 'Deeply caring', confidence: 0.90, isCurrent: true, evidence: 'Remembers the small details — what you said weeks ago, what you need without being asked' },
    { attributeType: 'relationship_status', attributeValue: 'In a relationship with you', confidence: 0.99, isCurrent: true, startTime: new Date(Date.now() - 180 * DAY).toISOString() },
    { attributeType: 'living_situation', attributeValue: 'Own apartment', confidence: 0.82, isCurrent: true },
  ],
  'Jordan Kim': [
    { attributeType: 'occupation', attributeValue: 'Healthcare Professional', confidence: 0.84, isCurrent: true, evidence: 'Works in the healthcare sector — exact role not specified but clearly meaningful to them' },
    { attributeType: 'employment_status', attributeValue: 'Full-time employed', confidence: 0.90, isCurrent: true },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Regular runner', confidence: 0.88, isCurrent: true, evidence: 'You run together in Golden Gate Park — it is a recurring ritual' },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Health-conscious', confidence: 0.82, isCurrent: true },
    { attributeType: 'personality_trait', attributeValue: 'Dependable', confidence: 0.96, isCurrent: true, evidence: 'Has been there for every major moment without being asked' },
    { attributeType: 'personality_trait', attributeValue: 'Empathetic', confidence: 0.91, isCurrent: true },
    { attributeType: 'personality_trait', attributeValue: 'Quietly strong', confidence: 0.87, isCurrent: true, evidence: 'Does not make noise about it — just shows up' },
    { attributeType: 'relationship_status', attributeValue: 'In a relationship', confidence: 0.73, isCurrent: true },
    { attributeType: 'living_situation', attributeValue: 'Lives in the city', confidence: 0.79, isCurrent: true },
  ],
  'Dr. Amara Wells': [
    { attributeType: 'employment_status', attributeValue: 'Self-employed', confidence: 0.92, isCurrent: true },
    { attributeType: 'occupation', attributeValue: 'Life & Wellness Coach', confidence: 0.95, isCurrent: true, evidence: 'Licensed life coach with a gentle, question-based approach' },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Mindfulness-based', confidence: 0.86, isCurrent: true },
    { attributeType: 'personality_trait', attributeValue: 'Empowering', confidence: 0.91, isCurrent: true, evidence: 'Creates space for you to find your own answers rather than giving them' },
    { attributeType: 'personality_trait', attributeValue: 'Calm and steady', confidence: 0.88, isCurrent: true },
  ],
  'Dr. James Mitchell': [
    { attributeType: 'employment_status', attributeValue: 'Private practice', confidence: 0.94, isCurrent: true },
    { attributeType: 'occupation', attributeValue: 'Licensed Therapist', confidence: 0.97, isCurrent: true, evidence: 'Your therapist — uses evidence-based approaches, primarily CBT and ACT' },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Structured and consistent', confidence: 0.80, isCurrent: true },
    { attributeType: 'personality_trait', attributeValue: 'Compassionate', confidence: 0.89, isCurrent: true },
    { attributeType: 'personality_trait', attributeValue: 'Non-judgmental', confidence: 0.93, isCurrent: true, evidence: 'Has never made you feel judged, even when sharing difficult things' },
  ],
  'Luna Martinez': [
    { attributeType: 'employment_status', attributeValue: 'Freelance', confidence: 0.78, isCurrent: true },
    { attributeType: 'occupation', attributeValue: 'Travel Blogger', confidence: 0.82, isCurrent: true, evidence: 'Documents her adventures online — has a following' },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Spontaneous traveler', confidence: 0.93, isCurrent: true, evidence: 'Plans trips on 24-hour notice — somehow they always work out' },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Adventure-seeker', confidence: 0.90, isCurrent: true },
    { attributeType: 'personality_trait', attributeValue: 'Free-spirited', confidence: 0.88, isCurrent: true },
    { attributeType: 'personality_trait', attributeValue: 'Infectious energy', confidence: 0.85, isCurrent: true, evidence: 'Being around Luna makes you want to say yes to things' },
    { attributeType: 'relationship_status', attributeValue: 'Single', confidence: 0.70, isCurrent: true },
  ],
  'Sophia Anderson': [
    { attributeType: 'employment_status', attributeValue: 'Self-employed', confidence: 0.88, isCurrent: true },
    { attributeType: 'occupation', attributeValue: 'Author & Writing Instructor', confidence: 0.94, isCurrent: true, evidence: 'Has published two novels and teaches writing workshops' },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Early morning writer', confidence: 0.89, isCurrent: true, evidence: 'Writes for 3 hours every morning before anything else' },
    { attributeType: 'personality_trait', attributeValue: 'Precise with language', confidence: 0.87, isCurrent: true, evidence: 'Her feedback always zeros in on the exact word or sentence that is not working' },
    { attributeType: 'personality_trait', attributeValue: 'Encouraging but honest', confidence: 0.83, isCurrent: true },
  ],
  'Emma Thompson': [
    { attributeType: 'occupation', attributeValue: 'Fiction Writer', confidence: 0.79, isCurrent: true, evidence: 'Working on her first novel — you exchange drafts regularly' },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Cafe writer', confidence: 0.82, isCurrent: true },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Avid reader', confidence: 0.88, isCurrent: true, evidence: 'Always has a book recommendation ready' },
    { attributeType: 'personality_trait', attributeValue: 'Thoughtful listener', confidence: 0.84, isCurrent: true },
    { attributeType: 'personality_trait', attributeValue: 'Quietly creative', confidence: 0.80, isCurrent: true },
  ],
};

const CURATED_ALL_ATTRIBUTES: Record<string, MockAttribute[]> = {
  'Sarah Chen': [
    { attributeType: 'occupation', attributeValue: 'Software Engineer', confidence: 0.92, isCurrent: false, startTime: '2018-09-01', endTime: '2022-06-01' },
    { attributeType: 'occupation', attributeValue: 'Product Manager', confidence: 0.88, isCurrent: true, startTime: '2022-06-01' },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Coffee shop writer', confidence: 0.85, isCurrent: true },
    { attributeType: 'relationship_status', attributeValue: 'Single', confidence: 0.9, isCurrent: false, endTime: '2023-01-01' },
    { attributeType: 'relationship_status', attributeValue: 'In a relationship', confidence: 0.91, isCurrent: true, startTime: '2023-01-01' },
  ],
  'Marcus Johnson': [
    { attributeType: 'occupation', attributeValue: 'Executive Coach', confidence: 0.95, isCurrent: true },
    { attributeType: 'lifestyle_pattern', attributeValue: 'Meditation practitioner', confidence: 0.82, isCurrent: true },
  ],
  'Alex': [
    { attributeType: 'lifestyle_pattern', attributeValue: 'Outdoor enthusiast', confidence: 0.93, isCurrent: true },
    { attributeType: 'personality_trait', attributeValue: 'Emotionally supportive', confidence: 0.91, isCurrent: true },
  ],
};

// ── Public API ───────────────────────────────────────────────────────────────
export function getMockAttributes(character: Character): MockAttribute[] {
  return CURATED_ATTRIBUTES[character.name] ?? genAttributes(extractSignals(character));
}

export function getMockAllAttributes(character: Character): MockAttribute[] {
  if (CURATED_ALL_ATTRIBUTES[character.name]) return CURATED_ALL_ATTRIBUTES[character.name];
  return getMockAttributes(character);
}

export function getMockDynamics(character: Character): MockDynamics {
  return CURATED_DYNAMICS[character.name] ?? genDynamics(extractSignals(character));
}

export function getMockInfluenceProfile(character: Character): MockInfluence {
  return CURATED_INFLUENCE[character.name] ?? genInfluence(extractSignals(character));
}

export function getMockInfluenceInsights(character: Character): MockInsight[] {
  return CURATED_INSIGHTS[character.name] ?? genInsights(extractSignals(character));
}

export function getMockFacts(character: Character): MockFact[] {
  return genFacts(extractSignals(character));
}

export function getMockKnowledgeClaims(character: Character): MockKnowledgeClaim[] {
  return genKnowledgeClaims(extractSignals(character));
}

export function getMockSceneCandidates(character: Character): MockSceneCandidate[] {
  return genSceneCandidates(extractSignals(character));
}
