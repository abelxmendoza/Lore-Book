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
  if (s.closeness < 0.4) return [];
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
  if (s.memoryCount < 4) {
    // Demo mode: still show one recurring moment for named contacts
    if (s.memoryCount === 0 && s.closeness >= 0.45) {
      const topics = topicsFor(s);
      return [
        {
          id: `scene-${s.name}-demo`,
          canonical_title: `Time with ${s.firstName}`,
          recurring_activities: topics.slice(0, 2).length ? topics.slice(0, 2) : ['conversation'],
          continuity_strength: r2(clamp(0.55 + s.closeness * 0.25, 0.5, 0.85)),
          occurrence_count: 2,
          last_seen_at: daysAgoIso(14),
        },
      ];
    }
    return [];
  }
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

/** Demo characters opened with only id+name still get plausible intelligence signals. */
function enrichSignalsForDemo(c: Character): Character {
  const md = (c.metadata ?? {}) as Record<string, unknown>;
  const name = c.name ?? '';
  const isMentor =
    /professor|prof\.|dr\.|doctor|mentor|coach|teacher/i.test(name) ||
    c.archetype === 'mentor' ||
    c.archetype === 'coach';
  const memoryCount = Number(c.memory_count ?? 0);
  const closeness = Number(
    (md.closeness_score as number) ?? c.analytics?.closeness_score ?? c.importance_score ?? 0,
  );

  return {
    ...c,
    archetype: c.archetype ?? (isMentor ? 'mentor' : 'friend'),
    role: c.role ?? (isMentor ? inferRoleFromName(name) : c.role),
    memory_count: memoryCount > 0 ? memoryCount : isMentor ? 24 : 12,
    importance_score: Number(c.importance_score ?? (isMentor ? 72 : 55)),
    first_appearance: c.first_appearance ?? daysAgoIso(400),
    metadata: {
      ...md,
      closeness_score: closeness > 0 ? closeness : isMentor ? 68 : 58,
      relationship_type: (md.relationship_type as string) ?? (isMentor ? 'mentor' : 'friend'),
      first_met: (md.first_met as string) ?? c.first_appearance ?? daysAgoIso(400),
    },
    tags: c.tags?.length ? c.tags : isMentor ? ['mentorship', 'guidance'] : ['friendship'],
  };
}

function inferRoleFromName(name: string): string {
  if (/robotics|ros|engineering/i.test(name)) return 'Robotics professor';
  if (/professor|prof\./i.test(name)) return 'Professor';
  if (/dr\.|doctor/i.test(name)) return 'Doctor';
  return 'Mentor';
}

type DrCuratedBundle = { facts: MockFact[]; claims: MockKnowledgeClaim[] };

function matchDrCurated(name: string): DrCuratedBundle | null {
  if (/^dr\.?\s/i.test(name.trim()) && !CURATED_FACTS[name]) {
    const first = name.replace(/^dr\.?\s*/i, '').split(' ')[0] || 'them';
    return {
      facts: [
        {
          id: `fact-dr-${first}-role`,
          category: 'career',
          fact: `${name} is a professional contact you've discussed in conversations`,
          confidence: 0.78,
        },
        {
          id: `fact-dr-${first}-mentor`,
          category: 'relationship',
          fact: `You turn to ${name} for guidance on important decisions`,
          confidence: 0.74,
        },
        {
          id: `fact-dr-${first}-topics`,
          category: 'general',
          fact: `Career direction and personal growth come up often when you mention ${name}`,
          confidence: 0.71,
        },
      ],
      claims: [
        {
          id: `claim-dr-${first}-1`,
          human_readable_claim: `${name} appears as a trusted advisor figure in your story`,
          confidence: 0.76,
          evidence_count: 4,
          knowledge_type: 'relationship_pattern',
          evidence_links: [
            { evidence_summary: `Multiple chats reference advice or perspective from ${name}` },
          ],
          last_reinforced_at: daysAgoIso(10),
        },
        {
          id: `claim-dr-${first}-2`,
          human_readable_claim: `Mentions of ${name} often coincide with career or life-transition themes`,
          confidence: 0.68,
          evidence_count: 3,
          knowledge_type: 'life_pattern',
          evidence_links: [
            { evidence_summary: 'Recurring context around jobs, goals, or next steps' },
          ],
          last_reinforced_at: daysAgoIso(21),
        },
      ],
    };
  }
  return null;
}

const CURATED_FACTS: Record<string, MockFact[]> = {
  'Professor Smith': [
    {
      id: 'fact-psmith-1',
      category: 'career',
      fact: 'Professor Smith teaches robotics at CSUF and guided your early ROS 2 work',
      confidence: 0.92,
      status: 'updated',
    },
    {
      id: 'fact-psmith-2',
      category: 'relationship',
      fact: 'You learned ROS 2 fundamentals through office hours and lab sessions with Professor Smith',
      confidence: 0.89,
    },
    {
      id: 'fact-psmith-3',
      category: 'general',
      fact: 'Omega-1 and Gazebo simulation were topics you discussed with Professor Smith',
      confidence: 0.86,
    },
    {
      id: 'fact-psmith-4',
      category: 'personality',
      fact: 'Professor Smith is patient, technically rigorous, and pushes you toward industry-ready robotics skills',
      confidence: 0.84,
    },
  ],
  'Dr. Smith': [
    {
      id: 'fact-drsmith-1',
      category: 'career',
      fact: 'Dr. Smith is a faculty mentor connected to your robotics and engineering path',
      confidence: 0.85,
    },
    {
      id: 'fact-drsmith-2',
      category: 'relationship',
      fact: 'You have known Dr. Smith for over a year through CSUF robotics coursework',
      confidence: 0.8,
    },
    {
      id: 'fact-drsmith-3',
      category: 'history',
      fact: 'Dr. Smith encouraged you to pursue robotics careers beyond the classroom',
      confidence: 0.83,
      status: 'updated',
    },
  ],
};

const CURATED_FACTS_BY_ID: Record<string, MockFact[]> = {
  'prof-smith': CURATED_FACTS['Professor Smith'],
};

const CURATED_KNOWLEDGE_CLAIMS: Record<string, MockKnowledgeClaim[]> = {
  'Professor Smith': [
    {
      id: 'claim-psmith-1',
      human_readable_claim:
        'Professor Smith is a central mentor in your transition from restaurant work into robotics',
      confidence: 0.88,
      evidence_count: 6,
      knowledge_type: 'relationship_pattern',
      evidence_links: [
        { evidence_summary: 'ROS 2 learning arc repeatedly tied to Professor Smith in chat' },
        { evidence_summary: 'Omega-1 build milestones mention guidance from CSUF lab' },
      ],
      last_reinforced_at: daysAgoIso(8),
    },
    {
      id: 'claim-psmith-2',
      human_readable_claim:
        'Robotics career conversations often reference Professor Smith as a credibility anchor',
      confidence: 0.81,
      evidence_count: 5,
      knowledge_type: 'career_pattern',
      evidence_links: [
        { evidence_summary: 'Job search and interview prep threads mention CSUF robotics work' },
      ],
      last_reinforced_at: daysAgoIso(14),
    },
    {
      id: 'claim-psmith-3',
      human_readable_claim:
        'Your technical identity around ROS 2, Linux, and simulation strengthened after working with Professor Smith',
      confidence: 0.79,
      evidence_count: 4,
      knowledge_type: 'skill_development',
      evidence_links: [
        { evidence_summary: 'Gazebo and launch-file topics cluster around mentor sessions' },
      ],
      last_reinforced_at: daysAgoIso(20),
    },
  ],
  'Dr. Smith': [
    {
      id: 'claim-drsmith-1',
      human_readable_claim: 'Dr. Smith represents a steady academic mentor in your robotics journey',
      confidence: 0.82,
      evidence_count: 4,
      knowledge_type: 'relationship_pattern',
      evidence_links: [{ evidence_summary: 'Faculty mentorship mentioned across multiple entries' }],
      last_reinforced_at: daysAgoIso(12),
    },
    {
      id: 'claim-drsmith-2',
      human_readable_claim: 'Career ambition in robotics increased after ongoing contact with Dr. Smith',
      confidence: 0.75,
      evidence_count: 3,
      knowledge_type: 'life_pattern',
      evidence_links: [{ evidence_summary: 'Job and project goals align with mentor conversations' }],
      last_reinforced_at: daysAgoIso(18),
    },
  ],
};

const CURATED_KNOWLEDGE_CLAIMS_BY_ID: Record<string, MockKnowledgeClaim[]> = {
  'prof-smith': CURATED_KNOWLEDGE_CLAIMS['Professor Smith'],
};

const CURATED_SCENE_CANDIDATES: Record<string, MockSceneCandidate[]> = {
  'Professor Smith': [
    {
      id: 'scene-psmith-lab',
      canonical_title: 'CSUF Robotics Lab sessions',
      recurring_activities: ['ROS 2 debugging', 'Gazebo simulation', 'career advice'],
      continuity_strength: 0.86,
      occurrence_count: 8,
      last_seen_at: daysAgoIso(20),
    },
  ],
};

export type MockKnowledgeBaseBundle = {
  facts: MockFact[];
  knowledgeClaims: MockKnowledgeClaim[];
  sceneCandidates: MockSceneCandidate[];
  timelineEvents: Array<{ title: string; type: string; date: string | null; summary: string | null }>;
  conversationLinks: Array<{
    sessionId: string;
    linkKind: string;
    mentionCount: number;
    firstLinkedAt: string;
    sessionTitle?: string;
  }>;
  relatedEntities: Array<{ id: string; name: string; type: string; relationship?: string }>;
  relationshipToUser: string;
  aliases: string[];
  summary: string | null;
};

export function getMockKnowledgeBaseBundle(
  character: Character | { id: string; name: string },
): MockKnowledgeBaseBundle {
  const enriched = enrichSignalsForDemo({
    id: character.id,
    name: character.name,
    ...(('archetype' in character ? character : {}) as Partial<Character>),
  } as Character);

  const facts = getMockFacts(enriched);
  const knowledgeClaims = getMockKnowledgeClaims(enriched);
  const sceneCandidates = getMockSceneCandidates(enriched);
  const timeline = getMockCharacterTimeline(enriched);
  const s = extractSignals(enriched);

  const timelineEvents = [
    ...timeline.sharedExperiences.map((e) => ({
      title: e.eventTitle,
      type: e.eventType ?? 'social',
      date: e.eventDate,
      summary: e.eventSummary ?? null,
    })),
    ...timeline.lore.slice(0, 2).map((e) => ({
      title: e.eventTitle,
      type: e.eventType ?? 'personal',
      date: e.eventDate,
      summary: e.eventSummary ?? null,
    })),
  ];

  const isProfessorSmith =
    character.name === 'Professor Smith' || character.id === 'prof-smith';

  return {
    facts,
    knowledgeClaims,
    sceneCandidates,
    timelineEvents,
    conversationLinks: isProfessorSmith
      ? [
          {
            sessionId: 'demo-ros-origin',
            linkKind: 'origin',
            mentionCount: 4,
            firstLinkedAt: daysAgoIso(450),
            sessionTitle: 'Starting ROS 2 on Omega-1',
          },
          {
            sessionId: 'demo-robotics-career',
            linkKind: 'related',
            mentionCount: 7,
            firstLinkedAt: daysAgoIso(120),
            sessionTitle: 'Robotics job search prep',
          },
        ]
      : facts.length > 0
        ? [
            {
              sessionId: `demo-char-${character.id}`,
              linkKind: 'origin',
              mentionCount: Math.max(2, facts.length),
              firstLinkedAt: daysAgoIso(90),
              sessionTitle: `Conversation about ${s.firstName}`,
            },
          ]
        : [],
    relatedEntities: isProfessorSmith
      ? [
          { id: 'csuf-lab', name: 'CSUF Robotics Lab', type: 'location', relationship: 'lab' },
          { id: 'skill-demo-ros2', name: 'ROS 2', type: 'skill', relationship: 'taught' },
          { id: 'project-omega-1', name: 'Omega-1', type: 'project', relationship: 'advised' },
        ]
      : [],
    relationshipToUser:
      s.archetype === 'mentor' || s.archetype === 'coach'
        ? 'Mentor / teacher'
        : s.archetype === 'family'
          ? 'Family'
          : s.archetype === 'romantic'
            ? 'Partner'
            : 'Known contact',
    aliases: isProfessorSmith ? ['Prof. Smith', 'Dr. Smith'] : [],
    summary: isProfessorSmith
      ? 'Faculty mentor who anchored your ROS 2 learning and robotics career pivot.'
      : null,
  };
}

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
  if (CURATED_FACTS[character.name]) return CURATED_FACTS[character.name];
  if (character.id && CURATED_FACTS_BY_ID[character.id]) return CURATED_FACTS_BY_ID[character.id];
  const drMatch = matchDrCurated(character.name);
  if (drMatch?.facts) return drMatch.facts;
  return genFacts(extractSignals(enrichSignalsForDemo(character)));
}

export function getMockKnowledgeClaims(character: Character): MockKnowledgeClaim[] {
  if (CURATED_KNOWLEDGE_CLAIMS[character.name]) return CURATED_KNOWLEDGE_CLAIMS[character.name];
  if (character.id && CURATED_KNOWLEDGE_CLAIMS_BY_ID[character.id]) {
    return CURATED_KNOWLEDGE_CLAIMS_BY_ID[character.id];
  }
  const drMatch = matchDrCurated(character.name);
  if (drMatch?.claims) return drMatch.claims;
  return genKnowledgeClaims(extractSignals(enrichSignalsForDemo(character)));
}

export function getMockSceneCandidates(character: Character): MockSceneCandidate[] {
  if (CURATED_SCENE_CANDIDATES[character.name]) return CURATED_SCENE_CANDIDATES[character.name];
  return genSceneCandidates(extractSignals(enrichSignalsForDemo(character)));
}

// ── Timeline (shared experiences + lore without you) ─────────────────────────
export interface MockTimelineEvent {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventSummary?: string;
  eventType?: string;
  userWasPresent: boolean;
  characterRole?: string;
  connectionCharacter?: string;
  emotionalImpact?: string;
}

const CURATED_TIMELINES: Record<string, { sharedExperiences: MockTimelineEvent[]; lore: MockTimelineEvent[] }> = {
  'Sarah Chen': {
    sharedExperiences: [
      {
        id: 'tl-sc-shared-1',
        eventId: 'ev-sc-1',
        eventTitle: 'Coffee shop writing session',
        eventDate: daysAgoIso(420),
        eventSummary: 'Weekly writing meetup at the corner cafe — Sarah shared a draft chapter.',
        eventType: 'social',
        userWasPresent: true,
        characterRole: 'participant',
        emotionalImpact: 'positive',
      },
      {
        id: 'tl-sc-shared-2',
        eventId: 'ev-sc-2',
        eventTitle: 'Creative Writing Circle launch',
        eventDate: daysAgoIso(180),
        eventSummary: 'Co-founded the writing group together with Emma.',
        eventType: 'milestone',
        userWasPresent: true,
        characterRole: 'co-founder',
        connectionCharacter: 'Emma Thompson',
        emotionalImpact: 'positive',
      },
      {
        id: 'tl-sc-shared-3',
        eventId: 'ev-sc-3',
        eventTitle: 'Birthday dinner',
        eventDate: daysAgoIso(45),
        eventSummary: 'Celebrated her birthday at the new Italian place downtown.',
        eventType: 'social',
        userWasPresent: true,
        characterRole: 'guest of honor',
        emotionalImpact: 'positive',
      },
    ],
    lore: [
      {
        id: 'tl-sc-lore-1',
        eventId: 'ev-sc-4',
        eventTitle: 'Promoted to Product Manager',
        eventDate: daysAgoIso(900),
        eventSummary: 'Sarah moved from engineering into product leadership at her company.',
        eventType: 'career',
        userWasPresent: false,
        characterRole: 'subject',
        emotionalImpact: 'positive',
      },
      {
        id: 'tl-sc-lore-2',
        eventId: 'ev-sc-5',
        eventTitle: 'Tech conference keynote',
        eventDate: daysAgoIso(120),
        eventSummary: 'Spoke on narrative design in product — you heard about it afterward.',
        eventType: 'career',
        userWasPresent: false,
        characterRole: 'speaker',
        emotionalImpact: 'positive',
      },
    ],
  },
  'Marcus Johnson': {
    sharedExperiences: [
      {
        id: 'tl-mj-shared-1',
        eventId: 'ev-mj-1',
        eventTitle: 'Founders brunch',
        eventDate: daysAgoIso(300),
        eventSummary: 'Met with the creative entrepreneurs network over brunch.',
        eventType: 'social',
        userWasPresent: true,
        characterRole: 'organizer',
        emotionalImpact: 'positive',
      },
      {
        id: 'tl-mj-shared-2',
        eventId: 'ev-mj-2',
        eventTitle: 'Goal-setting workshop',
        eventDate: daysAgoIso(60),
        eventSummary: 'Marcus ran a quarterly planning session you attended.',
        eventType: 'workshop',
        userWasPresent: true,
        characterRole: 'facilitator',
        emotionalImpact: 'positive',
      },
    ],
    lore: [
      {
        id: 'tl-mj-lore-1',
        eventId: 'ev-mj-3',
        eventTitle: 'Executive coaching certification',
        eventDate: daysAgoIso(730),
        eventSummary: 'Completed advanced certification — mentioned in passing later.',
        eventType: 'career',
        userWasPresent: false,
        characterRole: 'subject',
        emotionalImpact: 'positive',
      },
    ],
  },
  'Professor Smith': {
    sharedExperiences: [
      {
        id: 'tl-ps-shared-1',
        eventId: 'ev-ps-1',
        eventTitle: 'First ROS 2 lab session',
        eventDate: daysAgoIso(450),
        eventSummary: 'Walked through nodes, topics, and launch files on Omega-1 in the CSUF robotics lab.',
        eventType: 'milestone',
        userWasPresent: true,
        characterRole: 'instructor',
        emotionalImpact: 'positive',
      },
      {
        id: 'tl-ps-shared-2',
        eventId: 'ev-ps-2',
        eventTitle: 'Gazebo simulation review',
        eventDate: daysAgoIso(280),
        eventSummary: 'Debugged URDF and sensor plugins together before the midterm project demo.',
        eventType: 'workshop',
        userWasPresent: true,
        characterRole: 'mentor',
        emotionalImpact: 'positive',
      },
      {
        id: 'tl-ps-shared-3',
        eventId: 'ev-ps-3',
        eventTitle: 'Robotics career office hours',
        eventDate: daysAgoIso(45),
        eventSummary: 'Discussed internship targets and how to talk about ROS 2 experience in interviews.',
        eventType: 'career',
        userWasPresent: true,
        characterRole: 'advisor',
        emotionalImpact: 'positive',
      },
    ],
    lore: [
      {
        id: 'tl-ps-lore-1',
        eventId: 'ev-ps-4',
        eventTitle: 'Published lab curriculum update',
        eventDate: daysAgoIso(120),
        eventSummary: 'Updated the CSUF robotics syllabus to include more industry simulation work.',
        eventType: 'career',
        userWasPresent: false,
        characterRole: 'subject',
        emotionalImpact: 'positive',
      },
    ],
  },
};

function genTimeline(s: Signals): { sharedExperiences: MockTimelineEvent[]; lore: MockTimelineEvent[] } {
  const seed = hashName(s.name);
  const sharedCount = 2 + (seed % 3);
  const loreCount = 1 + (seed % 2);
  const spanDays = Math.max(Math.round(s.yearsKnown * 365), 90);

  const sharedExperiences: MockTimelineEvent[] = [];
  for (let i = 0; i < sharedCount; i++) {
    const dayOffset = Math.round(((i + 1) / (sharedCount + 1)) * spanDays);
    sharedExperiences.push({
      id: `tl-gen-${s.name}-shared-${i}`,
      eventId: `ev-gen-${s.name}-shared-${i}`,
      eventTitle: i === 0 ? `First time you really connected` : `Shared ${s.archetype === 'family' ? 'family gathering' : 'hangout'} #${i + 1}`,
      eventDate: daysAgoIso(spanDays - dayOffset),
      eventSummary: `A meaningful moment with ${s.firstName} from your conversations.`,
      eventType: 'social',
      userWasPresent: true,
      characterRole: 'participant',
      emotionalImpact: 'positive',
    });
  }

  const lore: MockTimelineEvent[] = [];
  for (let i = 0; i < loreCount; i++) {
    const dayOffset = Math.round(((i + 1) / (loreCount + 2)) * spanDays * 0.8);
    lore.push({
      id: `tl-gen-${s.name}-lore-${i}`,
      eventId: `ev-gen-${s.name}-lore-${i}`,
      eventTitle: `${s.firstName}'s ${s.archetype === 'colleague' ? 'work milestone' : 'life update'}`,
      eventDate: daysAgoIso(spanDays - dayOffset - 30),
      eventSummary: `Something ${s.firstName} went through that you learned about later.`,
      eventType: s.archetype === 'colleague' ? 'career' : 'personal',
      userWasPresent: false,
      characterRole: 'subject',
      emotionalImpact: 'neutral',
    });
  }

  const sortAsc = (events: MockTimelineEvent[]) =>
    events.sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());

  return {
    sharedExperiences: sortAsc(sharedExperiences),
    lore: sortAsc(lore),
  };
}

export function getMockCharacterTimeline(character: Character): {
  sharedExperiences: MockTimelineEvent[];
  lore: MockTimelineEvent[];
} {
  if (CURATED_TIMELINES[character.name]) return CURATED_TIMELINES[character.name];
  if (character.id === 'prof-smith') return CURATED_TIMELINES['Professor Smith'];
  return genTimeline(extractSignals(enrichSignalsForDemo(character)));
}
