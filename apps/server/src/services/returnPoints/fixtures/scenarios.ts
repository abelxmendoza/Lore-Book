/**
 * ≥40 multi-day return-point scenarios.
 */

import type { EvidenceSnippet, SensitivityClass } from '../types';

export type ReturnPointScenario = {
  id: string;
  title: string;
  domain: string;
  evidence: EvidenceSnippet[];
  threadId?: string | null;
  contextHint?: string;
  resumingSameThread?: boolean;
  interactions?: Array<{
    returnPointId?: string;
    /** Match by evidence text substring for interaction binding after detect */
    matchText?: string;
    surfaceCount?: number;
    dismissCount?: number;
    continuedCount?: number;
    resolvedCount?: number;
    forcedState?: string;
  }>;
  /** Expect a surfaced return point (resume_prompt or quiet_context) */
  expectSurface: boolean;
  /** Substrings that should appear in selected surface if expectSurface */
  requiredSurface?: string[];
  /** Substrings that must not appear */
  forbiddenSurface?: string[];
  /** After action sequence simulation */
  afterActions?: Array<'dismiss' | 'resolve' | 'continue'>;
  expectSurfaceAfterActions?: boolean;
  notes?: string;
};

const t = (dayOffset: number) => {
  const d = new Date('2026-06-01T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d.toISOString();
};

function ev(
  id: string,
  text: string,
  day: number,
  extra?: Partial<EvidenceSnippet>,
): EvidenceSnippet {
  return {
    id,
    text,
    sourceType: extra?.sourceType ?? 'message',
    at: t(day),
    threadId: extra?.threadId ?? null,
    entities: extra?.entities,
    fromAssistant: extra?.fromAssistant,
    goalStatus: extra?.goalStatus,
    sensitivity: extra?.sensitivity as SensitivityClass | undefined,
    confidence: extra?.confidence ?? 0.85,
  };
}

export const RETURN_POINT_SCENARIOS: ReturnPointScenario[] = [
  // Required: Rocket Lab
  {
    id: 'RL1_waiting',
    title: 'Rocket Lab waiting state surfaces',
    domain: 'career',
    evidence: [
      ev('rl1', 'I submitted my interview availability to Rocket Lab.', 1, {
        entities: ['Rocket Lab'],
      }),
    ],
    expectSurface: true,
    requiredSurface: ['Rocket Lab'],
  },
  {
    id: 'RL2_resolved',
    title: 'Rocket Lab confirmed — waiting resolves',
    domain: 'career',
    evidence: [
      ev('rl1', 'I submitted my interview availability to Rocket Lab.', 1, {
        entities: ['Rocket Lab'],
      }),
      ev('rl2', 'They confirmed Monday at 4 PM for Rocket Lab.', 5, {
        entities: ['Rocket Lab'],
      }),
    ],
    expectSurface: false,
    forbiddenSurface: ['waiting'],
  },

  // Workplace assignment
  {
    id: 'WA1_waiting_assignment',
    title: 'Waiting for next lab assignment',
    domain: 'workplace',
    evidence: [
      ev('wa1', 'I finished my lab assignments and am waiting for another one.', 2),
    ],
    expectSurface: true,
    requiredSurface: ['lab', 'assignment'],
  },
  {
    id: 'WA2_resolved_assignment',
    title: 'New devices end waiting assignment',
    domain: 'workplace',
    evidence: [
      ev('wa1', 'I finished my lab assignments and am waiting for another one.', 2),
      ev('wa2', 'My manager gave me four new devices to test.', 4),
    ],
    expectSurface: false,
  },

  // Lorebook development
  {
    id: 'LB1_product_context',
    title: 'Staging pause useful in product context',
    domain: 'product',
    evidence: [
      ev(
        'lb1',
        'Memory Quality v2 is complete, but hosted staging is blocked. I shifted toward product intelligence.',
        3,
      ),
    ],
    contextHint: 'lorebook product continuity chat',
    expectSurface: true,
    requiredSurface: ['staging', 'product'],
  },
  {
    id: 'LB2_vocab_context',
    title: 'Do not surface product thread on vocab question',
    domain: 'product',
    evidence: [
      ev(
        'lb1',
        'Memory Quality v2 is complete, but hosted staging is blocked.',
        3,
      ),
    ],
    contextHint: 'unrelated vocab what does forlorn mean',
    expectSurface: false,
  },

  // Sensitive restraint
  {
    id: 'S1_workplace_insecurity',
    title: 'No unsolicited workplace insecurity surface',
    domain: 'sensitive',
    evidence: [
      ev('s1', "I'm worried my team dislikes me and still waiting for feedback on that.", 4, {
        sensitivity: 'workplace_insecurity',
      }),
    ],
    expectSurface: false,
  },
  {
    id: 'S2_same_thread_sensitive',
    title: 'Same-thread sensitive is chat_only not banner',
    domain: 'sensitive',
    evidence: [
      ev('s1', "I'm worried my team dislikes me.", 4, {
        sensitivity: 'workplace_insecurity',
        threadId: 'thread-anx',
      }),
    ],
    threadId: 'thread-anx',
    resumingSameThread: true,
    expectSurface: false,
    notes: 'May allow quiet context internally but not unsolicited banner',
  },

  // Abandoned goal
  {
    id: 'AG1_tesla_abandoned',
    title: 'Tesla abandoned after aerospace focus',
    domain: 'career',
    evidence: [
      ev('ag1', 'I want to apply to Tesla.', 1, {
        sourceType: 'goal',
        goalStatus: 'active',
        entities: ['Tesla'],
      }),
      ev('ag2', "I'm no longer interested in Tesla. I'm focused on aerospace.", 6, {
        entities: ['Tesla'],
      }),
    ],
    expectSurface: false,
    forbiddenSurface: ['Tesla'],
  },

  // Conditional must not open
  {
    id: 'C1_conditional_move',
    title: 'Conditional move is not an open thread',
    domain: 'hard',
    evidence: [ev('c1', 'If I get the job, I might move.', 2)],
    expectSurface: false,
  },
  {
    id: 'C2_real_interview',
    title: 'Real interview is an open thread',
    domain: 'career',
    evidence: [ev('c2', "I'm interviewing with Rocket Lab on Monday.", 2, {
      entities: ['Rocket Lab'],
    })],
    expectSurface: true,
    requiredSurface: ['Rocket Lab'],
  },

  // Assistant suggestion not a commitment
  {
    id: 'AS1_assistant',
    title: 'Assistant suggestion does not create return point',
    domain: 'hard',
    evidence: [
      ev('as1', 'You should follow up with the recruiter tomorrow.', 2, {
        fromAssistant: true,
      }),
    ],
    expectSurface: false,
  },

  // Dismiss controls
  {
    id: 'D1_dismiss_hides',
    title: 'Dismiss hides return point',
    domain: 'lifecycle',
    evidence: [ev('d1', 'I am still waiting to hear back from Acme Corp.', 1, {
      entities: ['Acme Corp'],
    })],
    expectSurface: true,
    afterActions: ['dismiss'],
    expectSurfaceAfterActions: false,
  },
  {
    id: 'D2_resolve_hides',
    title: 'Resolve hides return point',
    domain: 'lifecycle',
    evidence: [ev('d2', 'Still deciding whether to accept the Blue Origin call.', 1)],
    expectSurface: true,
    afterActions: ['resolve'],
    expectSurfaceAfterActions: false,
  },

  // Family / plans
  {
    id: 'F1_family_plan',
    title: 'Family visit plan can surface (non-conflict)',
    domain: 'family',
    evidence: [ev('f1', 'I still need to schedule the family visit for next month.', 3)],
    expectSurface: true,
    requiredSurface: ['family', 'schedule'],
  },

  // Martial arts
  {
    id: 'MA1_bjj_goal',
    title: 'BJJ training goal open',
    domain: 'martial_arts',
    evidence: [ev('ma1', 'I am planning to test for my next BJJ belt and still need to finish the drills.', 2)],
    expectSurface: true,
    requiredSurface: ['BJJ'],
  },

  // Concerts / events
  {
    id: 'EV1_concert',
    title: 'Concert tickets pending',
    domain: 'events',
    evidence: [ev('ev1', 'I am waiting for the warehouse show tickets to go on sale.', 2)],
    expectSurface: true,
    requiredSurface: ['ticket', 'warehouse', 'waiting'],
  },

  // Purchases
  {
    id: 'PU1_purchase',
    title: 'Purchase decision waiting',
    domain: 'purchases',
    evidence: [ev('pu1', 'Still deciding whether to buy the new test equipment.', 2)],
    expectSurface: true,
  },

  // Appointments
  {
    id: 'AP1_appointment',
    title: 'Appointment follow-up',
    domain: 'appointments',
    evidence: [ev('ap1', 'I submitted my availability and am waiting to hear back about the dental appointment.', 2)],
    expectSurface: true,
    requiredSurface: ['waiting'],
  },

  // Coding project
  {
    id: 'CP1_project',
    title: 'Incomplete coding project',
    domain: 'projects',
    evidence: [ev('cp1', 'The Prima AI deploy is blocked and I need to finish the config fix.', 2, {
      entities: ['Prima AI'],
    })],
    expectSurface: true,
    requiredSurface: ['Prima', 'blocked', 'finish'],
  },
  {
    id: 'CP2_project_done',
    title: 'Project finished resolves',
    domain: 'projects',
    evidence: [
      ev('cp1', 'The Prima AI deploy is blocked and I need to finish the config fix.', 2),
      ev('cp2', 'Finished the Prima AI config fix and completed the deploy.', 5),
    ],
    expectSurface: false,
  },

  // Interview follow-ups
  {
    id: 'IF1_followup',
    title: 'Interview follow-up pending',
    domain: 'career',
    evidence: [ev('if1', 'I need to follow up with the SpaceX recruiter.', 2, {
      entities: ['SpaceX'],
    })],
    expectSurface: true,
    requiredSurface: ['SpaceX', 'follow'],
  },

  // Unfinished conversation
  {
    id: 'UC1_unfinished_chat',
    title: 'Unfinished conversation marker',
    domain: 'social',
    evidence: [ev('uc1', 'I still need to reply to Sam about the hiking trip.', 2, {
      entities: ['Sam'],
      threadId: 't-sam',
    })],
    threadId: 't-sam',
    expectSurface: true,
    requiredSurface: ['Sam', 'hiking'],
  },

  // Health sensitive
  {
    id: 'H1_health',
    title: 'Health waiting does not unsolicited surface',
    domain: 'sensitive',
    evidence: [ev('h1', 'I am still waiting for my lab results from the doctor.', 2, {
      sensitivity: 'health',
    })],
    expectSurface: false,
  },

  // Money sensitive
  {
    id: 'FI1_money',
    title: 'Finance stress no unsolicited surface',
    domain: 'sensitive',
    evidence: [ev('fi1', 'I am still waiting to hear about the debt consolidation offer.', 2, {
      sensitivity: 'finances',
    })],
    expectSurface: false,
  },

  // Dating sensitive
  {
    id: 'DT1_dating',
    title: 'Dating uncertainty no unsolicited surface',
    domain: 'sensitive',
    evidence: [ev('dt1', 'Still deciding whether to text them again after the awkward date.', 2, {
      sensitivity: 'dating',
    })],
    expectSurface: false,
  },

  // Rejection
  {
    id: 'RJ1_rejection',
    title: 'Rejection processing no surface',
    domain: 'sensitive',
    evidence: [ev('rj1', 'I got rejected after the interview and I am still processing it.', 2, {
      sensitivity: 'rejection',
    })],
    expectSurface: false,
  },

  // Repetition
  {
    id: 'RP1_repetition',
    title: 'High surface count without continue expires',
    domain: 'lifecycle',
    evidence: [ev('rp1', 'I am still waiting to hear back from Nova Robotics.', 1, {
      entities: ['Nova Robotics'],
    })],
    interactions: [{ matchText: 'Nova Robotics', surfaceCount: 3, continuedCount: 0 }],
    expectSurface: false,
  },

  // Goal table active
  {
    id: 'G1_active_goal',
    title: 'Active goal surfaces',
    domain: 'career',
    evidence: [
      ev('g1', 'Land an avionics role at an aerospace company', 2, {
        sourceType: 'goal',
        goalStatus: 'active',
      }),
    ],
    expectSurface: true,
    requiredSurface: ['avionics', 'aerospace'],
  },
  {
    id: 'G2_completed_goal',
    title: 'Completed goal does not surface',
    domain: 'career',
    evidence: [
      ev('g2', 'Finish the ROS tutorial', 1, {
        sourceType: 'goal',
        goalStatus: 'completed',
      }),
    ],
    expectSurface: false,
  },

  // Multiple candidates → max 1
  {
    id: 'M1_max_one',
    title: 'Only one of multiple open threads surfaces',
    domain: 'ranking',
    evidence: [
      ev('m1a', 'I am still waiting to hear back from Rocket Lab.', 5, {
        entities: ['Rocket Lab'],
      }),
      ev('m1b', 'I still need to finish the blog draft.', 1),
    ],
    expectSurface: true,
    requiredSurface: ['Rocket Lab'],
    notes: 'Prefer higher confidence waiting state',
  },

  // Empty
  {
    id: 'Z1_empty',
    title: 'No evidence → no surface',
    domain: 'empty',
    evidence: [],
    expectSurface: false,
  },

  // Generic fact not actionable
  {
    id: 'GF1_generic',
    title: 'Generic preference is not a return point',
    domain: 'hard',
    evidence: [ev('gf1', 'I like punk music.', 2)],
    expectSurface: false,
  },
  {
    id: 'GF2_cousin',
    title: 'Cousin fact is not unfinished',
    domain: 'hard',
    evidence: [ev('gf2', 'I have a cousin named James.', 2)],
    expectSurface: false,
  },

  // Progress vs waiting
  {
    id: 'PR1_lab_progress',
    title: 'Finished assignments waiting more work',
    domain: 'workplace',
    evidence: [
      ev('pr1', 'I finished my lab assignments and am waiting for another assignment.', 3),
    ],
    expectSurface: true,
    requiredSurface: ['waiting', 'lab'],
  },

  // Continuity benchmark meta
  {
    id: 'CB1_benchmark',
    title: 'Continuity benchmark prep as product thread',
    domain: 'product',
    evidence: [
      ev('cb1', 'Last time, I was preparing Lorebook continuity benchmark and still need to finish the scenarios.', 2),
    ],
    contextHint: 'lorebook chat',
    expectSurface: true,
    requiredSurface: ['benchmark', 'Lorebook', 'finish'],
  },

  // Ring lab team
  {
    id: 'RG1_ring',
    title: 'Documenting Ring lab team unfinished',
    domain: 'workplace',
    evidence: [
      ev('rg1', 'I had started documenting my Ring lab team and still need to finish the roster.', 2, {
        entities: ['Ring'],
      }),
    ],
    expectSurface: true,
    requiredSurface: ['Ring', 'finish'],
  },

  // Superseded focus
  {
    id: 'SU1_focus_shift',
    title: 'Aerospace supersedes Tesla goal',
    domain: 'career',
    evidence: [
      ev('su1', 'I want to apply to Tesla next quarter.', 1, { entities: ['Tesla'] }),
      ev('su2', "Changed my mind — I'm focused on aerospace and avionics only.", 4),
    ],
    expectSurface: false,
    forbiddenSurface: ['Tesla'],
  },

  // Correct action
  {
    id: 'CR1_correct',
    title: 'Correct marks superseded',
    domain: 'lifecycle',
    evidence: [ev('cr1', 'Still waiting on the vendor quote for cables.', 1)],
    expectSurface: true,
    afterActions: ['resolve'],
    expectSurfaceAfterActions: false,
  },

  // Music practice plan
  {
    id: 'MU1_piano',
    title: 'Piano practice plan open',
    domain: 'music',
    evidence: [ev('mu1', 'I am planning to learn a jazz standard and still need to finish scales this week.', 2)],
    expectSurface: true,
  },

  // Appointment confirmed resolves
  {
    id: 'AP2_resolved',
    title: 'Confirmed appointment resolves wait',
    domain: 'appointments',
    evidence: [
      ev('apw', 'Waiting to hear back about the interview time with Nova.', 1, {
        entities: ['Nova'],
      }),
      ev('apc', 'Nova confirmed the interview — already handled it.', 3, {
        entities: ['Nova'],
      }),
    ],
    expectSurface: false,
  },

  // Project milestone
  {
    id: 'PM1_milestone',
    title: 'Project incomplete milestone',
    domain: 'projects',
    evidence: [ev('pm1', 'The project is incomplete until we land the last integration test.', 2)],
    expectSurface: true,
    requiredSurface: ['incomplete', 'project'],
  },

  // Relationship uncertainty sensitive-ish
  {
    id: 'RU1_relationship',
    title: 'Relationship uncertainty restrained',
    domain: 'sensitive',
    evidence: [
      ev('ru1', 'Still deciding whether to stay in this dating situation.', 2, {
        sensitivity: 'dating',
      }),
    ],
    expectSurface: false,
  },

  // Weak evidence tomorrow fluff — still open but ok
  {
    id: 'TM1_tomorrow',
    title: 'Tomorrow commitment soft open',
    domain: 'plans',
    evidence: [ev('tm1', "Tomorrow I'll finally submit the expense report.", 1)],
    expectSurface: true,
    requiredSurface: ['expense', 'submit', 'Tomorrow'],
  },

  // Heard back resolves waiting
  {
    id: 'HB1_heard',
    title: 'Heard back resolves Rocket wait',
    domain: 'career',
    evidence: [
      ev('hb1', 'Waiting to hear back from Rocket Lab about the role.', 1),
      ev('hb2', 'I heard back from Rocket Lab with next steps.', 2),
    ],
    expectSurface: false,
  },
];

if (RETURN_POINT_SCENARIOS.length < 40) {
  throw new Error(`Need ≥40 return-point scenarios, got ${RETURN_POINT_SCENARIOS.length}`);
}
