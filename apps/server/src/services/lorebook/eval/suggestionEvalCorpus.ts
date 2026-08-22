/**
 * Synthetic LoreBook suggestion-quality corpus + expected-canon oracle.
 * No founder/private identities. Detection is pre-labeled so the harness stays
 * deterministic (no extra LLM calls).
 */

import type { LoreBookDomain } from '../parser/loreBookParserTypes';
import type { CandidateOutcome } from './suggestionQualityMetrics';

export const EVAL_USER_ID = 'eval-synthetic-user';

export type ExpectedCanonEntity = {
  conceptId: string;
  canonicalName: string;
  aliases: string[];
  type: string;
  book: LoreBookDomain;
  unresolved: boolean;
  relationships?: string[];
};

export type EvalCandidate = {
  id: string;
  name: string;
  domain: LoreBookDomain;
  evidence: string;
  incomingType?: string;
  writePolicy?: 'inference' | 'trusted_import' | 'user';
  applyDomains?: LoreBookDomain[];
  expectedCanonId?: string;
  expectedFirstPass: CandidateOutcome;
  expectedSecondPass: CandidateOutcome;
  unresolved?: boolean;
  expectedType?: string;
};

export type EvalDocument = {
  id: string;
  genre:
    | 'daily'
    | 'lore_dump'
    | 'resume'
    | 'correction'
    | 'rescan'
    | 'relationship'
    | 'weak_actor';
  title: string;
  text: string;
  candidates: EvalCandidate[];
};

export const EXPECTED_CANON: ExpectedCanonEntity[] = [
  {
    conceptId: 'maya-chen',
    canonicalName: 'Maya Chen',
    aliases: [],
    type: 'person',
    book: 'characters',
    unresolved: false,
    relationships: ['classmate-of:jamie-park'],
  },
  {
    conceptId: 'maya-lopez',
    canonicalName: 'Maya Lopez',
    aliases: [],
    type: 'person',
    book: 'characters',
    unresolved: false,
  },
  {
    conceptId: 'jamie-park',
    canonicalName: 'Jamie Park',
    aliases: [],
    type: 'person',
    book: 'characters',
    unresolved: false,
  },
  {
    conceptId: 'vanguard-robotics',
    canonicalName: 'Vanguard Robotics',
    aliases: ['Vanguard'],
    type: 'company',
    book: 'organizations',
    unresolved: false,
  },
  {
    conceptId: 'northwind-university',
    canonicalName: 'Northwind Western University',
    aliases: ['NWU'],
    type: 'university',
    book: 'organizations',
    unresolved: false,
  },
  {
    conceptId: 'northwind-crew',
    canonicalName: 'Northwind Crew',
    aliases: [],
    type: 'group',
    book: 'groups',
    unresolved: false,
  },
  {
    conceptId: 'northwind-labs',
    canonicalName: 'Northwind Labs',
    aliases: [],
    type: 'company',
    book: 'organizations',
    unresolved: false,
  },
  {
    conceptId: 'python',
    canonicalName: 'Python',
    aliases: ['Python programming'],
    type: 'skill',
    book: 'skills',
    unresolved: false,
  },
  {
    conceptId: 'typescript',
    canonicalName: 'TypeScript',
    aliases: [],
    type: 'skill',
    book: 'skills',
    unresolved: false,
  },
  {
    conceptId: 'failure-analysis',
    canonicalName: 'Failure Analysis',
    aliases: [],
    type: 'skill',
    book: 'skills',
    unresolved: false,
  },
  {
    conceptId: 'memovault',
    canonicalName: 'MemoVault',
    aliases: ['MemoVault App'],
    type: 'project',
    book: 'projects',
    unresolved: false,
  },
  {
    conceptId: 'memovault-launch',
    canonicalName: 'MemoVault launch',
    aliases: [],
    type: 'quest',
    book: 'quests',
    unresolved: false,
  },
  {
    conceptId: 'northwind-depot',
    canonicalName: 'Northwind Depot',
    aliases: [],
    type: 'place',
    book: 'locations',
    unresolved: false,
  },
  {
    conceptId: 'her-friend',
    canonicalName: 'her friend',
    aliases: [],
    type: 'unresolved',
    book: 'characters',
    unresolved: true,
  },
  {
    conceptId: 'guy-from-work',
    canonicalName: 'the guy from work',
    aliases: [],
    type: 'unresolved',
    book: 'characters',
    unresolved: true,
  },
  {
    conceptId: 'my-manager',
    canonicalName: 'my manager',
    aliases: [],
    type: 'unresolved',
    book: 'characters',
    unresolved: true,
  },
  {
    conceptId: 'girl-from-show',
    canonicalName: 'the girl from the show',
    aliases: [],
    type: 'unresolved',
    book: 'characters',
    unresolved: true,
  },
];

const DAILY_TEXT = [
  'Had coffee with Maya Chen and Jamie Park after class at Northwind Western University.',
  'Maya Lopez sat at the other table — different person, same first name.',
  'Later I visited Northwind Depot because Vanguard Robotics asked me to drop off a kit.',
  'I use Python at work and I am learning TypeScript.',
  'Her friend waved from across the street. The guy from work never showed.',
].join(' ');

const LORE_DUMP_TEXT = [
  'I graduated from Northwind Western University (NWU) and then joined Vanguard Robotics.',
  'Create a group called Northwind Crew for the weekend build sessions.',
  'Working on MemoVault. I need to finish the MemoVault launch.',
  'People keep calling the school USC in old notes, but the canonical school is Northwind Western University.',
  'Failure Analysis keeps getting extracted as a group even though it is just a function.',
  'Claude Code is software, not a company.',
].join(' ');

const WEAK_ACTOR_TEXT =
  'My manager pinged me. The girl from the show was unnamed. Maya stopped by — could be either Maya. Her name is Maya Chen.';

const RESUME_TEXT = [
  'Maya Chen',
  'Experience',
  'Software Engineer, Vanguard Robotics',
  'Intern, Northwind Labs',
  'Education',
  'B.S. Computer Science, NWU',
  'Skills: Python programming, TypeScript',
  'Projects: MemoVault App',
].join('\n');

const CORRECTION_TEXT = [
  'That was not Maya, it was Jamie Park.',
  'NWU is a university, not a company.',
  'Those two Mayas are different people.',
].join(' ');

export const EVAL_DOCUMENTS: EvalDocument[] = [
  {
    id: 'daily-coffee',
    genre: 'daily',
    title: 'Simple daily story',
    text: DAILY_TEXT,
    candidates: [
      cand('maya-chen-daily', 'Maya Chen', 'characters', DAILY_TEXT, {
        expectedCanonId: 'maya-chen',
        expectedFirstPass: 'CREATED_NEW',
        expectedSecondPass: 'ATTACHED_EXISTING',
        expectedType: 'person',
      }),
      cand('jamie-park-daily', 'Jamie Park', 'characters', DAILY_TEXT, {
        expectedCanonId: 'jamie-park',
        expectedFirstPass: 'CREATED_NEW',
        expectedSecondPass: 'ATTACHED_EXISTING',
        expectedType: 'person',
      }),
      cand('nwu-daily', 'Northwind Western University', 'organizations', DAILY_TEXT, {
        expectedCanonId: 'northwind-university',
        expectedFirstPass: 'CREATED_NEW',
        expectedSecondPass: 'ATTACHED_EXISTING',
        incomingType: 'university',
        expectedType: 'university',
      }),
      cand('maya-lopez-daily', 'Maya Lopez', 'characters', DAILY_TEXT, {
        expectedCanonId: 'maya-lopez',
        expectedFirstPass: 'CREATED_NEW',
        expectedSecondPass: 'ATTACHED_EXISTING',
        expectedType: 'person',
      }),
      cand('depot-daily', 'Northwind Depot', 'locations', 'I visited Northwind Depot after work', {
        expectedCanonId: 'northwind-depot',
        expectedFirstPass: 'CREATED_NEW',
        expectedSecondPass: 'ATTACHED_EXISTING',
        expectedType: 'place',
      }),
      cand('vanguard-daily', 'Vanguard Robotics', 'organizations', DAILY_TEXT, {
        expectedCanonId: 'vanguard-robotics',
        expectedFirstPass: 'CREATED_NEW',
        expectedSecondPass: 'ATTACHED_EXISTING',
        incomingType: 'company',
        expectedType: 'company',
      }),
      cand('python-daily', 'Python', 'skills', 'I use Python at Vanguard Robotics', {
        expectedCanonId: 'python',
        expectedFirstPass: 'CREATED_NEW',
        expectedSecondPass: 'ATTACHED_EXISTING',
        expectedType: 'skill',
      }),
      cand('typescript-daily', 'TypeScript', 'skills', 'I am learning TypeScript at Vanguard Robotics', {
        expectedCanonId: 'typescript',
        expectedFirstPass: 'CREATED_NEW',
        expectedSecondPass: 'ATTACHED_EXISTING',
        expectedType: 'skill',
      }),
      cand('her-friend-daily', 'her friend', 'characters', DAILY_TEXT, {
        expectedCanonId: 'her-friend',
        expectedFirstPass: 'UNRESOLVED_ACTOR',
        expectedSecondPass: 'UNRESOLVED_ACTOR',
        unresolved: true,
      }),
      cand('guy-work-daily', 'the guy from work', 'characters', DAILY_TEXT, {
        expectedCanonId: 'guy-from-work',
        expectedFirstPass: 'UNRESOLVED_ACTOR',
        expectedSecondPass: 'UNRESOLVED_ACTOR',
        unresolved: true,
      }),
    ],
  },
  {
    id: 'lore-dump',
    genre: 'lore_dump',
    title: 'Long lore dump with aliases, orgs, tools, quests',
    text: LORE_DUMP_TEXT,
    candidates: [
      cand('nwu-acronym', 'NWU', 'organizations', 'I graduated from Northwind Western University (NWU)', {
        expectedCanonId: 'northwind-university',
        expectedFirstPass: 'ATTACHED_EXISTING',
        expectedSecondPass: 'ATTACHED_EXISTING',
        incomingType: 'university',
        expectedType: 'university',
      }),
      cand('python-programming', 'Python programming', 'skills', 'I use Python programming at Vanguard Robotics', {
        expectedCanonId: 'python',
        expectedFirstPass: 'ATTACHED_EXISTING',
        expectedSecondPass: 'ATTACHED_EXISTING',
        expectedType: 'skill',
      }),
      cand('northwind-crew-user', 'Northwind Crew', 'groups', 'create a group called Northwind Crew', {
        expectedCanonId: 'northwind-crew',
        expectedFirstPass: 'CREATED_NEW',
        expectedSecondPass: 'ATTACHED_EXISTING',
        writePolicy: 'user',
        expectedType: 'group',
      }),
      cand('memovault-project', 'MemoVault', 'projects', 'Working on MemoVault with the Northwind Crew', {
        expectedCanonId: 'memovault',
        expectedFirstPass: 'CREATED_NEW',
        expectedSecondPass: 'ATTACHED_EXISTING',
        expectedType: 'project',
      }),
      cand('memovault-launch', 'MemoVault launch', 'quests', 'I need to finish the MemoVault launch', {
        expectedCanonId: 'memovault-launch',
        expectedFirstPass: 'CREATED_NEW',
        expectedSecondPass: 'ATTACHED_EXISTING',
        expectedType: 'quest',
      }),
      cand('failure-analysis-group', 'Failure Analysis', 'groups', 'Ring Failure Analysis keeps showing up as a group', {
        expectedFirstPass: 'REJECTED',
        expectedSecondPass: 'REJECTED',
      }),
      cand('failure-analysis-skill', 'Failure Analysis', 'skills', 'I am learning Failure Analysis at Vanguard Robotics', {
        expectedCanonId: 'failure-analysis',
        expectedFirstPass: 'CREATED_NEW',
        expectedSecondPass: 'ATTACHED_EXISTING',
        expectedType: 'skill',
      }),
      cand('claude-code-org', 'Claude Code', 'organizations', 'Claude Code is software, not a company', {
        expectedFirstPass: 'WRONG_BOOK_ROUTED',
        expectedSecondPass: 'WRONG_BOOK_ROUTED',
        incomingType: 'company',
      }),
      cand('nwu-visit-place', 'Northwind Western University', 'locations', 'I visited Northwind Western University for the reunion', {
        expectedCanonId: 'northwind-university',
        expectedFirstPass: 'ATTACHED_EXISTING',
        expectedSecondPass: 'ATTACHED_EXISTING',
        expectedType: 'university',
      }),
      cand('python-as-project', 'Python', 'projects', 'Working on Python this weekend', {
        expectedCanonId: 'python',
        expectedFirstPass: 'ATTACHED_EXISTING',
        expectedSecondPass: 'ATTACHED_EXISTING',
        expectedType: 'skill',
      }),
    ],
  },
  {
    id: 'weak-actors',
    genre: 'weak_actor',
    title: 'Character promotion quality',
    text: WEAK_ACTOR_TEXT,
    candidates: [
      cand('my-manager', 'my manager', 'characters', WEAK_ACTOR_TEXT, {
        expectedCanonId: 'my-manager',
        expectedFirstPass: 'UNRESOLVED_ACTOR',
        expectedSecondPass: 'UNRESOLVED_ACTOR',
        unresolved: true,
      }),
      cand('girl-from-show', 'the girl from the show', 'characters', WEAK_ACTOR_TEXT, {
        expectedCanonId: 'girl-from-show',
        expectedFirstPass: 'UNRESOLVED_ACTOR',
        expectedSecondPass: 'UNRESOLVED_ACTOR',
        unresolved: true,
      }),
      cand('maya-firstname', 'Maya', 'characters', 'Maya stopped by after class', {
        expectedFirstPass: 'REVIEWED',
        expectedSecondPass: 'REVIEWED',
      }),
      cand('maya-named', 'Maya Chen', 'characters', 'Her name is Maya Chen.', {
        expectedCanonId: 'maya-chen',
        expectedFirstPass: 'ATTACHED_EXISTING',
        expectedSecondPass: 'ATTACHED_EXISTING',
        expectedType: 'person',
      }),
    ],
  },
  {
    id: 'resume',
    genre: 'resume',
    title: 'Synthetic resume import',
    text: RESUME_TEXT,
    candidates: [
      cand('resume-vanguard', 'Vanguard Robotics', 'organizations', RESUME_TEXT, {
        expectedCanonId: 'vanguard-robotics',
        expectedFirstPass: 'ATTACHED_EXISTING',
        expectedSecondPass: 'ATTACHED_EXISTING',
        writePolicy: 'trusted_import',
        incomingType: 'company',
        expectedType: 'company',
      }),
      cand('resume-vanguard-alias', 'Vanguard', 'organizations', RESUME_TEXT, {
        expectedCanonId: 'vanguard-robotics',
        expectedFirstPass: 'ATTACHED_EXISTING',
        expectedSecondPass: 'ATTACHED_EXISTING',
        writePolicy: 'trusted_import',
        incomingType: 'company',
        expectedType: 'company',
      }),
      cand('resume-northwind-labs', 'Northwind Labs', 'organizations', RESUME_TEXT, {
        expectedCanonId: 'northwind-labs',
        expectedFirstPass: 'CREATED_NEW',
        expectedSecondPass: 'ATTACHED_EXISTING',
        writePolicy: 'trusted_import',
        incomingType: 'company',
        expectedType: 'company',
      }),
      cand('resume-nwu', 'NWU', 'organizations', 'B.S. Computer Science, NWU', {
        expectedCanonId: 'northwind-university',
        expectedFirstPass: 'ATTACHED_EXISTING',
        expectedSecondPass: 'ATTACHED_EXISTING',
        writePolicy: 'trusted_import',
        incomingType: 'university',
        expectedType: 'university',
      }),
      cand('resume-python', 'Python programming', 'skills', 'Skills: Python programming, TypeScript', {
        expectedCanonId: 'python',
        expectedFirstPass: 'ATTACHED_EXISTING',
        expectedSecondPass: 'ATTACHED_EXISTING',
        writePolicy: 'trusted_import',
        expectedType: 'skill',
      }),
      cand('resume-memovault-app', 'MemoVault App', 'projects', 'Projects: MemoVault App', {
        expectedCanonId: 'memovault',
        expectedFirstPass: 'ATTACHED_EXISTING',
        expectedSecondPass: 'ATTACHED_EXISTING',
        writePolicy: 'trusted_import',
        expectedType: 'project',
      }),
    ],
  },
  {
    id: 'corrections',
    genre: 'correction',
    title: 'User corrections',
    text: CORRECTION_TEXT,
    candidates: [
      cand('correction-jamie', 'Jamie Park', 'characters', 'That was not Maya, it was Jamie Park.', {
        expectedCanonId: 'jamie-park',
        expectedFirstPass: 'ATTACHED_EXISTING',
        expectedSecondPass: 'ATTACHED_EXISTING',
        expectedType: 'person',
      }),
      cand('correction-nwu-type', 'NWU', 'organizations', 'NWU is a university, not a company.', {
        expectedCanonId: 'northwind-university',
        expectedFirstPass: 'ATTACHED_EXISTING',
        expectedSecondPass: 'ATTACHED_EXISTING',
        incomingType: 'company',
        expectedType: 'university',
      }),
      cand('correction-two-mayas', 'Maya Chen', 'characters', 'Maya Chen and Maya Lopez are different people.', {
        expectedCanonId: 'maya-chen',
        expectedFirstPass: 'ATTACHED_EXISTING',
        expectedSecondPass: 'ATTACHED_EXISTING',
        expectedType: 'person',
      }),
    ],
  },
];

export const INGEST_DOCUMENT_IDS = ['daily-coffee', 'lore-dump', 'weak-actors', 'resume', 'corrections'];

export const DISMISS_CANDIDATE_IDS = ['failure-analysis-group'];
export const MERGE_CANDIDATE_IDS = ['nwu-acronym', 'resume-nwu', 'correction-nwu-type'];
export const NOT_SAME_CANDIDATE_IDS = ['maya-firstname'];
export const RESUME_DOCUMENT_IDS = ['resume'];
export const CORRECTION_DOCUMENT_IDS = ['corrections'];
export const CHARACTER_PROMOTION_IDS = ['her-friend-daily', 'guy-work-daily', 'my-manager', 'girl-from-show', 'maya-firstname', 'maya-named'];
export const TYPE_QUALITY_IDS = [
  'nwu-daily',
  'vanguard-daily',
  'claude-code-org',
  'nwu-visit-place',
  'python-as-project',
  'python-programming',
  'failure-analysis-group',
  'failure-analysis-skill',
];
export const CROSS_BOOK_IDS = ['nwu-visit-place', 'python-as-project', 'vanguard-daily', 'nwu-acronym'];

function cand(
  id: string,
  name: string,
  domain: LoreBookDomain,
  evidence: string,
  extra: Omit<EvalCandidate, 'id' | 'name' | 'domain' | 'evidence'>,
): EvalCandidate {
  return { id, name, domain, evidence, ...extra };
}

export function allEvalCandidates(): EvalCandidate[] {
  return EVAL_DOCUMENTS.flatMap((doc) => doc.candidates);
}

export function candidatesByIds(ids: string[]): EvalCandidate[] {
  const wanted = new Set(ids);
  return allEvalCandidates().filter((row) => wanted.has(row.id));
}

export function documentsByIds(ids: string[]): EvalDocument[] {
  const wanted = new Set(ids);
  return EVAL_DOCUMENTS.filter((doc) => wanted.has(doc.id));
}

export function expectedCanonById(conceptId: string): ExpectedCanonEntity | undefined {
  return EXPECTED_CANON.find((row) => row.conceptId === conceptId);
}

export function expectedStableEntities(): ExpectedCanonEntity[] {
  return EXPECTED_CANON.filter((row) => !row.unresolved);
}

export function expectedUnresolvedEntities(): ExpectedCanonEntity[] {
  return EXPECTED_CANON.filter((row) => row.unresolved);
}
