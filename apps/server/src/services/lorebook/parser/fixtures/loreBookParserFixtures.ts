/**
 * LoreBook Parse Engine — golden fixtures and assertion helpers.
 */

import { expect } from 'vitest';
import type {
  LoreBookDomain,
  LoreBookOperation,
  LoreBookParseResult,
  OperationGate,
} from '../loreBookParserTypes';
import type { CanonSeed } from '../canonIndexBuilder';
import { parseLoreBookText } from '../loreBookParseEngine';

export type OperationExpectation = {
  kind: LoreBookOperation['kind'];
  domain?: LoreBookDomain;
  nameMatch?: RegExp | string;
  relationType?: string;
  gate?: OperationGate | 'suggest' | 'review';
  forbidden?: boolean;
  minConfidence?: number;
};

export type LoreBookParserFixtureSpec = {
  id: string;
  text: string;
  canonSeed?: CanonSeed;
  includeDebug?: boolean;
  expected: OperationExpectation[];
  forbidden?: OperationExpectation[];
  minOperations?: number;
};

export const FIXTURE_PERSON_VS_PROJECT_TEXT =
  "I could've seen Hell Fairy and Baby Bats at Gothicumbia.";

export const FIXTURE_PLACE_BOUNDARY_TEXT =
  "I forgot my phone in my mom's car and had to use Find My app.";

export const FIXTURE_SCHOOL_MEMORY_TEXT =
  'Bryan Oconner is my best friend from middle school we went to Whittier Christian Middle School and practiced in the band together every Wednesday those years.';

export const FIXTURE_FAMILY_HOUSEHOLD_TEXT =
  "Yesterday was my cousin Leslie's Graduation Party at my Tio Ralph's house.";

export const FIXTURE_WORKSITE_EMPLOYER_TEXT =
  "I worked at Vanguard Robotics as a robot tech doing gripper swaps at Denny's in Hollywood.";

export const FIXTURE_TRAVEL_CLASS_TEXT =
  'I went to Japan last summer with my school Japanese Class.';

export const FIXTURE_MUSIC_LOST_FRIEND_TEXT =
  "Oscar Trujio used to be my best friend from the LA ska scene but I haven't seen him since before covid.";

export const FIXTURE_PROJECT_TRUE_POSITIVE_TEXT = 'I stayed home and built LoreBook instead.';

export const FIXTURE_CONSUMER_TOOLS_TEXT =
  'I used Codex, Cursor, and Claude Code to work on LoreBook.';

export const FIXTURE_IDENTITY_COLLISION_TEXT =
  "Abel Mendoza is me but also my estranged dad's name.";

function allOperations(result: LoreBookParseResult): LoreBookOperation[] {
  return [...result.operations, ...result.suppressed, ...result.redirects];
}

function nameOf(op: LoreBookOperation): string {
  switch (op.kind) {
    case 'suggest_add':
    case 'suggest_merge':
    case 'redirect':
    case 'suppress':
      return op.name;
    case 'link':
      return op.fromEntity.name;
    case 'attach_evidence':
      return op.quote;
    case 'update_attribute':
      return op.field;
    default:
      return '';
  }
}

function domainOf(op: LoreBookOperation): LoreBookDomain | undefined {
  if ('domain' in op) return op.domain;
  if (op.kind === 'link') return op.fromEntity.domain;
  return undefined;
}

function gateOf(op: LoreBookOperation): OperationGate | undefined {
  if ('gate' in op) return op.gate as OperationGate;
  return undefined;
}

export function operationMatches(op: LoreBookOperation, exp: OperationExpectation): boolean {
  if (op.kind !== exp.kind) return false;
  if (exp.domain && domainOf(op) !== exp.domain) return false;
  if (exp.relationType && op.kind === 'link' && op.relationType !== exp.relationType) return false;
  if (exp.gate && gateOf(op) !== exp.gate) return false;
  if (exp.minConfidence != null && 'confidence' in op && op.confidence < exp.minConfidence) return false;

  const name = nameOf(op);
  if (exp.nameMatch) {
    if (typeof exp.nameMatch === 'string') {
      if (normalize(name) !== normalize(exp.nameMatch)) return false;
    } else if (!exp.nameMatch.test(name)) {
      return false;
    }
  }
  return true;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function findMatchingOperations(
  result: LoreBookParseResult,
  exp: OperationExpectation
): LoreBookOperation[] {
  return allOperations(result).filter((op) => operationMatches(op, exp));
}

export function runLoreBookParserFixture(spec: LoreBookParserFixtureSpec): LoreBookParseResult {
  return parseLoreBookText({
    userId: `fixture:${spec.id}`,
    text: spec.text,
    canonSeed: spec.canonSeed,
    includeDebug: spec.includeDebug ?? false,
  });
}

export function assertLoreBookParserFixture(spec: LoreBookParserFixtureSpec, result?: LoreBookParseResult): void {
  const parsed = result ?? runLoreBookParserFixture(spec);

  if (spec.minOperations != null) {
    expect(parsed.operations.length).toBeGreaterThanOrEqual(spec.minOperations);
  }

  for (const exp of spec.expected ?? []) {
    const matches = findMatchingOperations(parsed, exp);
    expect(matches.length, `[${spec.id}] expected ${exp.kind} ${exp.nameMatch?.toString() ?? ''}`).toBeGreaterThan(0);

    if (exp.kind === 'suggest_add' || exp.kind === 'link' || exp.kind === 'update_attribute') {
      const op = matches[0]!;
      if ('evidence' in op && op.evidence) {
        expect(op.evidence.quote?.length ?? 0).toBeGreaterThan(0);
      }
    }
    if (exp.kind === 'suggest_add') {
      const op = matches[0] as Extract<LoreBookOperation, { kind: 'suggest_add' }>;
      expect(op.sourceSpans.length + (op.evidence.quote?.length ? 1 : 0)).toBeGreaterThan(0);
    }
  }

  for (const forbidden of spec.forbidden ?? []) {
    const hits = findMatchingOperations(parsed, { ...forbidden, forbidden: false });
    expect(hits.length, `[${spec.id}] forbidden ${forbidden.kind} ${forbidden.nameMatch?.toString() ?? ''}`).toBe(0);
  }
}

export const LOREBOOK_PARSER_FIXTURE_PACK: LoreBookParserFixtureSpec[] = [
  {
    id: 'person_vs_project_hell_fairy',
    text: FIXTURE_PERSON_VS_PROJECT_TEXT,
    canonSeed: {
      characters: [{ name: 'Hell Fairy' }, { name: 'Baby Bats' }],
    },
    expected: [{ kind: 'attach_evidence', nameMatch: /Hell Fairy/i }],
    forbidden: [{ kind: 'suggest_add', domain: 'projects', nameMatch: /Hell Fairy/i }],
  },
  {
    id: 'person_vs_project_gothicumbia_event',
    text: FIXTURE_PERSON_VS_PROJECT_TEXT,
    expected: [
      { kind: 'suggest_add', domain: 'events', nameMatch: /Gothicumbia/i },
    ],
    forbidden: [{ kind: 'suggest_add', domain: 'projects', nameMatch: /Hell Fairy/i }],
  },
  {
    id: 'place_boundary_find_my',
    text: FIXTURE_PLACE_BOUNDARY_TEXT,
    expected: [
      { kind: 'suppress', nameMatch: /Find My/i },
    ],
    forbidden: [
      { kind: 'suggest_add', domain: 'projects', nameMatch: /Find My/i },
      { kind: 'suggest_add', domain: 'projects', nameMatch: /phone/i },
    ],
  },
  {
    id: 'place_boundary_moms_car',
    text: FIXTURE_PLACE_BOUNDARY_TEXT,
    expected: [],
    forbidden: [{ kind: 'suggest_add', domain: 'projects', nameMatch: /mom/i }],
  },
  {
    id: 'school_memory_bryan',
    text: FIXTURE_SCHOOL_MEMORY_TEXT,
    expected: [
      { kind: 'suggest_add', domain: 'characters', nameMatch: /Bryan Oconner/i },
      { kind: 'suggest_add', domain: 'schools', nameMatch: /Whittier Christian Middle School/i },
      { kind: 'suggest_add', domain: 'groups', nameMatch: /Band/i },
      { kind: 'link', relationType: 'best_friend' },
    ],
    forbidden: [{ kind: 'suggest_add', nameMatch: /^middle school$/i }],
  },
  {
    id: 'family_household_leslie',
    text: FIXTURE_FAMILY_HOUSEHOLD_TEXT,
    expected: [
      { kind: 'suggest_add', domain: 'characters', nameMatch: /Leslie/i, gate: 'review' },
      { kind: 'suggest_add', domain: 'characters', nameMatch: /Tio Ralph/i, gate: 'review' },
      { kind: 'link', relationType: 'cousin' },
      { kind: 'suggest_add', domain: 'locations', nameMatch: /house/i, gate: 'review' },
      { kind: 'suggest_add', domain: 'family', nameMatch: /Household/i, gate: 'review' },
    ],
    forbidden: [{ kind: 'suggest_add', nameMatch: /^Tio$/i }],
  },
  {
    id: 'worksite_vs_employer_vanguard',
    text: FIXTURE_WORKSITE_EMPLOYER_TEXT,
    expected: [
      { kind: 'suggest_add', domain: 'organizations', nameMatch: /Vanguard Robotics/i },
      { kind: 'suggest_add', domain: 'skills', nameMatch: /gripper/i },
      { kind: 'suggest_add', domain: 'locations', nameMatch: /Denny/i },
    ],
    forbidden: [{ kind: 'suggest_add', domain: 'organizations', nameMatch: /^Denny/i }],
  },
  {
    id: 'travel_japan_class',
    text: FIXTURE_TRAVEL_CLASS_TEXT,
    expected: [
      { kind: 'suggest_add', domain: 'locations', nameMatch: /Japan/i },
      { kind: 'suggest_add', domain: 'groups', nameMatch: /Japanese Class/i },
      { kind: 'update_attribute', gate: 'review' },
    ],
  },
  {
    id: 'music_lost_friend_oscar',
    text: FIXTURE_MUSIC_LOST_FRIEND_TEXT,
    expected: [
      { kind: 'suggest_add', domain: 'characters', nameMatch: /Oscar/i, gate: 'review' },
      { kind: 'suggest_add', domain: 'groups', nameMatch: /ska scene/i },
      { kind: 'link', relationType: 'best_friend' },
    ],
    forbidden: [{ kind: 'suggest_merge', nameMatch: /Oscar/i }],
  },
  {
    id: 'project_true_positive_lorebook',
    text: FIXTURE_PROJECT_TRUE_POSITIVE_TEXT,
    expected: [{ kind: 'suggest_add', domain: 'projects', nameMatch: /LoreBook/i }],
    forbidden: [{ kind: 'redirect', nameMatch: /LoreBook/i }],
  },
  {
    id: 'project_lorebook_existing_attach',
    text: FIXTURE_PROJECT_TRUE_POSITIVE_TEXT,
    canonSeed: { projects: [{ id: 'proj-lorebook', name: 'LoreBook' }] },
    expected: [{ kind: 'attach_evidence', domain: 'projects', nameMatch: /LoreBook/i }],
    forbidden: [{ kind: 'suggest_add', domain: 'projects', nameMatch: /LoreBook/i }],
  },
  {
    id: 'consumer_tools_no_projects',
    text: FIXTURE_CONSUMER_TOOLS_TEXT,
    expected: [{ kind: 'suggest_add', domain: 'projects', nameMatch: /LoreBook/i }],
    forbidden: [
      { kind: 'suggest_add', domain: 'projects', nameMatch: /^Codex$/i },
      { kind: 'suggest_add', domain: 'projects', nameMatch: /^Cursor$/i },
      { kind: 'suggest_add', domain: 'projects', nameMatch: /Claude Code/i },
    ],
  },
  {
    id: 'identity_collision_abel',
    text: FIXTURE_IDENTITY_COLLISION_TEXT,
    expected: [
      { kind: 'suggest_add', domain: 'characters', nameMatch: /Abel Mendoza/i, gate: 'review' },
    ],
    forbidden: [{ kind: 'suggest_merge', nameMatch: /Abel/i }],
  },
  // --- Additional fixtures (categories 11–35) ---
  {
    id: 'known_character_blocks_project_redirect',
    text: 'Working on Hell Fairy branding tonight.',
    canonSeed: { characters: [{ name: 'Hell Fairy' }] },
    expected: [{ kind: 'attach_evidence', nameMatch: /Hell Fairy/i }],
    forbidden: [{ kind: 'suggest_add', domain: 'projects', nameMatch: /Hell Fairy/i }],
  },
  {
    id: 'similar_character_merge_hint',
    text: 'Sara Chen reached out again.',
    canonSeed: { characters: [{ id: 'c1', name: 'Sarah Chen' }] },
    expected: [{ kind: 'suggest_merge', domain: 'characters', nameMatch: /Sara Chen/i, gate: 'review' }],
  },
  {
    id: 'private_residence_review_gate',
    text: "We hung out at Maria's house after prom.",
    expected: [{ kind: 'suggest_add', domain: 'locations', nameMatch: /house/i, gate: 'review' }],
  },
  {
    id: 'quest_from_task_span',
    text: 'I need to finish the portfolio website by Friday.',
    expected: [],
    minOperations: 1,
  },
  {
    id: 'suppress_time_period_only',
    text: 'Last summer was wild.',
    expected: [],
    forbidden: [{ kind: 'suggest_add', nameMatch: /^last summer$/i }],
  },
  {
    id: 'organization_employer_cue',
    text: 'I interned at Google last year.',
    expected: [{ kind: 'suggest_add', domain: 'organizations', nameMatch: /Google/i }],
  },
  {
    id: 'skill_activity_cue',
    text: 'I have been practicing guitar every night.',
    expected: [],
    minOperations: 1,
  },
  {
    id: 'duplicate_project_merge',
    text: 'Shipping LoreBook app beta this week.',
    canonSeed: { projects: [{ id: 'p1', name: 'LoreBook App' }] },
    expected: [{ kind: 'attach_evidence', domain: 'projects', nameMatch: /LoreBook/i }],
  },
  {
    id: 'attach_evidence_known_place',
    text: 'Meet me at Central Park tomorrow.',
    canonSeed: { locations: [{ id: 'loc1', name: 'Central Park' }] },
    expected: [{ kind: 'attach_evidence', domain: 'locations', nameMatch: /Central Park/i }],
  },
  {
    id: 'redirect_place_not_character',
    text: 'Central Park is my favorite spot.',
    canonSeed: { locations: [{ id: 'loc1', name: 'Central Park' }] },
    expected: [{ kind: 'attach_evidence', domain: 'locations', nameMatch: /Central Park/i }],
  },
  {
    id: 'suppress_bare_tio',
    text: 'I saw Tio at the store.',
    expected: [],
    forbidden: [{ kind: 'suggest_add', nameMatch: /^Tio$/i }],
  },
  {
    id: 'family_cousin_review',
    text: 'My cousin Alex is visiting.',
    expected: [
      { kind: 'suggest_add', domain: 'characters', nameMatch: /Alex/i, gate: 'review' },
      { kind: 'link', relationType: 'cousin' },
    ],
  },
  {
    id: 'work_role_robot_tech',
    text: FIXTURE_WORKSITE_EMPLOYER_TEXT,
    expected: [{ kind: 'suggest_add', domain: 'work', nameMatch: /robot tech/i }],
  },
  {
    id: 'school_class_group',
    text: 'Our AP Physics Class toured the museum.',
    expected: [{ kind: 'suggest_add', domain: 'groups', nameMatch: /AP Physics Class/i }],
  },
  {
    id: 'event_graduation_party',
    text: FIXTURE_FAMILY_HOUSEHOLD_TEXT,
    expected: [{ kind: 'suggest_add', domain: 'events', nameMatch: /Graduation Party/i }],
  },
  {
    id: 'no_db_writes_read_only',
    text: FIXTURE_PROJECT_TRUE_POSITIVE_TEXT,
    expected: [{ kind: 'suggest_add', domain: 'projects', nameMatch: /LoreBook/i }],
  },
  {
    id: 'evidence_bundle_present',
    text: FIXTURE_SCHOOL_MEMORY_TEXT,
    expected: [{ kind: 'suggest_add', domain: 'characters', nameMatch: /Bryan/i }],
  },
  {
    id: 'cross_book_hell_fairy_stage_name',
    text: "Baby Bats opened for Hell Fairy.",
    canonSeed: { characters: [{ name: 'Baby Bats' }, { name: 'Hell Fairy' }] },
    expected: [{ kind: 'attach_evidence', nameMatch: /Baby Bats/i }],
    forbidden: [{ kind: 'suggest_add', domain: 'projects', nameMatch: /Baby Bats/i }],
  },
  {
    id: 'lorebook_correction_history_bias',
    text: 'Adding notes about Central Park runs.',
    canonSeed: {
      locations: [{ name: 'Central Park' }],
      correctionHistory: [
        {
          originalValue: 'characters:Central Park',
          correctedValue: 'locations:Central Park',
          fromDomain: 'characters',
          toDomain: 'locations',
          kind: 'suggestion_category_redirect',
        },
      ],
    },
    expected: [{ kind: 'attach_evidence', domain: 'locations', nameMatch: /Central Park/i }],
  },
  {
    id: 'romantic_context_review',
    text: 'My girlfriend Dana met my mom.',
    expected: [{ kind: 'suggest_add', domain: 'characters', nameMatch: /Dana/i, gate: 'review' }],
  },
  {
    id: 'consumer_ring_doorbell',
    text: "They installed a new Amazon Ring doorbell.",
    expected: [{ kind: 'suppress', nameMatch: /Ring/i }],
    forbidden: [{ kind: 'suggest_add', domain: 'projects', nameMatch: /Ring/i }],
  },
  {
    id: 'made_lorebook_instead_cue',
    text: 'I stayed home and made LoreBook instead.',
    expected: [{ kind: 'suggest_add', domain: 'projects', nameMatch: /LoreBook/i }],
  },
  {
    id: 'community_ska_scene',
    text: FIXTURE_MUSIC_LOST_FRIEND_TEXT,
    expected: [{ kind: 'suggest_add', domain: 'groups', nameMatch: /ska/i }],
  },
  {
    id: 'parser_returns_lexical_spans',
    text: FIXTURE_TRAVEL_CLASS_TEXT,
    expected: [{ kind: 'suggest_add', domain: 'locations', nameMatch: /Japan/i }],
  },
  {
    id: 'suppress_generic_middle_school',
    text: 'We met in middle school.',
    expected: [],
    forbidden: [{ kind: 'suggest_add', domain: 'schools', nameMatch: /^middle school$/i }],
  },
  {
    id: 'gothicumbia_not_project',
    text: 'Gothicumbia was insane this year.',
    expected: [{ kind: 'suggest_add', domain: 'events', nameMatch: /Gothicumbia/i }],
    forbidden: [{ kind: 'suggest_add', domain: 'projects', nameMatch: /Gothicumbia/i }],
  },
  {
    id: 'hollywood_worksite_location',
    text: FIXTURE_WORKSITE_EMPLOYER_TEXT,
    expected: [{ kind: 'suggest_add', domain: 'locations', nameMatch: /Hollywood/i }],
  },
  {
    id: 'band_link_schoolmate',
    text: FIXTURE_SCHOOL_MEMORY_TEXT,
    expected: [{ kind: 'link', relationType: 'best_friend' }],
  },
  {
    id: 'identity_no_auto_merge',
    text: FIXTURE_IDENTITY_COLLISION_TEXT,
    expected: [{ kind: 'suggest_add', domain: 'characters', nameMatch: /Abel/i, gate: 'review' }],
    forbidden: [{ kind: 'suggest_merge', nameMatch: /Abel/i }],
  },
  {
    id: 'tool_sentence_lorebook_only_project',
    text: FIXTURE_CONSUMER_TOOLS_TEXT,
    expected: [{ kind: 'suppress', nameMatch: /Codex/i }],
  },
];

export function assertFixturePackIdsUnique(): void {
  const ids = LOREBOOK_PARSER_FIXTURE_PACK.map((f) => f.id);
  expect(new Set(ids).size).toBe(ids.length);
}
