import type {
  CognitiveEvaluationManifest,
  CognitiveEvaluationOutput,
  CognitiveTimelineItem,
} from './cognitiveEvaluationTypes';

const timeline = (...items: Array<[string, string | null, CognitiveTimelineItem['precision']]>): CognitiveTimelineItem[] =>
  items.map(([id, occurredAt, precision]) => ({ id, occurredAt, precision }));

const output = (overrides: Partial<CognitiveEvaluationOutput>): CognitiveEvaluationOutput => ({
  assertions: [],
  contexts: [],
  timeline: [],
  identityThreads: [],
  currentChapter: null,
  recall: '',
  narrativeTransitions: [],
  evidenceLinks: [],
  ...overrides,
});

export const goldenCognitiveScenarios: CognitiveEvaluationManifest[] = [
  {
    id: 'COG-CAREER-001', version: 'cognitive-eval-v1', title: 'Career timeline excludes unrelated life contexts', domain: 'career_timeline', synthetic: true,
    prompt: 'Build my career timeline.',
    conversation: [
      { role: 'user', content: 'I studied robotics, joined Vanguard Robotics, and later started MemoVault.' },
      { role: 'user', content: 'Jamie and I also went shopping last weekend.' },
    ],
    expectations: {
      requiredConcepts: ['robotics', 'Vanguard Robotics', 'MemoVault'],
      expectedAssertions: [
        { label: 'robotics education', concepts: ['studied', 'robotics'] },
        { label: 'Vanguard job', concepts: ['joined', 'Vanguard Robotics'] },
      ],
      requiredContexts: ['career', 'education', 'projects'], excludedContexts: ['relationships', 'shopping'],
      excludedConcepts: ['went shopping'], expectedTimelineIds: ['education', 'vanguard', 'memovault'], requireChronologicalOrder: true,
      requiredIdentityThreads: ['engineering', 'builder'], expectedCurrentChapter: 'building MemoVault',
      requiredNarrativeTransitions: ['education to robotics work', 'robotics work to founder'], minEvidenceLinks: 3, maxRecallWords: 90,
    },
    humanReviewQuestions: ['Does this read like a career progression rather than a record dump?'],
    baselineOutput: output({
      assertions: ['Studied robotics.', 'Joined Vanguard Robotics.', 'Started the MemoVault project.'], contexts: ['career', 'education', 'projects'],
      timeline: timeline(['education', '2018-01-01', 'year'], ['vanguard', '2022-01-01', 'year'], ['memovault', '2024-01-01', 'year']),
      identityThreads: ['engineering', 'builder'], currentChapter: 'building MemoVault',
      recall: 'You moved from studying robotics into engineering work at Vanguard Robotics, then began building MemoVault as a founder project.',
      narrativeTransitions: ['education to robotics work', 'robotics work to founder'],
      evidenceLinks: [{ claim: 'education', evidenceIds: ['career-1'] }, { claim: 'job', evidenceIds: ['career-1'] }, { claim: 'project', evidenceIds: ['career-1'] }],
    }),
  },
  {
    id: 'COG-IDENTITY-001', version: 'cognitive-eval-v1', title: 'Identity summary preserves dominant threads', domain: 'identity_summary', synthetic: true,
    prompt: 'What do you remember about me?',
    conversation: [{ role: 'user', content: 'Engineering, music, and building MemoVault have shaped this chapter of my life.' }],
    expectations: {
      requiredConcepts: ['engineering', 'music', 'MemoVault'],
      expectedAssertions: [{ label: 'mission', concepts: ['MemoVault', 'mission'] }],
      requiredContexts: ['identity'], excludedContexts: ['shopping'], excludedConcepts: ['generic professional'],
      requiredIdentityThreads: ['engineering', 'music', 'MemoVault'], expectedCurrentChapter: 'career rebuilding and creating',
      requiredNarrativeTransitions: ['technical work alongside creative work'], minEvidenceLinks: 3, maxRecallWords: 100,
    },
    humanReviewQuestions: ['Would the synthetic user recognize themselves?', 'Does the summary feel specific rather than generic?'],
    baselineOutput: output({
      assertions: ['Building MemoVault is a long-term mission.'], contexts: ['identity'], identityThreads: ['engineering', 'music', 'MemoVault'],
      currentChapter: 'career rebuilding and creating',
      recall: 'You are an engineering-minded builder whose long-term mission is MemoVault, while music has become an important creative outlet during a period of career rebuilding.',
      narrativeTransitions: ['technical work alongside creative work'],
      evidenceLinks: [{ claim: 'engineering', evidenceIds: ['identity-1'] }, { claim: 'music', evidenceIds: ['identity-1'] }, { claim: 'mission', evidenceIds: ['identity-1'] }],
    }),
  },
  {
    id: 'COG-RELATIONSHIP-001', version: 'cognitive-eval-v1', title: 'Relationship recall excludes employment details', domain: 'relationship_recall', synthetic: true,
    prompt: 'Tell me how my friendship with Jamie changed.',
    conversation: [{ role: 'user', content: 'Jamie and I became close collaborators, drifted apart, then repaired the friendship. I changed jobs in between.' }],
    expectations: {
      requiredConcepts: ['Jamie', 'collaborators', 'drifted', 'repaired'],
      expectedAssertions: [{ label: 'repair', concepts: ['repaired', 'friendship'] }], requiredContexts: ['relationships'], excludedContexts: ['career'],
      excludedConcepts: ['changed jobs'], expectedTimelineIds: ['close', 'drift', 'repair'], requireChronologicalOrder: true,
      requiredNarrativeTransitions: ['closeness to distance', 'distance to repair'], minEvidenceLinks: 3, maxRecallWords: 85,
    },
    humanReviewQuestions: ['Does the account preserve emotional progression without inventing motives?'],
    baselineOutput: output({
      assertions: ['Jamie and the user repaired their friendship.'], contexts: ['relationships'],
      timeline: timeline(['close', '2021-01-01', 'year'], ['drift', '2023-01-01', 'year'], ['repair', '2025-01-01', 'year']),
      recall: 'You and Jamie became close collaborators, drifted apart for a period, and later repaired the friendship.',
      narrativeTransitions: ['closeness to distance', 'distance to repair'],
      evidenceLinks: [{ claim: 'close', evidenceIds: ['relationship-1'] }, { claim: 'drift', evidenceIds: ['relationship-1'] }, { claim: 'repair', evidenceIds: ['relationship-1'] }],
    }),
  },
  {
    id: 'COG-PROJECT-001', version: 'cognitive-eval-v1', title: 'Project recall preserves development stages', domain: 'project_recall', synthetic: true,
    prompt: 'How has MemoVault progressed?',
    conversation: [{ role: 'user', content: 'MemoVault went from a prototype to a memory graph and then an explainable recall system.' }],
    expectations: {
      requiredConcepts: ['MemoVault', 'prototype', 'memory graph', 'explainable recall'],
      expectedAssertions: [{ label: 'project evolution', concepts: ['MemoVault', 'explainable recall'] }], requiredContexts: ['projects', 'engineering'], excludedContexts: ['relationships'],
      expectedTimelineIds: ['prototype', 'graph', 'recall'], requireChronologicalOrder: true,
      requiredIdentityThreads: ['builder'], requiredNarrativeTransitions: ['prototype to platform'], minEvidenceLinks: 3, maxRecallWords: 80,
    },
    humanReviewQuestions: ['Does this distinguish shipped progress from planned work?'],
    baselineOutput: output({
      assertions: ['MemoVault evolved into an explainable recall system.'], contexts: ['projects', 'engineering'],
      timeline: timeline(['prototype', '2024-01-01', 'year'], ['graph', '2025-01-01', 'year'], ['recall', '2026-01-01', 'year']), identityThreads: ['builder'],
      recall: 'MemoVault began as a prototype, expanded into a memory graph, and now includes explainable recall built on that foundation.',
      narrativeTransitions: ['prototype to platform'], evidenceLinks: [{ claim: 'prototype', evidenceIds: ['project-1'] }, { claim: 'graph', evidenceIds: ['project-1'] }, { claim: 'recall', evidenceIds: ['project-1'] }],
    }),
  },
  {
    id: 'COG-CHAPTER-001', version: 'cognitive-eval-v1', title: 'Current chapter favors present trajectory', domain: 'current_chapter', synthetic: true,
    prompt: 'What chapter am I in now?',
    conversation: [{ role: 'user', content: 'After leaving my prior role, I am interviewing while building MemoVault and releasing music.' }],
    expectations: {
      requiredConcepts: ['interviewing', 'MemoVault', 'music'], expectedAssertions: [{ label: 'chapter', concepts: ['rebuilding', 'creating'] }],
      requiredContexts: ['identity', 'career', 'projects', 'music'], excludedContexts: ['travel'], requiredIdentityThreads: ['engineering', 'builder', 'music'],
      expectedCurrentChapter: 'rebuilding and creating', requiredNarrativeTransitions: ['job loss to reinvention'], minEvidenceLinks: 3, maxRecallWords: 80,
    },
    humanReviewQuestions: ['Does the present chapter dominate without erasing long-term identity?'],
    baselineOutput: output({
      assertions: ['The current chapter combines rebuilding and creating.'], contexts: ['identity', 'career', 'projects', 'music'],
      identityThreads: ['engineering', 'builder', 'music'], currentChapter: 'rebuilding and creating',
      recall: 'You are rebuilding your engineering career through interviewing while actively building MemoVault and releasing music, making this a chapter of reinvention through technical and creative work.',
      narrativeTransitions: ['job loss to reinvention'], evidenceLinks: [{ claim: 'career', evidenceIds: ['chapter-1'] }, { claim: 'project', evidenceIds: ['chapter-1'] }, { claim: 'music', evidenceIds: ['chapter-1'] }],
    }),
  },
  {
    id: 'COG-TEMPORAL-001', version: 'cognitive-eval-v1', title: 'Temporal reconstruction separates message and event time', domain: 'temporal_reconstruction', synthetic: true,
    prompt: 'What happened during the robotics demo period?',
    conversation: [{ role: 'user', content: 'Writing in 2026: the demo happened in May 2022; the exact follow-up date is unknown.' }],
    expectations: {
      requiredConcepts: ['robotics demo', 'May 2022', 'follow-up date is unknown'],
      expectedAssertions: [{ label: 'event time', concepts: ['demo', 'May 2022'] }], requiredContexts: ['timeline', 'career'], excludedContexts: ['message timestamp'],
      expectedTimelineIds: ['demo', 'follow-up'], expectedDates: { demo: '2022-05-01', 'follow-up': null }, requireChronologicalOrder: true,
      requiredNarrativeTransitions: ['demo to follow-up'], minEvidenceLinks: 2, maxRecallWords: 75,
    },
    humanReviewQuestions: ['Were unknown dates preserved instead of fabricated?'],
    baselineOutput: output({
      assertions: ['The robotics demo occurred in May 2022.'], contexts: ['timeline', 'career'],
      timeline: timeline(['demo', '2022-05-01', 'month'], ['follow-up', null, 'unknown']),
      recall: 'The robotics demo occurred in May 2022. A follow-up happened afterward, but the follow-up date is unknown.',
      narrativeTransitions: ['demo to follow-up'], evidenceLinks: [{ claim: 'demo date', evidenceIds: ['temporal-1'] }, { claim: 'unknown follow-up date', evidenceIds: ['temporal-1'] }],
    }),
  },
  {
    id: 'COG-CONTRADICTION-001', version: 'cognitive-eval-v1', title: 'Contradictions coexist with provenance', domain: 'contradiction_handling', synthetic: true,
    prompt: 'Did Marcus attend the demo?',
    conversation: [{ role: 'user', content: 'One note says Marcus attended; a later correction says Marcus did not attend.' }],
    expectations: {
      requiredConcepts: ['Marcus', 'did not attend', 'correction'],
      expectedAssertions: [{ label: 'corrected attendance', concepts: ['Marcus', 'did not attend'] }], requiredContexts: ['evidence', 'timeline'],
      excludedConcepts: ['definitely attended'], requiredNarrativeTransitions: ['assertion corrected'], minEvidenceLinks: 2, maxRecallWords: 70,
    },
    humanReviewQuestions: ['Does the answer explain the correction without deleting the earlier assertion?'],
    baselineOutput: output({
      assertions: ['Marcus did not attend the demo; this supersedes an earlier attendance assertion.'], contexts: ['evidence', 'timeline'],
      recall: 'The current account is that Marcus did not attend. An earlier note said he did, but a later correction superseded that assertion while preserving its history.',
      narrativeTransitions: ['assertion corrected'], evidenceLinks: [{ claim: 'earlier assertion', evidenceIds: ['claim-old'] }, { claim: 'correction', evidenceIds: ['claim-new'] }],
    }),
  },
  {
    id: 'COG-RECENT-001', version: 'cognitive-eval-v1', title: 'Recent changes emphasize meaningful transitions', domain: 'recent_changes', synthetic: true,
    prompt: 'What changed recently?',
    conversation: [{ role: 'user', content: 'This month I accepted a robotics role, shipped MemoVault recall, and finished a new song.' }],
    expectations: {
      requiredConcepts: ['robotics role', 'MemoVault recall', 'new song'],
      expectedAssertions: [{ label: 'career transition', concepts: ['accepted', 'robotics role'] }],
      requiredContexts: ['career', 'projects', 'music'], excludedContexts: ['shopping'],
      expectedTimelineIds: ['job', 'recall', 'song'], requireChronologicalOrder: true,
      requiredNarrativeTransitions: ['career and creative momentum'], minEvidenceLinks: 3, maxRecallWords: 75,
    },
    humanReviewQuestions: ['Are meaningful changes prioritized over incidental recent records?'],
    baselineOutput: output({
      assertions: ['Accepted a robotics role this month.'], contexts: ['career', 'projects', 'music'],
      timeline: timeline(['job', '2026-08-01', 'month'], ['recall', '2026-08-01', 'month'], ['song', '2026-08-01', 'month']),
      recall: 'Recently, you accepted a robotics role, shipped the MemoVault recall system, and finished a new song—bringing career, project, and creative momentum together.',
      narrativeTransitions: ['career and creative momentum'],
      evidenceLinks: [{ claim: 'job', evidenceIds: ['recent-1'] }, { claim: 'project', evidenceIds: ['recent-1'] }, { claim: 'song', evidenceIds: ['recent-1'] }],
    }),
  },
  {
    id: 'COG-CHARACTER-001', version: 'cognitive-eval-v1', title: 'Character summary separates observation from inference', domain: 'character_summary', synthetic: true,
    prompt: 'Summarize Marcus.',
    conversation: [{ role: 'user', content: 'Marcus collaborated on the prototype and encouraged the team during the demo. I think he values reliability.' }],
    expectations: {
      requiredConcepts: ['Marcus', 'prototype', 'demo', 'values reliability'],
      expectedAssertions: [{ label: 'observed collaboration', concepts: ['Marcus', 'collaborated', 'prototype'] }],
      requiredContexts: ['character', 'projects'], excludedContexts: ['family'], excludedConcepts: ['reliability is a proven fact'],
      requiredNarrativeTransitions: ['collaboration to support'], minEvidenceLinks: 2, maxRecallWords: 80,
    },
    humanReviewQuestions: ['Does the summary label inferred values as the user’s perception?'],
    baselineOutput: output({
      assertions: ['Marcus collaborated on the prototype.', 'The user perceives that Marcus values reliability.'], contexts: ['character', 'projects'],
      recall: 'Marcus collaborated on the prototype and supported the team during the demo. You also perceive that he values reliability, though that remains your interpretation rather than an established fact.',
      narrativeTransitions: ['collaboration to support'],
      evidenceLinks: [{ claim: 'collaboration', evidenceIds: ['character-1'] }, { claim: 'perception', evidenceIds: ['character-1'] }],
    }),
  },
  {
    id: 'COG-COMPRESSION-001', version: 'cognitive-eval-v1', title: 'Memory compression preserves defining information', domain: 'memory_compression', synthetic: true,
    prompt: 'Give me the short version of this chapter.',
    conversation: [{ role: 'user', content: 'Across many entries: robotics interviews, building MemoVault, producing music, and recovering after a job loss defined the period.' }],
    expectations: {
      requiredConcepts: ['robotics interviews', 'MemoVault', 'music', 'job loss'],
      expectedAssertions: [{ label: 'compressed chapter', concepts: ['rebuilding', 'technical', 'creative'] }],
      requiredContexts: ['identity', 'career', 'projects', 'music'], excludedContexts: ['minor errands'],
      requiredIdentityThreads: ['engineering', 'builder', 'music'], expectedCurrentChapter: 'rebuilding through technical and creative work',
      requiredNarrativeTransitions: ['setback to rebuilding'], minEvidenceLinks: 4, maxRecallWords: 55,
    },
    humanReviewQuestions: ['Does compression retain the chapter’s identity and direction?'],
    baselineOutput: output({
      assertions: ['This was a rebuilding chapter shaped by technical and creative work.'], contexts: ['identity', 'career', 'projects', 'music'],
      identityThreads: ['engineering', 'builder', 'music'], currentChapter: 'rebuilding through technical and creative work',
      recall: 'After a job loss, you rebuilt through robotics interviews, building MemoVault, and producing music—keeping engineering, purpose, and creativity connected.',
      narrativeTransitions: ['setback to rebuilding'],
      evidenceLinks: [{ claim: 'job loss', evidenceIds: ['compression-1'] }, { claim: 'interviews', evidenceIds: ['compression-1'] }, { claim: 'project', evidenceIds: ['compression-1'] }, { claim: 'music', evidenceIds: ['compression-1'] }],
    }),
  },
];
