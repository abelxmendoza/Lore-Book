/**
 * Multi-day continuity benchmark fixtures (≥30 scenarios).
 * Pure data — no OpenAI, no DB.
 */

import type { ContinuityMemoryInput } from '../types';

export type ContinuityScenario = {
  id: string;
  title: string;
  domain: string;
  /** Simulated earlier conversation days (for documentation / multi-day feel) */
  earlierDays: Array<{ day: number; user: string }>;
  storedEvidence: ContinuityMemoryInput[];
  laterMessage: string;
  requiredContinuity: string[]; // substrings expected among selected summaries/entities
  optionalContinuity?: string[];
  forbiddenContinuity: string[]; // must NOT appear in selected
  allowEmpty?: boolean; // true when correct behavior is no continuity
  requireMode?: string;
  notes?: string;
};

const day = (offset: number) => {
  const d = new Date('2026-06-01T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString();
};

export const CONTINUITY_SCENARIOS: ContinuityScenario[] = [
  // ── Required end-to-end A–E ──────────────────────────────────────────────
  {
    id: 'A_workplace_khalil',
    title: 'Workplace continuity — Khalil / Prima AI',
    domain: 'workplace',
    earlierDays: [
      { day: 1, user: 'Khalil is another temp contractor and built the internal chatbot Prima AI.' },
    ],
    storedEvidence: [
      {
        memoryId: 'm-khalil',
        memoryType: 'entity',
        summary: 'Khalil is a temp contractor who built the internal chatbot Prima AI.',
        entities: ['Khalil', 'Prima AI'],
        eventTime: day(1),
        confidence: 0.9,
        epistemicType: 'direct_statement',
        correctionState: 'active',
      },
      {
        memoryId: 'm-james-false',
        memoryType: 'entity',
        summary: 'Cousin James is linked to Prima AI (false prior resolution).',
        entities: ['Cousin James', 'Prima AI'],
        eventTime: day(0),
        confidence: 0.4,
        epistemicType: 'deterministic_inference',
        correctionState: 'contradicted',
      },
    ],
    laterMessage: 'Who on my team is good at coding?',
    requiredContinuity: ['Khalil', 'Prima'],
    forbiddenContinuity: ['Cousin James'],
    notes: 'Must not invent Khalil is the best coder — selection only.',
  },
  {
    id: 'B_behavioral_genni',
    title: 'Behavioral continuity — Genni lesson',
    domain: 'boundaries',
    earlierDays: [
      { day: 3, user: 'The situation with Genni taught me to respect boundaries.' },
    ],
    storedEvidence: [
      {
        memoryId: 'm-genni-lesson',
        memoryType: 'lesson',
        summary: 'The Genni situation taught me to respect boundaries.',
        entities: ['Genni'],
        eventTime: day(3),
        confidence: 0.88,
        epistemicType: 'direct_statement',
        sensitivity: 'dating',
        tags: ['boundaries', 'lesson'],
      },
      {
        memoryId: 'm-unrelated-party',
        memoryType: 'event',
        summary: 'I went to a loud nightclub last year and lost my jacket.',
        entities: [],
        eventTime: day(-200),
        confidence: 0.7,
        sensitivity: 'embarrassment',
      },
    ],
    laterMessage: 'Someone pulled away while we were dancing, so I backed off.',
    requiredContinuity: ['boundar', 'Genni'],
    forbiddenContinuity: ['jacket', 'nightclub'],
    requireMode: 'progress',
  },
  {
    id: 'C_career_rocketlab',
    title: 'Career continuity — aerospace opportunity',
    domain: 'career',
    earlierDays: [
      { day: 5, user: 'I want to work at SpaceX, Tesla, or a strong robotics company.' },
    ],
    storedEvidence: [
      {
        memoryId: 'm-career-goal',
        memoryType: 'goal',
        summary: 'I want to work at SpaceX, Tesla, or a strong robotics company.',
        entities: ['SpaceX', 'Tesla'],
        eventTime: day(5),
        confidence: 0.92,
        epistemicType: 'direct_statement',
        tags: ['aerospace', 'robotics', 'career'],
      },
      {
        memoryId: 'm-music',
        memoryType: 'preference',
        summary: 'I like late-night music venues on weekends.',
        entities: [],
        eventTime: day(4),
        confidence: 0.8,
      },
    ],
    laterMessage: 'Rocket Lab keeps calling me about an avionics automation role.',
    requiredContinuity: ['SpaceX', 'robotics', 'Tesla', 'work'],
    forbiddenContinuity: ['music', 'venues'],
    requireMode: 'goal_follow_up',
  },
  {
    id: 'D_no_continuity_definition',
    title: 'No continuity — dictionary question',
    domain: 'factual',
    earlierDays: [{ day: 2, user: 'I installed a Ring camera last week.' }],
    storedEvidence: [
      {
        memoryId: 'm-ring',
        memoryType: 'event',
        summary: 'I installed a Ring camera last week.',
        entities: ['Ring'],
        eventTime: day(2),
        confidence: 0.9,
      },
    ],
    laterMessage: 'What does forlorn mean?',
    requiredContinuity: [],
    forbiddenContinuity: ['Ring', 'camera'],
    allowEmpty: true,
  },
  {
    id: 'E_correction_prima',
    title: 'Correction precedence — Prima AI creator',
    domain: 'correction',
    earlierDays: [
      { day: 1, user: 'Prima AI is related to Cousin James somehow.' },
      { day: 2, user: 'Prima AI is a tool built by Khalil, not Cousin James.' },
    ],
    storedEvidence: [
      {
        memoryId: 'm-false-james',
        memoryType: 'entity',
        summary: 'Prima AI linked to Cousin James.',
        entities: ['Cousin James', 'Prima AI'],
        eventTime: day(1),
        confidence: 0.5,
        correctionState: 'contradicted',
        epistemicType: 'deterministic_inference',
      },
      {
        memoryId: 'm-correct-khalil',
        memoryType: 'correction',
        summary: 'Prima AI is a tool built by Khalil, not Cousin James.',
        entities: ['Khalil', 'Prima AI'],
        eventTime: day(2),
        confidence: 0.95,
        epistemicType: 'user_corrected',
        correctionState: 'active',
      },
    ],
    laterMessage: 'Who created Prima AI?',
    requiredContinuity: ['Khalil'],
    forbiddenContinuity: ['Cousin James'],
  },

  // ── Workplace / coworkers ────────────────────────────────────────────────
  {
    id: 'W1_coworker_feedback',
    title: 'Coworker feedback continuity',
    domain: 'workplace',
    earlierDays: [{ day: 4, user: 'Maya reviewed my PR and said my tests were thorough.' }],
    storedEvidence: [
      {
        memoryId: 'm-maya',
        memoryType: 'entity',
        summary: 'Maya reviewed my PR and said my tests were thorough.',
        entities: ['Maya'],
        eventTime: day(4),
        confidence: 0.85,
        epistemicType: 'direct_statement',
      },
    ],
    laterMessage: 'Should I ask Maya to look at this new PR?',
    requiredContinuity: ['Maya'],
    forbiddenContinuity: [],
  },
  {
    id: 'W2_same_first_name',
    title: 'Same first names — Alex coworker vs Alex cousin',
    domain: 'workplace',
    earlierDays: [
      { day: 1, user: 'Alex from hardware sits next to me in the lab.' },
      { day: 2, user: 'My cousin Alex visited for the weekend.' },
    ],
    storedEvidence: [
      {
        memoryId: 'm-alex-work',
        memoryType: 'entity',
        summary: 'Alex from hardware sits next to me in the lab.',
        entities: ['Alex'],
        eventTime: day(1),
        confidence: 0.85,
        tags: ['coworker', 'hardware', 'lab'],
      },
      {
        memoryId: 'm-alex-cousin',
        memoryType: 'entity',
        summary: 'My cousin Alex visited for the weekend.',
        entities: ['Alex', 'Cousin Alex'],
        eventTime: day(2),
        confidence: 0.85,
        tags: ['family'],
        sensitivity: 'family',
      },
    ],
    laterMessage: 'Alex helped me debug the lab fixture today.',
    requiredContinuity: ['hardware', 'lab'],
    forbiddenContinuity: ['cousin', 'weekend'],
  },

  // ── Family ───────────────────────────────────────────────────────────────
  {
    id: 'F1_family_support',
    title: 'Family support call',
    domain: 'family',
    earlierDays: [{ day: 6, user: 'Mom called after my interview and told me she was proud.' }],
    storedEvidence: [
      {
        memoryId: 'm-mom',
        memoryType: 'event',
        summary: 'Mom called after my interview and told me she was proud.',
        entities: ['Mom'],
        eventTime: day(6),
        confidence: 0.9,
        sensitivity: 'family',
      },
    ],
    laterMessage: 'I got a second-round interview invite today.',
    requiredContinuity: ['interview'],
    forbiddenContinuity: [],
    optionalContinuity: ['Mom', 'proud'],
  },

  // ── Friendships ──────────────────────────────────────────────────────────
  {
    id: 'FR1_friend_plans',
    title: 'Friend unfinished plan',
    domain: 'friendship',
    earlierDays: [{ day: 7, user: 'Sam and I still need to schedule the hiking trip.' }],
    storedEvidence: [
      {
        memoryId: 'm-sam-hike',
        memoryType: 'plan',
        summary: 'Sam and I still need to schedule the hiking trip.',
        entities: ['Sam'],
        eventTime: day(7),
        confidence: 0.8,
        tags: ['unfinished', 'waiting'],
      },
    ],
    laterMessage: 'Sam texted free this Saturday.',
    requiredContinuity: ['hike', 'Sam'],
    forbiddenContinuity: [],
  },

  // ── Dating (sensitive restraint) ─────────────────────────────────────────
  {
    id: 'DT1_sensitive_no_recall',
    title: 'Sensitive dating memory must not dump on unrelated chat',
    domain: 'dating',
    earlierDays: [{ day: 8, user: 'That date ended awkwardly and I felt embarrassed.' }],
    storedEvidence: [
      {
        memoryId: 'm-awkward-date',
        memoryType: 'event',
        summary: 'That date ended awkwardly and I felt embarrassed.',
        entities: [],
        eventTime: day(8),
        confidence: 0.85,
        sensitivity: 'embarrassment',
      },
    ],
    laterMessage: 'What should I cook for dinner tonight?',
    requiredContinuity: [],
    forbiddenContinuity: ['date', 'embarrass', 'awkward'],
    allowEmpty: true,
  },
  {
    id: 'DT2_sensitive_allowed_when_relevant',
    title: 'Sensitive memory allowed with strong link',
    domain: 'dating',
    earlierDays: [{ day: 3, user: 'The Genni situation taught me to respect boundaries.' }],
    storedEvidence: [
      {
        memoryId: 'm-genni2',
        memoryType: 'lesson',
        summary: 'The Genni situation taught me to respect boundaries.',
        entities: ['Genni'],
        eventTime: day(3),
        confidence: 0.9,
        sensitivity: 'dating',
        epistemicType: 'direct_statement',
      },
    ],
    laterMessage: 'I almost pushed for another dance with Genni but stopped myself.',
    requiredContinuity: ['Genni', 'boundar'],
    forbiddenContinuity: [],
  },

  // ── Projects / robotics ──────────────────────────────────────────────────
  {
    id: 'P1_robotics_learning',
    title: 'Robotics learning continuity',
    domain: 'robotics',
    earlierDays: [{ day: 9, user: 'I finished the ROS navigation tutorial and felt more confident on hardware.' }],
    storedEvidence: [
      {
        memoryId: 'm-ros',
        memoryType: 'event',
        summary: 'I finished the ROS navigation tutorial and felt more confident on hardware.',
        entities: ['ROS'],
        eventTime: day(9),
        confidence: 0.88,
        tags: ['robotics', 'learning', 'confidence'],
      },
    ],
    laterMessage: 'The lab wants me to run a mobile base demo next week.',
    requiredContinuity: ['ROS', 'hardware', 'confident'],
    forbiddenContinuity: [],
  },
  {
    id: 'P2_project_setback',
    title: 'Project setback then recovery',
    domain: 'projects',
    earlierDays: [{ day: 10, user: 'The Prima AI deploy failed last night and I felt stuck.' }],
    storedEvidence: [
      {
        memoryId: 'm-deploy-fail',
        memoryType: 'event',
        summary: 'The Prima AI deploy failed last night and I felt stuck.',
        entities: ['Prima AI'],
        eventTime: day(10),
        confidence: 0.86,
      },
    ],
    laterMessage: 'Prima AI is green in staging after the config fix.',
    requiredContinuity: ['Prima'],
    forbiddenContinuity: [],
  },

  // ── Job interviews ───────────────────────────────────────────────────────
  {
    id: 'J1_interview_prep',
    title: 'Interview loop continuity',
    domain: 'career',
    earlierDays: [{ day: 11, user: 'I have a systems design interview at a robotics company Thursday.' }],
    storedEvidence: [
      {
        memoryId: 'm-interview',
        memoryType: 'plan',
        summary: 'I have a systems design interview at a robotics company Thursday.',
        entities: [],
        eventTime: day(11),
        confidence: 0.9,
        tags: ['interview', 'robotics'],
      },
    ],
    laterMessage: 'Any last tips before Thursday?',
    requiredContinuity: ['interview', 'systems', 'Thursday'],
    forbiddenContinuity: [],
  },

  // ── Martial arts ─────────────────────────────────────────────────────────
  {
    id: 'MA1_bjj',
    title: 'Martial arts routine',
    domain: 'martial_arts',
    earlierDays: [{ day: 12, user: 'I started BJJ twice a week and my guard retention is improving.' }],
    storedEvidence: [
      {
        memoryId: 'm-bjj',
        memoryType: 'preference',
        summary: 'I started BJJ twice a week and my guard retention is improving.',
        entities: [],
        eventTime: day(12),
        confidence: 0.85,
        tags: ['bjj', 'routine'],
      },
    ],
    laterMessage: 'I skipped class yesterday and feel rusty.',
    requiredContinuity: ['BJJ', 'guard'],
    forbiddenContinuity: [],
  },

  // ── Music / nightlife (must not leak into work) ──────────────────────────
  {
    id: 'MU1_nightlife_not_at_work',
    title: 'Nightlife memory irrelevant at work',
    domain: 'music',
    earlierDays: [{ day: 13, user: 'The DJ set at Output was incredible Saturday.' }],
    storedEvidence: [
      {
        memoryId: 'm-dj',
        memoryType: 'event',
        summary: 'The DJ set at Output was incredible Saturday.',
        entities: ['Output'],
        eventTime: day(13),
        confidence: 0.8,
      },
    ],
    laterMessage: 'Can you help me write a stand-up for tomorrow morning?',
    requiredContinuity: [],
    forbiddenContinuity: ['DJ', 'Output', 'Saturday'],
    allowEmpty: true,
  },

  // ── Routines ─────────────────────────────────────────────────────────────
  {
    id: 'R1_morning_routine',
    title: 'Morning routine continuity',
    domain: 'routines',
    earlierDays: [{ day: 14, user: 'I journal for ten minutes every morning before work.' }],
    storedEvidence: [
      {
        memoryId: 'm-journal',
        memoryType: 'preference',
        summary: 'I journal for ten minutes every morning before work.',
        entities: [],
        eventTime: day(14),
        confidence: 0.84,
        tags: ['routine', 'journal'],
      },
    ],
    laterMessage: 'I missed journaling three days in a row.',
    requiredContinuity: ['journal'],
    forbiddenContinuity: [],
  },

  // ── Setbacks / confidence ────────────────────────────────────────────────
  {
    id: 'S1_confidence_contrast',
    title: 'Confidence change contrast',
    domain: 'confidence',
    earlierDays: [
      { day: 2, user: 'I used to feel unsure about hardware testing.' },
      { day: 15, user: 'Lately I have been handling more lab assignments independently.' },
    ],
    storedEvidence: [
      {
        memoryId: 'm-unsure',
        memoryType: 'lesson',
        summary: 'I used to feel unsure about hardware testing.',
        entities: [],
        eventTime: day(2),
        confidence: 0.8,
        tags: ['hardware', 'confidence'],
      },
      {
        memoryId: 'm-independent',
        memoryType: 'lesson',
        summary: 'Lately I have been handling more lab assignments independently.',
        entities: [],
        eventTime: day(15),
        confidence: 0.85,
        tags: ['lab', 'confidence'],
      },
    ],
    laterMessage: 'They asked me to own the hardware test plan alone this sprint.',
    requiredContinuity: ['hardware', 'lab', 'independ'],
    forbiddenContinuity: [],
  },

  // ── Preference change ────────────────────────────────────────────────────
  {
    id: 'PR1_tesla_to_aerospace',
    title: 'Preference change Tesla → aerospace',
    domain: 'career',
    earlierDays: [
      { day: 1, user: 'I used to want Tesla more than anything.' },
      { day: 16, user: 'Now I am focused on aerospace and avionics roles.' },
    ],
    storedEvidence: [
      {
        memoryId: 'm-old-tesla',
        memoryType: 'goal',
        summary: 'I used to want Tesla more than anything.',
        entities: ['Tesla'],
        eventTime: day(1),
        confidence: 0.7,
        correctionState: 'historical_only',
        tags: ['career'],
      },
      {
        memoryId: 'm-new-aero',
        memoryType: 'goal',
        summary: 'Now I am focused on aerospace and avionics roles.',
        entities: [],
        eventTime: day(16),
        confidence: 0.92,
        epistemicType: 'direct_statement',
        tags: ['aerospace', 'avionics', 'career'],
      },
    ],
    laterMessage: 'Would an avionics automation role fit what I want?',
    requiredContinuity: ['aerospace', 'avionics'],
    forbiddenContinuity: [],
    optionalContinuity: ['Tesla'], // historical ok only as contrast, not primary false goal
  },

  // ── Pronouns / weak evidence ─────────────────────────────────────────────
  {
    id: 'PRN1_weak_pronoun',
    title: 'Weak pronoun memory should not dominate',
    domain: 'hard',
    earlierDays: [{ day: 17, user: 'They said the deadline moved.' }],
    storedEvidence: [
      {
        memoryId: 'm-they',
        memoryType: 'event',
        summary: 'They said the deadline moved.',
        entities: [],
        eventTime: day(17),
        confidence: 0.35,
        epistemicType: 'weak_pattern',
      },
      {
        memoryId: 'm-pm-jordan',
        memoryType: 'entity',
        summary: 'Jordan is the PM who owns the roadmap deadlines.',
        entities: ['Jordan'],
        eventTime: day(10),
        confidence: 0.88,
        epistemicType: 'direct_statement',
      },
    ],
    laterMessage: 'Who should I ask about the new deadline?',
    requiredContinuity: ['Jordan'],
    forbiddenContinuity: [],
  },

  // ── Similar but unrelated events ─────────────────────────────────────────
  {
    id: 'U1_similar_unrelated',
    title: 'Similar wording unrelated memory',
    domain: 'hard',
    earlierDays: [{ day: 18, user: 'I backed up the database after the outage.' }],
    storedEvidence: [
      {
        memoryId: 'm-db-backup',
        memoryType: 'event',
        summary: 'I backed up the database after the outage.',
        entities: [],
        eventTime: day(18),
        confidence: 0.85,
      },
      {
        memoryId: 'm-boundary',
        memoryType: 'lesson',
        summary: 'I learned to back off when someone pulls away on the dance floor.',
        entities: [],
        eventTime: day(5),
        confidence: 0.85,
        sensitivity: 'dating',
        tags: ['boundaries'],
      },
    ],
    laterMessage: 'Someone pulled away while dancing, so I backed off.',
    requiredContinuity: ['dance', 'pull', 'bound'],
    forbiddenContinuity: ['database', 'outage', 'backup'],
  },

  // ── Unresolved plans ─────────────────────────────────────────────────────
  {
    id: 'UP1_waiting_offer',
    title: 'Unresolved offer wait',
    domain: 'career',
    earlierDays: [{ day: 19, user: 'I am still waiting to hear back from Rocket Lab.' }],
    storedEvidence: [
      {
        memoryId: 'm-waiting-rl',
        memoryType: 'plan',
        summary: 'I am still waiting to hear back from Rocket Lab.',
        entities: ['Rocket Lab'],
        eventTime: day(19),
        confidence: 0.9,
        tags: ['waiting', 'unfinished'],
      },
    ],
    laterMessage: 'No email from them yet this week.',
    requiredContinuity: ['Rocket Lab', 'waiting'],
    forbiddenContinuity: [],
  },

  // ── Workplace fear sensitive ─────────────────────────────────────────────
  {
    id: 'WF1_sensitive_workplace',
    title: 'Workplace fear not dumped into small talk',
    domain: 'workplace',
    earlierDays: [{ day: 20, user: 'I am afraid to report the hostile comments at work.' }],
    storedEvidence: [
      {
        memoryId: 'm-hostile',
        memoryType: 'event',
        summary: 'I am afraid to report the hostile comments at work.',
        entities: [],
        eventTime: day(20),
        confidence: 0.9,
        sensitivity: 'workplace_fear',
      },
    ],
    laterMessage: 'Want to grab lunch near the office?',
    requiredContinuity: [],
    forbiddenContinuity: ['hostile', 'afraid', 'report'],
    allowEmpty: true,
  },

  // ── Health sensitive ─────────────────────────────────────────────────────
  {
    id: 'H1_health_restraint',
    title: 'Health memory restraint',
    domain: 'health',
    earlierDays: [{ day: 21, user: 'Therapy this week helped with my anxiety.' }],
    storedEvidence: [
      {
        memoryId: 'm-therapy',
        memoryType: 'event',
        summary: 'Therapy this week helped with my anxiety.',
        entities: [],
        eventTime: day(21),
        confidence: 0.88,
        sensitivity: 'health',
      },
    ],
    laterMessage: 'How do I optimize a Postgres index?',
    requiredContinuity: [],
    forbiddenContinuity: ['therapy', 'anxiety'],
    allowEmpty: true,
  },

  // ── Finances ─────────────────────────────────────────────────────────────
  {
    id: 'FI1_finance_restraint',
    title: 'Finance memory restraint',
    domain: 'finances',
    earlierDays: [{ day: 22, user: 'I am stressed about credit card debt.' }],
    storedEvidence: [
      {
        memoryId: 'm-debt',
        memoryType: 'event',
        summary: 'I am stressed about credit card debt.',
        entities: [],
        eventTime: day(22),
        confidence: 0.9,
        sensitivity: 'finances',
      },
    ],
    laterMessage: 'Should I buy the new mechanical keyboard?',
    requiredContinuity: [],
    forbiddenContinuity: ['debt', 'credit'],
    allowEmpty: true,
  },

  // ── Music positive continuity ────────────────────────────────────────────
  {
    id: 'MU2_music_relevant',
    title: 'Music continuity when relevant',
    domain: 'music',
    earlierDays: [{ day: 23, user: 'I am practicing piano scales every evening.' }],
    storedEvidence: [
      {
        memoryId: 'm-piano',
        memoryType: 'preference',
        summary: 'I am practicing piano scales every evening.',
        entities: [],
        eventTime: day(23),
        confidence: 0.86,
        tags: ['piano', 'music'],
      },
    ],
    laterMessage: 'I want to learn a jazz standard next.',
    requiredContinuity: ['piano'],
    forbiddenContinuity: [],
  },

  // ── Multiple interpretations / weak ──────────────────────────────────────
  {
    id: 'MI1_weak_inference_downrank',
    title: 'Weak inference should lose to direct statement',
    domain: 'hard',
    earlierDays: [{ day: 24, user: 'Khalil pair-programmed with me on the chatbot.' }],
    storedEvidence: [
      {
        memoryId: 'm-direct',
        memoryType: 'entity',
        summary: 'Khalil pair-programmed with me on the chatbot.',
        entities: ['Khalil'],
        eventTime: day(24),
        confidence: 0.9,
        epistemicType: 'direct_statement',
      },
      {
        memoryId: 'm-weak',
        memoryType: 'entity',
        summary: 'Maybe someone else is better at coding on the team.',
        entities: [],
        eventTime: day(24),
        confidence: 0.25,
        epistemicType: 'weak_pattern',
        assistantGenerated: true,
      },
    ],
    laterMessage: 'Who have I coded with recently?',
    requiredContinuity: ['Khalil'],
    forbiddenContinuity: ['Maybe someone'],
  },

  // ── Old vs recent ────────────────────────────────────────────────────────
  {
    id: 'OR1_recent_over_stale',
    title: 'Recent goal over stale goal',
    domain: 'career',
    earlierDays: [
      { day: -400, user: 'Years ago I wanted to be a pure frontend engineer.' },
      { day: 25, user: 'My current focus is robotics systems software.' },
    ],
    storedEvidence: [
      {
        memoryId: 'm-old-fe',
        memoryType: 'goal',
        summary: 'Years ago I wanted to be a pure frontend engineer.',
        entities: [],
        eventTime: day(-400),
        confidence: 0.8,
        correctionState: 'historical_only',
      },
      {
        memoryId: 'm-new-rob',
        memoryType: 'goal',
        summary: 'My current focus is robotics systems software.',
        entities: [],
        eventTime: day(25),
        confidence: 0.92,
        epistemicType: 'direct_statement',
      },
    ],
    laterMessage: 'What kind of roles match my current focus?',
    requiredContinuity: ['robotics'],
    forbiddenContinuity: [],
  },

  // ── Friend + work name collision ─────────────────────────────────────────
  {
    id: 'NC1_jordan_collision',
    title: 'Jordan coworker vs Jordan friend',
    domain: 'hard',
    earlierDays: [
      { day: 26, user: 'Jordan on product manages the roadmap.' },
      { day: 27, user: 'My friend Jordan invited me to a birthday dinner.' },
    ],
    storedEvidence: [
      {
        memoryId: 'm-jordan-work',
        memoryType: 'entity',
        summary: 'Jordan on product manages the roadmap.',
        entities: ['Jordan'],
        eventTime: day(26),
        tags: ['product', 'work'],
        confidence: 0.9,
      },
      {
        memoryId: 'm-jordan-friend',
        memoryType: 'entity',
        summary: 'My friend Jordan invited me to a birthday dinner.',
        entities: ['Jordan'],
        eventTime: day(27),
        tags: ['friend', 'birthday'],
        confidence: 0.9,
      },
    ],
    laterMessage: 'Jordan moved the roadmap milestone again.',
    requiredContinuity: ['roadmap', 'product'],
    forbiddenContinuity: ['birthday', 'dinner'],
  },

  // ── Martial + career not mixed wrongly ───────────────────────────────────
  {
    id: 'MX1_no_mix',
    title: 'Do not mix BJJ into avionics answer',
    domain: 'hard',
    earlierDays: [
      { day: 12, user: 'I train BJJ twice a week.' },
      { day: 5, user: 'I want aerospace and robotics work.' },
    ],
    storedEvidence: [
      {
        memoryId: 'm-bjj2',
        memoryType: 'preference',
        summary: 'I train BJJ twice a week.',
        entities: [],
        eventTime: day(12),
        confidence: 0.85,
      },
      {
        memoryId: 'm-aero2',
        memoryType: 'goal',
        summary: 'I want aerospace and robotics work.',
        entities: [],
        eventTime: day(5),
        confidence: 0.9,
      },
    ],
    laterMessage: 'Rocket Lab emailed about an avionics role.',
    requiredContinuity: ['aerospace', 'robotics'],
    forbiddenContinuity: ['BJJ'],
  },

  // ── Repeated preference ──────────────────────────────────────────────────
  {
    id: 'RP1_repeated_pref',
    title: 'Repeated preference reinforced',
    domain: 'preferences',
    earlierDays: [
      { day: 28, user: 'I prefer written feedback over surprise meetings.' },
      { day: 29, user: 'Again — please async feedback, not pop-ins.' },
    ],
    storedEvidence: [
      {
        memoryId: 'm-pref-async',
        memoryType: 'preference',
        summary: 'I prefer written feedback over surprise meetings.',
        entities: [],
        eventTime: day(29),
        confidence: 0.93,
        epistemicType: 'multi_evidence_pattern',
        tags: ['repeated', 'preference'],
      },
    ],
    laterMessage: 'My manager scheduled a last-minute 1:1.',
    requiredContinuity: ['written', 'feedback', 'surprise'],
    forbiddenContinuity: [],
  },

  // ── Nightlife relevant ───────────────────────────────────────────────────
  {
    id: 'NL1_relevant_night',
    title: 'Nightlife relevant when asked',
    domain: 'music',
    earlierDays: [{ day: 30, user: 'I love late sets at warehouse venues.' }],
    storedEvidence: [
      {
        memoryId: 'm-warehouse',
        memoryType: 'preference',
        summary: 'I love late sets at warehouse venues.',
        entities: [],
        eventTime: day(30),
        confidence: 0.87,
      },
    ],
    laterMessage: 'Any venue vibe I would enjoy this weekend?',
    requiredContinuity: ['warehouse', 'late'],
    forbiddenContinuity: [],
  },

  // ── Rejection sensitive ──────────────────────────────────────────────────
  {
    id: 'RJ1_rejection_restrain',
    title: 'Rejection memory not for weather chat',
    domain: 'dating',
    earlierDays: [{ day: 31, user: 'I got rejected after the third date and it stung.' }],
    storedEvidence: [
      {
        memoryId: 'm-reject',
        memoryType: 'event',
        summary: 'I got rejected after the third date and it stung.',
        entities: [],
        eventTime: day(31),
        confidence: 0.9,
        sensitivity: 'rejection',
      },
    ],
    laterMessage: 'Is it going to rain tomorrow?',
    requiredContinuity: [],
    forbiddenContinuity: ['rejected', 'date', 'stung'],
    allowEmpty: true,
  },

  // ── Team coding skill without overclaim ──────────────────────────────────
  {
    id: 'TC1_skill_recall',
    title: 'Skill continuity without ranking invention',
    domain: 'workplace',
    earlierDays: [{ day: 32, user: 'Priya owns the data pipeline and writes most of our SQL.' }],
    storedEvidence: [
      {
        memoryId: 'm-priya',
        memoryType: 'entity',
        summary: 'Priya owns the data pipeline and writes most of our SQL.',
        entities: ['Priya'],
        eventTime: day(32),
        confidence: 0.9,
        epistemicType: 'direct_statement',
      },
    ],
    laterMessage: 'Who knows our data stack well?',
    requiredContinuity: ['Priya', 'SQL', 'pipeline'],
    forbiddenContinuity: [],
  },

  // ── Empty store ──────────────────────────────────────────────────────────
  {
    id: 'Z1_empty',
    title: 'No memories — empty selection',
    domain: 'factual',
    earlierDays: [],
    storedEvidence: [],
    laterMessage: 'How are you today?',
    requiredContinuity: [],
    forbiddenContinuity: [],
    allowEmpty: true,
  },
];

// Ensure ≥30
if (CONTINUITY_SCENARIOS.length < 30) {
  throw new Error(`Need ≥30 continuity scenarios, got ${CONTINUITY_SCENARIOS.length}`);
}
