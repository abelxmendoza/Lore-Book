import { logger } from '../../logger';
import { normalizeNameKey } from '../../utils/nameNormalization';
import {
  stitchedTimelineService,
  type StitchedTimelineItem,
} from '../chronologyV2/stitchedTimelineService';
import { searchEntities, validateEntityOwnership } from '../search/entitySearchService';
import type {
  EntitySearchMatchKind,
  EntitySearchResult,
  EntitySearchType,
} from '../search/entitySearchTypes';
import { supabaseAdmin } from '../supabaseClient';

import {
  loadThreadTimelineEvidence,
  reconcileProvisionalTimelineItems,
} from './threadTimelineEvidence';

export type SubjectTimelineMode =
  | 'SUBJECT_TIMELINE'
  | 'EMPLOYMENT_TIMELINE'
  | 'RELATIONSHIP_TIMELINE'
  | 'PROJECT_TIMELINE'
  | 'PLACE_TIMELINE'
  | 'DATE_TIMELINE'
  | 'EVIDENCE_SEARCH';

export type SubjectTimelinePhase =
  | 'prelude'
  | 'beginning'
  | 'active_period'
  | 'turning_point'
  | 'transition'
  | 'aftermath'
  | 'related_context';

export type SubjectRelation =
  | 'DIRECT_PERIOD'
  | 'DIRECT_EVENT'
  | 'DIRECT_WORK_ACTIVITY'
  | 'PREPARATION'
  | 'TRANSITION'
  | 'AFTERMATH'
  | 'SUBJECT_ASSOCIATION'
  | 'INCIDENTAL_MENTION';

export type SubjectTimelineIntent = {
  rawQuery: string;
  mode: SubjectTimelineMode;
  subjectQuery: string;
  perspective:
    | 'FIRST_PERSON_EXPERIENCE'
    | 'RELATIONSHIP_HISTORY'
    | 'PROJECT_EVOLUTION'
    | 'ALL_RELEVANT';
  expectedPhases: SubjectTimelinePhase[];
  exactDate?: string;
};

export type ResolvedTimelineSubject = {
  entityId: string;
  entityType: EntitySearchType;
  displayName: string;
  aliases: string[];
  confidence: number;
  matchKind?: EntitySearchMatchKind;
};

export type CompiledSubjectTimelineEvent = {
  id: string;
  start_time: string;
  end_time?: string | null;
  title: string;
  content: string;
  timeline_names: string[];
  source_kind: StitchedTimelineItem['sourceKind'];
  source_id: string;
  source_ids: string[];
  source_type: string;
  time_precision: string;
  time_confidence: number;
  occurrence_status?: StitchedTimelineItem['occurrenceStatus'];
  phase: SubjectTimelinePhase;
  subjectRelation: SubjectRelation;
  relevance: number;
  significance: 'low' | 'medium' | 'high';
  evidenceCount: number;
  whyIncluded: string;
  focusedEvidence: string;
};

export type SubjectTimelineCoverage = {
  score: number;
  coveredPhases: SubjectTimelinePhase[];
  missingPhases: SubjectTimelinePhase[];
  isComplete: boolean;
};

export type SubjectTimelineCompilation = {
  query: string;
  intent: SubjectTimelineIntent;
  subject: ResolvedTimelineSubject | null;
  ambiguity: ResolvedTimelineSubject[];
  period: {
    start: string;
    end: string;
    label: string;
  } | null;
  coverage: SubjectTimelineCoverage;
  events: CompiledSubjectTimelineEvent[];
  contextEvents: CompiledSubjectTimelineEvent[];
  sources: string[];
  warnings: string[];
};

type DirectLinks = {
  sourceIds: Set<string>;
  relatedTerms: string[];
};

const STOP_WORDS = new Set([
  'about',
  'all',
  'and',
  'at',
  'everything',
  'for',
  'from',
  'how',
  'in',
  'involving',
  'me',
  'my',
  'of',
  'our',
  'the',
  'time',
  'timeline',
  'with',
]);

const WORK_CUES =
  /\b(work|worked|working|job|role|career|hire|hired|interview|recruit|offer|onboard|training|team|manager|coworker|contract|shift|lab|ticket|project|task|terminated|fired|quit|resigned)\b/i;
const PRELUDE_CUES =
  /\b(interview|recruit|application|applied|offer|background check|identity verification|preparing|before starting|onboard)\b/i;
const BEGINNING_CUES =
  /\b(first day|started|begin|began|joined|met the team|introduced|orientation|onboard)\b/i;
const ACTIVE_CUES =
  /\b(worked|working|built|created|tested|investigat|trained|learned|project|task|ticket|milestone|performed|managed|practiced|visited|spent time)\b/i;
const TURNING_POINT_CUES =
  /\b(conflict|concern|problem|failure|failed|breakthrough|changed|turning point|argument|promotion|major finding)\b/i;
const TRANSITION_CUES =
  /\b(ended|left|last day|quit|resigned|terminated|fired|laid off|moved away|broke up|completed|finished)\b/i;
const AFTERMATH_CUES =
  /\b(afterward|afterwards|aftermath|reflected|reflection|learned|lesson|recover|looking back|since then|realized)\b/i;

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function queryTerms(query: string): string[] {
  return unique(
    normalizeNameKey(query)
      .split(/\s+/)
      .filter((term) => term.length > 2 && !STOP_WORDS.has(term)),
  );
}

function stripTimelineFraming(rawQuery: string): string {
  let value = rawQuery
    .trim()
    .replace(
      /,\s*(?:the\s+)?correct spelling(?:\s+(?:is|should be|has).*)?$/i,
      '',
    )
    .replace(/[?.!]+$/, '');
  const directPatterns = [
    /^(?:can|could|would) you (?:please )?(?:show me|pull up|bring up|give me|build|create|generate)\s+(?:a |the |my )?timeline\s+(?:of|for)\s+(?:my time as\s+)?(.+)$/i,
    /^(?:show me|pull up|bring up|give me|build|create|generate)\s+(?:a |the |my )?timeline\s+(?:of|for)\s+(?:my time as\s+)?(.+)$/i,
    /^(?:show me\s+)?my\s+(.+?)\s+timeline$/i,
    /^(?:what is|what's)\s+(?:the\s+)?timeline\s+of\s+(.+)$/i,
    /^what happened during my time (?:at|in|with|as)\s+(.+)$/i,
    /^how did\s+(.+?)\s+(?:develop(?:ed)?|evolv(?:e|ed)|chang(?:e|ed)|unfold(?:ed)?)\s+over time$/i,
  ];
  for (const pattern of directPatterns) {
    const match = value.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  const patterns = [
    /^(?:show me\s+)?my time (?:at|with|in)\s+/i,
    /^(?:show me\s+)?my relationship with\s+/i,
    /^(?:show me\s+)?my friendship with\s+/i,
    /^(?:show me\s+)?everything (?:with|about|involving)\s+/i,
    /^(?:show me\s+)?the (?:history|story|timeline) of\s+/i,
    /^(?:tell me\s+)?(?:the\s+)?story of\s+/i,
    /^(?:how did\s+|how\s+)/i,
    /^(?:find|show)\s+(?:every|all)\s+(?:source|journal|memory|entry|mention)s?\s+(?:about|mentioning|with)\s+/i,
  ];
  for (const pattern of patterns) value = value.replace(pattern, '');
  value = value.replace(/\b(?:develop(?:ed)?|evolv(?:e|ed)|unfold(?:ed)?|chang(?:e|ed))\s+over time\b$/i, '').trim();
  return value || rawQuery.trim();
}

export function interpretSubjectTimelineQuery(rawQuery: string): SubjectTimelineIntent {
  const query = rawQuery.trim();
  const lower = query.toLowerCase();
  const exactDate = /^\d{4}-\d{2}-\d{2}$/.test(query) ? query : undefined;
  const evidenceMode =
    /\b(show|find|list)\b.*\b(source|journal|entry|entries|mention|mentions|evidence)\b/i.test(query);
  const employmentMode =
    /\b(my time at|job|career|employ|work(?:ed|ing)? at|role at)\b/i.test(query);
  const relationshipMode =
    /\b(relationship|friendship|everything with|history with)\b/i.test(query);
  const projectMode =
    /\b(project|built|developed|created|evolved)\b/i.test(query);
  const placeMode = /\b(my time in|lived in|at this place|place)\b/i.test(query);

  let mode: SubjectTimelineMode = 'SUBJECT_TIMELINE';
  let perspective: SubjectTimelineIntent['perspective'] = 'ALL_RELEVANT';
  let expectedPhases: SubjectTimelinePhase[] = [
    'beginning',
    'active_period',
    'turning_point',
    'transition',
  ];

  if (exactDate) {
    mode = 'DATE_TIMELINE';
    expectedPhases = ['active_period'];
  } else if (evidenceMode) {
    mode = 'EVIDENCE_SEARCH';
    expectedPhases = ['active_period'];
  } else if (employmentMode) {
    mode = 'EMPLOYMENT_TIMELINE';
    perspective = 'FIRST_PERSON_EXPERIENCE';
    expectedPhases = ['prelude', 'beginning', 'active_period', 'transition', 'aftermath'];
  } else if (relationshipMode) {
    mode = 'RELATIONSHIP_TIMELINE';
    perspective = 'RELATIONSHIP_HISTORY';
    expectedPhases = ['beginning', 'active_period', 'turning_point', 'transition'];
  } else if (projectMode) {
    mode = 'PROJECT_TIMELINE';
    perspective = 'PROJECT_EVOLUTION';
    expectedPhases = ['beginning', 'active_period', 'turning_point', 'transition'];
  } else if (placeMode) {
    mode = 'PLACE_TIMELINE';
    perspective = 'FIRST_PERSON_EXPERIENCE';
    expectedPhases = ['beginning', 'active_period', 'transition'];
  }

  return {
    rawQuery: query,
    mode,
    subjectQuery: exactDate ?? stripTimelineFraming(query),
    perspective,
    expectedPhases,
    exactDate,
  };
}

function toResolvedSubject(result: EntitySearchResult): ResolvedTimelineSubject {
  return {
    entityId: result.entityId,
    entityType: result.entityType,
    displayName: result.displayName,
    aliases: result.aliases,
    confidence: result.confidence,
    matchKind: result.matchKind,
  };
}

export function chooseResolvedSubject(
  results: EntitySearchResult[],
): { subject: ResolvedTimelineSubject | null; ambiguity: ResolvedTimelineSubject[] } {
  if (results.length === 0) return { subject: null, ambiguity: [] };
  const top = results[0]!;
  const second = results[1];
  const isStrong = top.matchKind === 'exact' || top.matchKind === 'alias' || top.confidence >= 0.9;
  if (!isStrong && second && Math.abs(top.confidence - second.confidence) < 0.06) {
    return { subject: null, ambiguity: results.slice(0, 3).map(toResolvedSubject) };
  }
  return { subject: toResolvedSubject(top), ambiguity: [] };
}

function sentenceCandidates(text: string): string[] {
  const normalized = compact(text);
  if (!normalized) return [];
  return normalized
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(compact)
    .filter(Boolean);
}

export function extractFocusedEvidence(text: string, terms: string[]): string {
  const sentences = sentenceCandidates(text);
  if (sentences.length === 0) return '';
  if (terms.length === 0) return sentences.slice(0, 2).join(' ').slice(0, 520);
  const matchedIndexes = sentences
    .map((sentence, index) => ({
      index,
      hits: terms.filter((term) => normalizeNameKey(sentence).includes(term)).length,
    }))
    .filter((candidate) => candidate.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.index - b.index);
  if (matchedIndexes.length === 0) return sentences.slice(0, 2).join(' ').slice(0, 520);

  const first = matchedIndexes[0]!.index;
  const indexes = unique(
    [first, first + 1]
      .filter((index) => index >= 0 && index < sentences.length)
      .map(String),
  ).map(Number);
  return indexes.map((index) => sentences[index]).join(' ').slice(0, 520);
}

function phaseFor(text: string, mode: SubjectTimelineMode): SubjectTimelinePhase {
  if (AFTERMATH_CUES.test(text)) return 'aftermath';
  if (TRANSITION_CUES.test(text)) return 'transition';
  if (TURNING_POINT_CUES.test(text)) return 'turning_point';
  if (BEGINNING_CUES.test(text)) return 'beginning';
  if (mode === 'EMPLOYMENT_TIMELINE' && PRELUDE_CUES.test(text)) return 'prelude';
  if (ACTIVE_CUES.test(text) || mode === 'DATE_TIMELINE') return 'active_period';
  return 'active_period';
}

function phaseLabel(phase: SubjectTimelinePhase): string {
  switch (phase) {
    case 'prelude': return 'Prelude';
    case 'beginning': return 'Beginning';
    case 'active_period': return 'Active period';
    case 'turning_point': return 'Turning point';
    case 'transition': return 'Transition';
    case 'aftermath': return 'Aftermath';
    case 'related_context': return 'Related context';
  }
}

function significanceFor(item: StitchedTimelineItem, relation: SubjectRelation) {
  if (
    relation === 'DIRECT_PERIOD'
    || relation === 'TRANSITION'
    || relation === 'DIRECT_WORK_ACTIVITY'
    || item.temporalRole === 'milestone'
  ) {
    return 'high' as const;
  }
  if (relation === 'INCIDENTAL_MENTION') return 'low' as const;
  return 'medium' as const;
}

function relationFor(
  item: StitchedTimelineItem,
  intent: SubjectTimelineIntent,
  subject: ResolvedTimelineSubject | null,
  directSourceIds: Set<string>,
  subjectTerms: string[],
): { relation: SubjectRelation; relevance: number; reason: string } | null {
  const text = compact(`${item.title} ${item.body} ${(item.tags ?? []).join(' ')}`);
  const normalized = normalizeNameKey(text);
  const sourceIds = unique([item.sourceId, ...item.sourceIds]);
  const direct = sourceIds.some((id) => directSourceIds.has(id));
  const matchedTerms = subjectTerms.filter((term) => normalized.includes(term));
  const matchRatio = subjectTerms.length ? matchedTerms.length / subjectTerms.length : 0;
  const workRelated = WORK_CUES.test(text);
  const phase = phaseFor(text, intent.mode);

  if (intent.exactDate) {
    if (item.sortTime.slice(0, 10) !== intent.exactDate) return null;
    return { relation: 'DIRECT_EVENT', relevance: 1, reason: `Occurred on ${intent.exactDate}` };
  }

  if (direct) {
    if (phase === 'transition') {
      return { relation: 'TRANSITION', relevance: 0.99, reason: 'Directly linked transition for this subject' };
    }
    if (phase === 'aftermath') {
      return { relation: 'AFTERMATH', relevance: 0.94, reason: 'Directly linked aftermath or reflection' };
    }
    if (intent.mode === 'EMPLOYMENT_TIMELINE' && workRelated) {
      return { relation: 'DIRECT_WORK_ACTIVITY', relevance: 0.98, reason: 'Directly linked work event' };
    }
    return { relation: 'DIRECT_EVENT', relevance: 0.96, reason: 'Directly linked canonical event' };
  }

  if (matchedTerms.length > 0) {
    if (intent.mode === 'EMPLOYMENT_TIMELINE') {
      if (PRELUDE_CUES.test(text)) {
        return { relation: 'PREPARATION', relevance: 0.86, reason: 'Direct preparation for this employment subject' };
      }
      if (workRelated) {
        return { relation: 'DIRECT_WORK_ACTIVITY', relevance: 0.88, reason: 'Work activity naming the resolved subject' };
      }
      return {
        relation: 'INCIDENTAL_MENTION',
        relevance: 0.3 + Math.min(0.12, matchRatio * 0.12),
        reason: 'Names the subject without a direct employment event',
      };
    }
    return {
      relation: 'SUBJECT_ASSOCIATION',
      relevance: 0.68 + Math.min(0.2, matchRatio * 0.2),
      reason: subject ? `Names ${subject.displayName}` : 'Directly matches the requested subject',
    };
  }

  const queryMatches = queryTerms(intent.rawQuery).filter((term) => normalized.includes(term));
  if (queryMatches.length > 0) {
    return {
      relation: 'SUBJECT_ASSOCIATION',
      relevance: 0.48 + Math.min(0.14, queryMatches.length * 0.04),
      reason: 'Matches the requested subject context',
    };
  }
  return null;
}

function compileEvent(
  item: StitchedTimelineItem,
  intent: SubjectTimelineIntent,
  subject: ResolvedTimelineSubject | null,
  directSourceIds: Set<string>,
  subjectTerms: string[],
): CompiledSubjectTimelineEvent | null {
  const scored = relationFor(item, intent, subject, directSourceIds, subjectTerms);
  if (!scored) return null;
  const text = compact(`${item.title}. ${item.body}`);
  const phase =
    scored.relation === 'INCIDENTAL_MENTION'
      ? 'related_context'
      : phaseFor(text, intent.mode);
  const focusedEvidence = extractFocusedEvidence(text, subjectTerms);
  return {
    id: item.id,
    start_time: item.sortTime,
    end_time: null,
    title: item.title || phaseLabel(phase),
    content: focusedEvidence || compact(item.body || item.title),
    timeline_names: unique([phaseLabel(phase), item.sourceType]),
    source_kind: item.sourceKind,
    source_id: item.sourceId,
    source_ids: unique([item.sourceId, ...item.sourceIds]),
    source_type: item.sourceType,
    time_precision: item.timePrecision ?? 'approximate',
    time_confidence: item.timeConfidence ?? item.confidence ?? 0.5,
    occurrence_status: item.occurrenceStatus,
    phase,
    subjectRelation: scored.relation,
    relevance: Math.round(scored.relevance * 100) / 100,
    significance: significanceFor(item, scored.relation),
    evidenceCount: Math.max(item.mergedCount ?? 1, item.sourceIds.length || 1),
    whyIncluded: scored.reason,
    focusedEvidence,
  };
}

export function compileSubjectTimeline(input: {
  query: string;
  intent: SubjectTimelineIntent;
  subject: ResolvedTimelineSubject | null;
  ambiguity?: ResolvedTimelineSubject[];
  items: StitchedTimelineItem[];
  directSourceIds?: Set<string>;
  relatedTerms?: string[];
}): SubjectTimelineCompilation {
  const directSourceIds = input.directSourceIds ?? new Set<string>();
  const subjectTerms = unique([
    ...(input.subject
      ? [input.subject.displayName, ...input.subject.aliases].flatMap(queryTerms)
      : queryTerms(input.intent.subjectQuery)),
    ...(input.relatedTerms ?? []).flatMap(queryTerms),
  ]);
  const compiled = input.items
    .map((item) => compileEvent(item, input.intent, input.subject, directSourceIds, subjectTerms))
    .filter((event): event is CompiledSubjectTimelineEvent => Boolean(event));

  const ranked = [...compiled].sort(
    (a, b) =>
      b.relevance - a.relevance
      || b.time_confidence - a.time_confidence
      || a.start_time.localeCompare(b.start_time),
  );
  const primary = ranked
    .filter((event) => event.subjectRelation !== 'INCIDENTAL_MENTION' && event.relevance >= 0.48)
    .slice(0, 30)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const contextEvents = ranked
    .filter((event) => event.subjectRelation === 'INCIDENTAL_MENTION' || event.relevance < 0.48)
    .slice(0, 8)
    .map((event) => ({ ...event, phase: 'related_context' as const }))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const coveredPhases = unique(primary.map((event) => event.phase)) as SubjectTimelinePhase[];
  const missingPhases = input.intent.expectedPhases.filter((phase) => !coveredPhases.includes(phase));
  const score =
    input.intent.expectedPhases.length === 0
      ? 1
      : (input.intent.expectedPhases.length - missingPhases.length) / input.intent.expectedPhases.length;
  const dates = primary.map((event) => event.start_time).filter(Boolean).sort();
  const sources = unique(primary.map((event) => event.source_type));
  const warnings: string[] = [];
  if (input.ambiguity?.length) {
    warnings.push('The requested subject matches more than one LoreBook entity.');
  } else if (!input.subject && !input.intent.exactDate) {
    warnings.push('No exact LoreBook entity was resolved; results use subject-language matching.');
  }
  if (primary.length === 0) {
    warnings.push('No canonical events were strong enough to build this subject timeline.');
  } else if (score < 0.6 && input.intent.mode !== 'EVIDENCE_SEARCH') {
    warnings.push(`Coverage is incomplete. Missing: ${missingPhases.map(phaseLabel).join(', ')}.`);
  }

  return {
    query: input.query,
    intent: input.intent,
    subject: input.subject,
    ambiguity: input.ambiguity ?? [],
    period: dates.length
      ? {
          start: dates[0]!,
          end: dates[dates.length - 1]!,
          label: dates[0] === dates[dates.length - 1] ? 'Evidence date' : 'Evidence range',
        }
      : null,
    coverage: {
      score: Math.round(score * 100) / 100,
      coveredPhases,
      missingPhases,
      isComplete: missingPhases.length === 0,
    },
    events: primary,
    contextEvents,
    sources,
    warnings,
  };
}

async function loadDirectLinks(
  userId: string,
  subject: ResolvedTimelineSubject | null,
): Promise<DirectLinks> {
  const sourceIds = new Set<string>();
  const relatedTerms: string[] = [];
  if (!subject) return { sourceIds, relatedTerms };

  try {
    if (subject.entityType === 'person' || subject.entityType === 'place') {
      let query = supabaseAdmin
        .from('resolved_events')
        .select('id')
        .eq('user_id', userId);
      query =
        subject.entityType === 'person'
          ? query.contains('people', [subject.entityId])
          : query.contains('locations', [subject.entityId]);
      const { data } = await query.limit(300);
      for (const row of data ?? []) sourceIds.add(String(row.id));
    } else if (
      subject.entityType === 'organization'
      || subject.entityType === 'group'
      || subject.entityType === 'community'
    ) {
      const [eventsResult, storiesResult, relationshipsResult] = await Promise.all([
        supabaseAdmin
          .from('organization_events')
          .select('event_id, title')
          .eq('user_id', userId)
          .eq('organization_id', subject.entityId)
          .limit(300),
        supabaseAdmin
          .from('organization_stories')
          .select('memory_id, title')
          .eq('user_id', userId)
          .eq('organization_id', subject.entityId)
          .limit(300),
        supabaseAdmin
          .from('organization_relationships')
          .select('from_org_id, to_org_id')
          .eq('user_id', userId)
          .or(`from_org_id.eq.${subject.entityId},to_org_id.eq.${subject.entityId}`)
          .limit(50),
      ]);
      for (const row of eventsResult.data ?? []) {
        if (row.event_id) sourceIds.add(String(row.event_id));
      }
      for (const row of storiesResult.data ?? []) {
        if (row.memory_id) sourceIds.add(String(row.memory_id));
      }

      const relatedOrgIds = unique(
        (relationshipsResult.data ?? []).flatMap((row) => [
          String(row.from_org_id ?? ''),
          String(row.to_org_id ?? ''),
        ]),
      ).filter((id) => id && id !== subject.entityId);
      if (relatedOrgIds.length) {
        const { data: relatedOrganizations } = await supabaseAdmin
          .from('organizations')
          .select('name, aliases')
          .eq('user_id', userId)
          .in('id', relatedOrgIds);
        for (const organization of relatedOrganizations ?? []) {
          relatedTerms.push(String(organization.name ?? ''));
          relatedTerms.push(...((organization.aliases as string[] | null) ?? []));
        }
      }
    } else if (subject.entityType === 'event') {
      sourceIds.add(subject.entityId);
    }
  } catch (error) {
    logger.warn(
      { error, userId, subjectId: subject.entityId, subjectType: subject.entityType },
      'Subject timeline direct-link expansion degraded to text matching',
    );
  }

  return { sourceIds, relatedTerms: unique(relatedTerms) };
}

export async function compileSubjectTimelineForUser(input: {
  userId: string;
  query: string;
  threadId?: string;
  subject?: {
    entityId: string;
    entityType: EntitySearchType;
  };
}): Promise<SubjectTimelineCompilation> {
  const intent = interpretSubjectTimelineQuery(input.query);
  let subject: ResolvedTimelineSubject | null = null;
  let ambiguity: ResolvedTimelineSubject[] = [];

  if (input.subject) {
    const owned = await validateEntityOwnership(
      input.userId,
      input.subject.entityId,
      input.subject.entityType,
    );
    if (!owned) throw new Error('Selected timeline subject was not found');
    const result = await searchEntities({
      userId: input.userId,
      query: intent.subjectQuery,
      types: [input.subject.entityType],
      limit: 25,
    });
    const matched = result.results.find((candidate) => candidate.entityId === input.subject!.entityId);
    subject = matched
      ? toResolvedSubject(matched)
      : {
          entityId: input.subject.entityId,
          entityType: input.subject.entityType,
          displayName: intent.subjectQuery,
          aliases: [],
          confidence: 1,
          matchKind: 'exact',
        };
  } else if (!intent.exactDate) {
    const results = await searchEntities({
      userId: input.userId,
      query: intent.subjectQuery,
      limit: 8,
    });
    ({ subject, ambiguity } = chooseResolvedSubject(results.results));
  }

  if (subject?.entityType === 'person') {
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('alias, metadata')
      .eq('user_id', input.userId)
      .eq('id', subject.entityId)
      .maybeSingle();
    const preferred = (character?.metadata as Record<string, unknown> | null)?.preferred_self_alias;
    if (typeof preferred === 'string' && preferred.trim()) {
      subject = {
        ...subject,
        displayName: preferred.trim(),
        aliases: unique([
          ...subject.aliases,
          ...((character?.alias as string[] | null) ?? []),
        ]).filter((alias) => normalizeNameKey(alias) !== normalizeNameKey(preferred)),
      };
    }
  }

  const subjectTerms = subject
    ? unique([subject.displayName, ...subject.aliases])
    : [intent.subjectQuery];
  const [timeline, directLinks, provisional] = await Promise.all([
    stitchedTimelineService.getStitchedTimeline(input.userId, { scope_type: 'global' }),
    loadDirectLinks(input.userId, subject),
    loadThreadTimelineEvidence({
      userId: input.userId,
      threadId: input.threadId,
      subjectTerms,
      query: input.query,
    }).catch((error) => {
      logger.warn({ error, userId: input.userId, threadId: input.threadId }, 'Thread timeline evidence unavailable');
      return [];
    }),
  ]);
  const items = reconcileProvisionalTimelineItems(timeline.items, provisional);
  const threadSourceIds = provisional.map((item) => item.sourceId);

  return compileSubjectTimeline({
    query: input.query,
    intent,
    subject,
    ambiguity,
    items,
    directSourceIds: new Set([...directLinks.sourceIds, ...threadSourceIds]),
    relatedTerms: directLinks.relatedTerms,
  });
}
