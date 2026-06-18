import { supabaseAdmin } from '../supabaseClient';
import { classifyEntity, type EntityClass, type RootType } from '../entities/entityClassifier';
import { normalizeNameKey } from '../../utils/nameNormalization';
import {
  classifyTemporalQuery,
  occurredInWindow,
  type ResolvedTemporalQuery,
} from '../temporal/temporalQueryService';
import type { TemporalWindow } from '../../utils/temporalAnchorResolver';

export type WorkingMemoryIntent =
  | 'PERSON_QUERY'
  | 'PLACE_QUERY'
  | 'PROJECT_QUERY'
  | 'GOAL_QUERY'
  | 'SKILL_QUERY'
  | 'COMMUNITY_QUERY'
  | 'EVENT_QUERY'
  | 'LIFE_REVIEW'
  | 'RELATIONSHIP_QUERY'
  | 'IDENTITY_QUERY'
  | 'ARC_QUERY'
  | 'CHAPTER_QUERY'
  | 'CONFLICT_QUERY'
  | 'DIRECTION_QUERY'
  | 'MOMENTUM_QUERY'
  | 'DEBUG_QUERY'
  | 'TODAY_QUERY'
  | 'YESTERDAY_QUERY'
  | 'THIS_WEEK_QUERY'
  | 'THIS_MONTH_QUERY'
  | 'TIME_RANGE_QUERY'
  | 'TEMPORAL_COMPARISON_QUERY'
  | 'TIMELINE_QUERY';

export type WorkingMemoryEntity = {
  id: string | null;
  name: string;
  type: EntityClass | string;
  rootType?: RootType;
  source: 'characters' | 'locations' | 'organizations' | 'people_places' | 'projects' | 'question';
  confidence: number;
};

export type WorkingMemoryItem = {
  id: string;
  type:
    | 'episode'
    | 'event'
    | 'project'
    | 'goal'
    | 'skill'
    | 'community'
    | 'relationship'
    | 'preference'
    | 'timeline'
    | 'entity'
    | 'debug';
  title: string;
  content: string;
  source: string;
  date?: string | null;
  confidence: number;
  score: number;
  reasons: string[];
  metadata?: Record<string, unknown>;
};

export type WorkingMemoryAssembly = {
  intent: WorkingMemoryIntent;
  entities: WorkingMemoryEntity[];
  episodes: WorkingMemoryItem[];
  events: WorkingMemoryItem[];
  projects: WorkingMemoryItem[];
  goals: WorkingMemoryItem[];
  skills: WorkingMemoryItem[];
  communities: WorkingMemoryItem[];
  relationships: WorkingMemoryItem[];
  preferences: WorkingMemoryItem[];
  timeline: WorkingMemoryItem[];
  confidence: number;
  budget: {
    maxItems: number;
    selected: number;
    rejected: number;
  };
  rejected: Array<WorkingMemoryItem & { rejectedReason: string }>;
  timing?: WmaAssemblyTiming;
};

export type WorkingMemoryPacket = {
  people: WorkingMemoryItem[];
  places: WorkingMemoryItem[];
  projects: WorkingMemoryItem[];
  goals: WorkingMemoryItem[];
  skills: WorkingMemoryItem[];
  communities: WorkingMemoryItem[];
  events: WorkingMemoryItem[];
  episodes: WorkingMemoryItem[];
  relationships: WorkingMemoryItem[];
  recentContext: WorkingMemoryItem[];
  relevantContext: WorkingMemoryItem[];
  openLoops: Array<{
    type: 'no_memory' | 'weak_memory' | 'unknown_entity' | 'budget_excluded';
    message: string;
    confidence: number;
  }>;
  text: string;
};

type AssembleOptions = {
  maxItems?: number;
};

export type WmaQueryRecord = {
  table: string;
  purpose: string;
  ms: number;
  rowCount: number;
  cached: boolean;
};

export type WmaAssemblyTiming = {
  totalMs: number;
  entityResolutionMs: number;
  candidateGenerationMs: number;
  rankingMs: number;
  queryCount: number;
  queries: WmaQueryRecord[];
};

type CharacterRow = {
  id: string;
  name: string;
  alias?: string[] | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
  importance_score?: number | null;
  importance_level?: string | null;
  updated_at?: string | null;
};

type PeoplePlaceRow = {
  id: string;
  name: string;
  type?: string | null;
  corrected_names?: string[] | null;
};

type ProjectRow = {
  id: string;
  name?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Request-local scope: dedupes identical queries and records timing per assemble call. */
class WmaRequestScope {
  private promises = new Map<string, Promise<unknown>>();
  readonly queries: WmaQueryRecord[] = [];

  once<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.promises.get(key);
    if (existing) {
      return existing.then((value) => {
        this.queries.push({
          table: key.split(':')[0] ?? key,
          purpose: `${key.split(':').slice(1).join(':') || key} (cached)`,
          ms: 0,
          rowCount: Array.isArray(value) ? value.length : value ? 1 : 0,
          cached: true,
        });
        return value as T;
      });
    }
    const promise = fn();
    this.promises.set(key, promise);
    return promise;
  }

  async traced<T>(
    table: string,
    purpose: string,
    cacheKey: string,
    fn: () => PromiseLike<{ data: T | null; error?: unknown }>
  ): Promise<T | null> {
    return this.once(cacheKey, async () => {
      const started = Date.now();
      const { data, error } = await fn();
      const rowCount = Array.isArray(data) ? data.length : data ? 1 : 0;
      this.queries.push({
        table,
        purpose,
        ms: Date.now() - started,
        rowCount,
        cached: false,
      });
      if (error) return null;
      return data;
    });
  }
}

function escapeIlike(value: string): string {
  return value.replace(/[%_,().\\]/g, '');
}

function buildNameSearchTokens(target: string): string[] {
  const trimmed = target.trim();
  const tokens = trimmed.split(/\s+/).filter((t) => t.length >= 2);
  return [trimmed, ...tokens].filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
}

function buildNameOrClause(target: string, column = 'name'): string {
  return buildNameSearchTokens(target)
    .map((token) => `${column}.ilike.%${escapeIlike(token)}%`)
    .join(',');
}

function characterMatchesTarget(row: CharacterRow, targetKey: string): boolean {
  const names = [row.name, ...(Array.isArray(row.alias) ? row.alias : [])].map(normalizeNameKey);
  return names.includes(targetKey) || names.some((name) => targetKey.includes(name) || name.includes(targetKey));
}

function peoplePlaceMatchesTarget(row: PeoplePlaceRow, targetKey: string): boolean {
  const names = [row.name, ...(Array.isArray(row.corrected_names) ? row.corrected_names : [])].map(normalizeNameKey);
  return names.includes(targetKey);
}

async function fetchAllCharacters(scope: WmaRequestScope, userId: string): Promise<CharacterRow[]> {
  const rows = await scope.traced(
    'characters',
    'all characters for user',
    'characters:all',
    () =>
      supabaseAdmin
        .from('characters')
        .select('id, name, alias, summary, metadata, importance_score, importance_level, updated_at')
        .eq('user_id', userId)
  );
  return rows ?? [];
}

async function fetchCharactersForResolve(
  scope: WmaRequestScope,
  userId: string,
  target: string,
  targetKey: string
): Promise<CharacterRow[]> {
  return scope.once(`characters:resolve:${targetKey}`, async () => {
    const orClause = buildNameOrClause(target);
    const filtered = await scope.traced(
      'characters',
      'target-filtered character lookup',
      `characters:filtered:${targetKey}`,
      () =>
        supabaseAdmin
          .from('characters')
          .select('id, name, alias, summary, metadata, importance_score, importance_level, updated_at')
          .eq('user_id', userId)
          .or(orClause)
    );
    const rows = filtered ?? [];
    if (rows.some((row) => characterMatchesTarget(row, targetKey))) return rows;
    return fetchAllCharacters(scope, userId);
  });
}

async function fetchPeoplePlacesForResolve(
  scope: WmaRequestScope,
  userId: string,
  target: string,
  targetKey: string
): Promise<PeoplePlaceRow[]> {
  return scope.once(`people_places:resolve:${targetKey}`, async () => {
    const filtered = await scope.traced(
      'people_places',
      'target-filtered people_places lookup',
      `people_places:filtered:${targetKey}`,
      () =>
        supabaseAdmin
          .from('people_places')
          .select('id, name, type, corrected_names')
          .eq('user_id', userId)
          .or(buildNameOrClause(target))
    );
    const rows = filtered ?? [];
    if (rows.some((row) => peoplePlaceMatchesTarget(row, targetKey))) return rows;
    const all = await scope.traced(
      'people_places',
      'fallback all people_places',
      'people_places:all',
      () =>
        supabaseAdmin.from('people_places').select('id, name, type, corrected_names').eq('user_id', userId)
    );
    return all ?? [];
  });
}

async function fetchProjectsForTextual(scope: WmaRequestScope, userId: string): Promise<ProjectRow[]> {
  const rows = await scope.traced(
    'projects',
    'recent projects for textual candidates',
    'projects:textual',
    () =>
      supabaseAdmin
        .from('projects')
        .select('id, name, title, description, status, updated_at, metadata')
        .eq('user_id', userId)
        .limit(6)
  );
  return rows ?? [];
}

type Candidate = Omit<WorkingMemoryItem, 'score' | 'reasons'> & {
  relevance: number;
  importance?: number;
  significance?: number;
  relationshipDistance?: number;
  reasons?: string[];
};

const DEFAULT_BUDGET = 20;

const INTENT_RULES: Array<{ intent: WorkingMemoryIntent; pattern: RegExp }> = [
  { intent: 'DEBUG_QUERY', pattern: /\b(did you save|did you store|what did you save|debug|memory status|was that saved)\b/i },
  { intent: 'CHAPTER_QUERY', pattern: /\b(what chapter (?:am i|of life)|what chapter am i in|current chapter|what phase of life|what era am i in|summarize my current life chapter|what period of life|what(?:'s| is) happening in my life)\b/i },
  { intent: 'CONFLICT_QUERY', pattern: /\b(what conflicts?|conflicts? keep|tensions?|competing priorities|what.*(?:pulling|torn)|tradeoffs?|what keeps getting in the way|obstacles? between)\b/i },
  { intent: 'MOMENTUM_QUERY', pattern: /\b(what(?:'s| is) gaining momentum|what(?:'s| is) fading|what(?:'s| is) growing|what(?:'s| is) declining|momentum|what deserves attention|what needs attention)\b/i },
  { intent: 'DIRECTION_QUERY', pattern: /\b(where is (?:my )?life (?:heading|moving)|where am i headed|life direction|what direction|where is life going|what am i building toward)\b/i },
  { intent: 'ARC_QUERY', pattern: /\b(what stor(?:y|ies) am i living|life arcs?|major arcs?|what arcs?|dominant arcs?|narrative threads?|what story am i living|what is my story|tell me about my .* arc|my .* arc)\b/i },
  { intent: 'GOAL_QUERY', pattern: /\b(my goals?|what are my (?:current )?goals?|what.*\bgoals?\b|what.*(?:working toward|working towards)|what have i abandoned|abandoned goals?|what am i trying to do with my life|trying to do with my life|what is changing|aspirations?|what do i want to (?:achieve|accomplish|do)|my objectives?|what am i aiming (?:for|at)|my (?:dreams|ambitions)|am i (?:on track|making progress) (?:on|toward|with) my|current goals?|my priorities|what matters most|what should i focus on)\b/i },
  { intent: 'SKILL_QUERY', pattern: /\b(my skills?|what skills|what skills do i have|skills (?:define|describe) me|what (?:can i do|am i good at)|what am i (?:learning|practicing|building)|my abilities|how good am i at|am i (?:improving|getting better) at|am i leveling|my proficienc)\b/i },
  { intent: 'PROJECT_QUERY', pattern: /\b(projects? am i (?:working on|building)|what projects|my projects|how is .* progressing|progress on|status of|how's .* going|projects?\b|lorebook)\b/i },
  { intent: 'COMMUNITY_QUERY', pattern: /\b(my communities|communities am i|social circles?|groups am i part of|what communities|communities matter|my crew|my circles?|organizations i belong|clubs am i in|who are my .* people)\b/i },
  { intent: 'EVENT_QUERY', pattern: /\b(what happened at .*(graduation|party|wedding|funeral|birthday)|what happened during|what happened last|what did i do last|last summer|last year|last month|last week|tell me about .*graduation|what did i do with|event)\b/i },
  { intent: 'PLACE_QUERY', pattern: /\b(what happened at|what went on at|what was it like at|memories at|remember at)\b/i },
  { intent: 'RELATIONSHIP_QUERY', pattern: /\b(what do you remember about|relationship with|what happened with|story with|between me and|how am i related to|who lives with me|who do i live with|what role did|my family|about my family|summarize.*family|family members)\b/i },
  { intent: 'LIFE_REVIEW', pattern: /\b(what have i been doing lately|what have i done lately|what's been going on|recap my life|life review)\b/i },
  { intent: 'IDENTITY_QUERY', pattern: /\b(what kind of person am i|who am i|what do you know about me|my identity|my values|what matters to me|what defines me)\b/i },
  { intent: 'PERSON_QUERY', pattern: /\b(what do you know about|who is|who was|tell me about|do you remember)\b/i },
];

const TARGET_PATTERNS = [
  /\b(?:what did i do with|what have i done with)\s+(.+?)[?.!]?$/i,
  /\b(?:how am i related to)\s+(.+?)[?.!]?$/i,
  /\b(?:what role did)\s+(.+?)\s+play\b/i,
  /\b(?:what do you know about|what do you remember about|who is|who was|tell me about|relationship with|what happened with|between me and)\s+(.+?)[?.!]?$/i,
  /\b(?:what happened at|what went on at|what was it like at|memories at|remember at)\s+(.+?)[?.!]?$/i,
  /\b(?:how is|how's|progress on|status of)\s+(.+?)(?:\s+progressing|\s+going)?[?.!]?$/i,
  /\b(?:what happened during|tell me about)\s+(.+?)[?.!]?$/i,
];

function classifyIntent(question: string): WorkingMemoryIntent {
  const temporal = classifyTemporalQuery(question);
  if (temporal.intent) return temporal.intent as WorkingMemoryIntent;
  for (const rule of INTENT_RULES) {
    if (rule.pattern.test(question)) return rule.intent;
  }
  return 'LIFE_REVIEW';
}

function isTemporalIntent(intent: WorkingMemoryIntent): boolean {
  return [
    'TODAY_QUERY',
    'YESTERDAY_QUERY',
    'THIS_WEEK_QUERY',
    'THIS_MONTH_QUERY',
    'TIME_RANGE_QUERY',
    'TEMPORAL_COMPARISON_QUERY',
    'TIMELINE_QUERY',
  ].includes(intent);
}

function eventSearchOrClause(target: string): string {
  const tokens = target.match(/\b[a-z]{4,}/gi) ?? [];
  if (tokens.length === 0) return `event_title.ilike.%${target.slice(0, 24)}%`;
  return tokens
    .slice(0, 4)
    .flatMap((token) => [`event_title.ilike.%${token}%`, `event_summary.ilike.%${token}%`])
    .join(',');
}

function extractQuestionTarget(question: string): string | null {
  const trimmed = question.trim();
  for (const pattern of TARGET_PATTERNS) {
    const match = trimmed.match(pattern);
    const raw = match?.[1]?.replace(/[?.!]+$/, '').trim();
    if (raw) return raw;
  }
  return null;
}

function daysAgo(date?: string | null): number | null {
  if (!date) return null;
  const time = new Date(date).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

function recencyScore(date?: string | null): number {
  const age = daysAgo(date);
  if (age == null) return 0.4;
  if (age <= 7) return 1;
  if (age <= 30) return 0.8;
  if (age <= 180) return 0.55;
  if (age <= 365) return 0.35;
  return 0.2;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function scoreCandidate(candidate: Candidate): WorkingMemoryItem {
  const relevance = clamp01(candidate.relevance);
  const importance = clamp01(candidate.importance ?? 0.5);
  const recency = recencyScore(candidate.date);
  const significance = clamp01(candidate.significance ?? 0.5);
  const relationshipDistance = clamp01(candidate.relationshipDistance ?? 0.5);
  const confidence = clamp01(candidate.confidence);
  const score =
    0.38 * relevance +
    0.18 * importance +
    0.16 * recency +
    0.14 * significance +
    0.08 * relationshipDistance +
    0.06 * confidence;

  return {
    id: candidate.id,
    type: candidate.type,
    title: candidate.title,
    content: candidate.content,
    source: candidate.source,
    date: candidate.date,
    confidence,
    score: Number(score.toFixed(4)),
    reasons: [
      ...(candidate.reasons ?? []),
      `relevance=${relevance.toFixed(2)}`,
      `recency=${recency.toFixed(2)}`,
      `confidence=${confidence.toFixed(2)}`,
    ],
    metadata: candidate.metadata,
  };
}

function distribute(items: WorkingMemoryItem[]): Omit<WorkingMemoryAssembly, 'intent' | 'entities' | 'confidence' | 'budget' | 'rejected'> {
  return {
    episodes: items.filter((item) => item.type === 'episode'),
    events: items.filter((item) => item.type === 'event'),
    projects: items.filter((item) => item.type === 'project'),
    goals: items.filter((item) => item.type === 'goal'),
    skills: items.filter((item) => item.type === 'skill'),
    communities: items.filter((item) => item.type === 'community'),
    relationships: items.filter((item) => item.type === 'relationship'),
    preferences: items.filter((item) => item.type === 'preference'),
    timeline: items.filter((item) => item.type === 'timeline'),
  };
}

function itemLine(item: WorkingMemoryItem): string {
  const date = item.date ? ` | date=${item.date}` : '';
  const reason = item.reasons.length ? ` | reason=${item.reasons.slice(0, 3).join('; ')}` : '';
  return `- ${item.title} [source=${item.source} | confidence=${item.confidence.toFixed(2)} | score=${item.score.toFixed(2)}${date}${reason}]\n  ${item.content}`;
}

function section(title: string, items: WorkingMemoryItem[]): string {
  if (!items.length) return '';
  return `**${title}**\n${items.map(itemLine).join('\n')}`;
}

export function buildWorkingMemoryPacket(assembly: WorkingMemoryAssembly): WorkingMemoryPacket {
  const entityItems: WorkingMemoryItem[] = assembly.entities.map((entity, index) => ({
    id: `entity:${entity.source}:${entity.id ?? index}`,
    type: 'entity',
    title: entity.name,
    content: `${entity.name} (${entity.type}) from ${entity.source}`,
    source: entity.source,
    confidence: entity.confidence,
    score: entity.confidence,
    reasons: ['resolved query anchor'],
  }));

  const people = entityItems.filter((item) => /\bPERSON|character/i.test(item.content));
  const places = entityItems.filter((item) => /\bPLACE|LOCATION|HOUSEHOLD|place|location/i.test(item.content));
  const recentContext = [...assembly.episodes, ...assembly.timeline]
    .filter((item) => daysAgo(item.date) != null && (daysAgo(item.date) ?? 999) <= 30)
    .slice(0, 6);
  const relevantContext = [
    ...assembly.episodes,
    ...assembly.events,
    ...assembly.timeline,
    ...assembly.preferences,
  ].sort((a, b) => b.score - a.score).slice(0, 8);

  const openLoops: WorkingMemoryPacket['openLoops'] = [];
  if (assembly.entities.some((entity) => entity.source === 'question')) {
    openLoops.push({
      type: 'unknown_entity',
      message: 'The question mentions an entity that is not resolved to durable graph storage.',
      confidence: 0.4,
    });
  }
  if (assembly.budget.selected === 0) {
    openLoops.push({
      type: 'no_memory',
      message: 'No working-memory items met retrieval criteria.',
      confidence: 0.2,
    });
  } else if (assembly.confidence < 0.55) {
    openLoops.push({
      type: 'weak_memory',
      message: 'Working memory exists but confidence is weak; answer with uncertainty.',
      confidence: assembly.confidence,
    });
  }
  if (assembly.budget.rejected > 0) {
    openLoops.push({
      type: 'budget_excluded',
      message: `${assembly.budget.rejected} candidate memories were excluded by budget/ranking.`,
      confidence: 0.8,
    });
  }

  const text = [
    `**WORKING MEMORY PACKET**`,
    `intent=${assembly.intent} | confidence=${assembly.confidence.toFixed(2)} | selected=${assembly.budget.selected}/${assembly.budget.maxItems} | rejected=${assembly.budget.rejected}`,
    '',
    section('People', people),
    section('Places', places),
    section('Projects', assembly.projects),
    section('Goals', assembly.goals),
    section('Skills', assembly.skills),
    section('Communities', assembly.communities),
    section('Events', assembly.events),
    section('Episodes', assembly.episodes),
    section('Relationships', assembly.relationships),
    section('Recent Context', recentContext),
    section('Relevant Context', relevantContext),
    openLoops.length
      ? `**Open Loops**\n${openLoops.map((loop) => `- ${loop.type}: ${loop.message} [confidence=${loop.confidence.toFixed(2)}]`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n');

  return {
    people,
    places,
    projects: assembly.projects,
    goals: assembly.goals,
    skills: assembly.skills,
    communities: assembly.communities,
    events: assembly.events,
    episodes: assembly.episodes,
    relationships: assembly.relationships,
    recentContext,
    relevantContext,
    openLoops,
    text,
  };
}

async function resolveTargetEntities(
  scope: WmaRequestScope,
  userId: string,
  target: string | null
): Promise<WorkingMemoryEntity[]> {
  if (!target) return [];
  const targetKey = normalizeNameKey(target);
  const classification = classifyEntity(target);

  const [characters, locations, organizations, peoplePlaces, projects] = await Promise.all([
    fetchCharactersForResolve(scope, userId, target, targetKey),
    scope.traced(
      'locations',
      'target location lookup',
      `locations:${targetKey}`,
      () =>
        supabaseAdmin
          .from('locations')
          .select('id, name, aliases, importance_score')
          .eq('user_id', userId)
          .ilike('name', target)
    ),
    scope.traced(
      'organizations',
      'target organization lookup',
      `organizations:${targetKey}`,
      () =>
        supabaseAdmin
          .from('organizations')
          .select('id, name, aliases, importance_score')
          .eq('user_id', userId)
          .ilike('name', target)
    ),
    fetchPeoplePlacesForResolve(scope, userId, target, targetKey),
    scope.traced(
      'projects',
      'target project lookup',
      `projects:resolve:${targetKey}`,
      () =>
        supabaseAdmin
          .from('projects')
          .select('id, name, title, status, metadata')
          .eq('user_id', userId)
          .ilike('name', target)
    ),
  ]);

  const entities: WorkingMemoryEntity[] = [];

  for (const row of characters) {
    if (characterMatchesTarget(row, targetKey)) {
      entities.push({ id: row.id, name: row.name, type: 'PERSON', source: 'characters', confidence: 0.95 });
    }
  }

  for (const row of (locations ?? []) as any[]) {
    entities.push({ id: row.id, name: row.name, type: 'PLACE', source: 'locations', confidence: 0.9 });
  }

  for (const row of (organizations ?? []) as any[]) {
    entities.push({ id: row.id, name: row.name, type: 'ORGANIZATION', source: 'organizations', confidence: 0.88 });
  }

  for (const row of (projects ?? []) as any[]) {
    entities.push({ id: row.id, name: row.name ?? row.title ?? target, type: 'PROJECT', source: 'projects', confidence: 0.88 });
  }

  for (const row of peoplePlaces) {
    if (peoplePlaceMatchesTarget(row, targetKey)) {
      entities.push({
        id: row.id,
        name: row.name,
        type: row.type ?? classification.type,
        rootType: classification.rootType,
        source: 'people_places',
        confidence: 0.82,
      });
    }
  }

  if (entities.length === 0) {
    entities.push({ id: null, name: target, type: classification.type, rootType: classification.rootType, source: 'question', confidence: classification.confidence });
  }

  const seen = new Set<string>();
  return entities.filter((entity) => {
    const key = `${entity.source}:${entity.id ?? normalizeNameKey(entity.name)}:${entity.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadProtagonistRelationshipCandidates(
  scope: WmaRequestScope,
  userId: string
): Promise<Candidate[]> {
  const list = await fetchAllCharacters(scope, userId);
  const protagonist =
    list.find((c) => /^me$/i.test(c.name)) ?? list.find((c) => /abel\s+mendoza/i.test(c.name)) ?? list[0];
  if (!protagonist) return [];

  const nameMap = new Map(list.map((c) => [c.id, c.name]));

  const [rels, edges] = await Promise.all([
    scope.traced(
      'character_relationships',
      'protagonist relationship edges',
      `relationships:protagonist:${protagonist.id}`,
      () =>
        supabaseAdmin
          .from('character_relationships')
          .select('id, relationship_type, status, metadata, source_character_id, target_character_id, updated_at')
          .eq('user_id', userId)
          .or(`source_character_id.eq.${protagonist.id},target_character_id.eq.${protagonist.id}`)
          .limit(12)
    ),
    scope.traced(
      'entity_relationships',
      'stored entity relationship edges for protagonist',
      `entity-relationships:protagonist:${protagonist.id}`,
      () =>
        supabaseAdmin
          .from('entity_relationships')
          .select(
            'id, from_entity_id, to_entity_id, from_entity_type, to_entity_type, relationship_type, scope, confidence, metadata, updated_at'
          )
          .eq('user_id', userId)
          .or(
            `and(from_entity_id.eq.${protagonist.id},from_entity_type.eq.character),and(to_entity_id.eq.${protagonist.id},to_entity_type.eq.character)`
          )
          .limit(12)
    ),
  ]);

  const out: Candidate[] = [];

  for (const rel of (rels ?? []) as any[]) {
    const otherId =
      rel.source_character_id === protagonist.id ? rel.target_character_id : rel.source_character_id;
    const otherName = nameMap.get(otherId) ?? 'Unknown';
    const kinship = (rel.metadata as Record<string, unknown>)?.kinship;
    out.push({
      id: `relationship:${rel.id}`,
      type: 'relationship',
      title: kinship ? `${kinship} — ${otherName}` : `${rel.relationship_type} — ${otherName}`,
      content: `${rel.relationship_type}${kinship ? ` (${kinship})` : ''}${rel.status ? `, ${rel.status}` : ''}`,
      source: 'character_relationships',
      date: rel.updated_at,
      confidence: Number((rel.metadata as Record<string, unknown>)?.confidence ?? 0.85),
      relevance: 0.95,
      importance: 0.8,
      significance: 0.75,
      relationshipDistance: 0.85,
      reasons: ['protagonist relationship edge'],
    });
  }

  const edgeRows = (edges ?? []) as Array<{
    id: string;
    from_entity_id: string;
    to_entity_id: string;
    relationship_type: string;
    scope?: string | null;
    confidence?: number;
    metadata?: Record<string, unknown>;
    updated_at?: string;
  }>;

  if (edgeRows.length > 0) {
    const unresolvedIds = [
      ...new Set(
        edgeRows.map((edge) =>
          edge.from_entity_id === protagonist.id ? edge.to_entity_id : edge.from_entity_id
        )
      ),
    ].filter((id) => !nameMap.has(id));

    if (unresolvedIds.length > 0) {
      const [orgs, omega] = await Promise.all([
        scope.traced('organizations', 'org names for entity relationship endpoints', `entity-rel-names:orgs`, () =>
          supabaseAdmin.from('organizations').select('id, name').eq('user_id', userId).in('id', unresolvedIds)
        ),
        scope.traced('omega_entities', 'omega names for entity relationship endpoints', `entity-rel-names:omega`, () =>
          supabaseAdmin.from('omega_entities').select('id, primary_name').eq('user_id', userId).in('id', unresolvedIds)
        ),
      ]);
      for (const o of (orgs ?? []) as Array<{ id: string; name: string }>) nameMap.set(o.id, o.name);
      for (const oe of (omega ?? []) as Array<{ id: string; primary_name: string }>) {
        nameMap.set(oe.id, oe.primary_name);
      }
    }

    for (const edge of edgeRows) {
      const otherId = edge.from_entity_id === protagonist.id ? edge.to_entity_id : edge.from_entity_id;
      const otherName = nameMap.get(otherId) ?? 'Unknown';
      const role = (edge.metadata?.role as string | undefined) ?? undefined;
      out.push({
        id: `entity-relationship:${edge.id}`,
        type: 'relationship',
        title: role ? `${role} — ${otherName}` : `${edge.relationship_type} — ${otherName}`,
        content: `${edge.relationship_type}${edge.scope ? ` (${edge.scope})` : ''}${role ? ` · ${role}` : ''}`,
        source: 'entity_relationships',
        date: edge.updated_at ?? null,
        confidence: Number(edge.confidence ?? 0.82),
        relevance: 0.93,
        importance: 0.82,
        significance: 0.78,
        relationshipDistance: 0.86,
        reasons: ['persisted entity relationship edge'],
      });
    }
  }

  return out;
}

async function loadThreadRelationshipGroupCandidates(
  scope: WmaRequestScope,
  userId: string,
  threadId?: string | null
): Promise<Candidate[]> {
  if (!threadId) return [];

  const messages = await scope.traced(
    'chat_messages',
    'thread relationship groups from pipeline metadata',
    `thread-rel-groups:${threadId}`,
    () =>
      supabaseAdmin
        .from('chat_messages')
        .select('id, created_at, metadata')
        .eq('user_id', userId)
        .eq('session_id', threadId)
        .order('created_at', { ascending: false })
        .limit(15)
  );

  const out: Candidate[] = [];
  const seen = new Set<string>();

  for (const msg of (messages ?? []) as Array<{ id: string; created_at?: string; metadata?: Record<string, unknown> }>) {
    const enrichment = (msg.metadata?.ontology_enrichment ?? {}) as Record<string, unknown>;
    const groups = enrichment.relationship_groups as Array<{
      scope: string;
      entityNames: string[];
      confidence?: number;
      hint?: string;
      roles?: string[];
    }> | undefined;

    if (groups?.length) {
      for (const g of groups) {
        const names = (g.entityNames ?? []).filter(Boolean);
        if (names.length === 0) continue;
        const id = `thread-rel-group:${g.scope}:${[...names].sort().join('|')}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({
          id,
          type: 'relationship',
          title: `${g.scope} — ${names.join(', ')}`,
          content: `${g.scope} cluster: ${names.join(', ')}${g.hint ? ` (${g.hint})` : ''}`,
          source: 'thread_relationship_groups',
          date: msg.created_at ?? null,
          confidence: g.confidence ?? 0.72,
          relevance: 0.92,
          importance: 0.78,
          significance: 0.72,
          relationshipDistance: 0.82,
          reasons: ['recent thread relationship group from interpretation pipeline'],
        });
      }
    }

    const entityKnowledge = enrichment.entity_relationship_knowledge as Record<
      string,
      { linkedEntities?: Array<{ name: string; relationshipType: string; scope: string; role?: string }> }
    > | undefined;
    if (entityKnowledge) {
      for (const [entityName, knowledge] of Object.entries(entityKnowledge)) {
        for (const link of knowledge.linkedEntities ?? []) {
          const id = `thread-rel-link:${entityName}:${link.name}:${link.relationshipType}`;
          if (seen.has(id)) continue;
          seen.add(id);
          out.push({
            id,
            type: 'relationship',
            title: `${entityName} → ${link.name}`,
            content: `${link.relationshipType}${link.role ? ` (${link.role})` : ''} · ${link.scope}`,
            source: 'thread_entity_relationship_knowledge',
            date: msg.created_at ?? null,
            confidence: 0.75,
            relevance: 0.88,
            importance: 0.72,
            significance: 0.68,
            relationshipDistance: 0.78,
            reasons: ['entity relationship knowledge from recent thread message'],
          });
        }
      }
    }
  }

  return out;
}

async function loadPersonCandidates(
  scope: WmaRequestScope,
  userId: string,
  entity: WorkingMemoryEntity,
  target: string,
  characterRow?: CharacterRow | null
): Promise<Candidate[]> {
  const characterId = entity.source === 'characters' ? entity.id : null;
  if (!characterId) return [];

  const [memories, events, relationships, facts, character] = await Promise.all([
    scope.traced(
      'character_memories',
      'memories for target character',
      `memories:${characterId}`,
      () =>
        supabaseAdmin
          .from('character_memories')
          .select('id, summary, journal_entry_id, created_at, metadata')
          .eq('user_id', userId)
          .eq('character_id', characterId)
          .limit(8)
    ),
    scope.traced(
      'character_timeline_events',
      'events for target character',
      `events:character:${characterId}`,
      () =>
        supabaseAdmin
          .from('character_timeline_events')
          .select('id, event_title, event_type, event_date, event_summary, confidence, metadata')
          .eq('user_id', userId)
          .eq('character_id', characterId)
          .order('event_date', { ascending: false })
          .limit(6)
    ),
    scope.traced(
      'character_relationships',
      'relationships for target character',
      `relationships:character:${characterId}`,
      () =>
        supabaseAdmin
          .from('character_relationships')
          .select('id, relationship_type, status, source_character_id, target_character_id, strength, metadata, updated_at')
          .eq('user_id', userId)
          .or(`source_character_id.eq.${characterId},target_character_id.eq.${characterId}`)
          .limit(6)
    ),
    scope.traced(
      'entity_facts',
      'active facts for target character',
      `facts:character:${characterId}`,
      () =>
        supabaseAdmin
          .from('entity_facts')
          .select('id, fact, confidence, updated_at, metadata')
          .eq('user_id', userId)
          .eq('entity_type', 'character')
          .eq('entity_id', characterId)
          .eq('status', 'active')
          .order('confidence', { ascending: false })
          .limit(6)
    ),
    characterRow
      ? Promise.resolve(characterRow)
      : scope.traced(
          'characters',
          'target character record',
          `characters:single:${characterId}`,
          () =>
            supabaseAdmin
              .from('characters')
              .select('id, name, summary, metadata, importance_score, importance_level, updated_at')
              .eq('id', characterId)
              .eq('user_id', userId)
              .maybeSingle()
        ),
  ]);

  const out: Candidate[] = [];
  const charMeta = ((character as CharacterRow | null)?.metadata ?? {}) as Record<string, unknown>;
  const biography = charMeta.al_biography as Record<string, unknown> | undefined;
  if (character) {
    const row = character as CharacterRow;
    out.push({
      id: `character:${characterId}`,
      type: 'entity',
      title: row.name ?? target,
      content: String(biography?.narrative_summary ?? row.summary ?? `Character record for ${target}`),
      source: 'characters',
      date: row.updated_at,
      confidence: 0.9,
      relevance: 1,
      importance: Number(row.importance_score ?? 60) / 100,
      significance: biography ? 0.85 : 0.55,
      relationshipDistance: 1,
      reasons: ['target character record'],
    });
  }

  const memoryTargetKey = normalizeNameKey(target ?? '');
  for (const memory of (memories ?? []) as any[]) {
    const memText = String(memory.summary ?? `Linked memory ${memory.journal_entry_id}`);
    // A character can be linked to memories that are really about someone else.
    // Memories whose text names the queried person rank above the rest so a
    // person query surfaces them first instead of the most recent linked memory.
    const namesTarget = !memoryTargetKey || normalizeNameKey(memText).includes(memoryTargetKey);
    out.push({
      id: `memory:${memory.id}`,
      type: 'episode',
      title: `Memory involving ${target}`,
      content: memText,
      source: 'character_memories',
      date: memory.created_at,
      confidence: 0.8,
      relevance: namesTarget ? 0.95 : 0.8,
      importance: 0.65,
      significance: 0.6,
      relationshipDistance: 1,
      reasons: [namesTarget ? 'names the target' : 'linked to target character'],
      metadata: { journal_entry_id: memory.journal_entry_id },
    });
  }

  for (const event of (events ?? []) as any[]) {
    out.push({
      id: `event:${event.id}`,
      type: 'event',
      title: event.event_title ?? event.event_type ?? `Event involving ${target}`,
      content: String(event.event_summary ?? event.event_title ?? ''),
      source: 'character_timeline_events',
      date: event.event_date,
      confidence: Number(event.confidence ?? 0.8),
      relevance: 0.92,
      importance: 0.75,
      significance: Number((event.metadata as Record<string, unknown>)?.significance_score ?? 65) / 100,
      relationshipDistance: 1,
      reasons: ['timeline event for target character'],
    });
  }

  for (const rel of (relationships ?? []) as any[]) {
    out.push({
      id: `relationship:${rel.id}`,
      type: 'relationship',
      title: String(rel.relationship_type ?? 'relationship').replace(/_/g, ' '),
      content: `${rel.relationship_type ?? 'relationship'}${rel.status ? ` (${rel.status})` : ''}`,
      source: 'character_relationships',
      date: rel.updated_at,
      confidence: 0.78,
      relevance: 0.82,
      importance: Number(rel.strength ?? 60) / 100,
      significance: 0.65,
      relationshipDistance: 0.9,
      reasons: ['relationship edge adjacent to target'],
    });
  }

  for (const fact of (facts ?? []) as any[]) {
    out.push({
      id: `fact:${fact.id}`,
      type: 'timeline',
      title: `Fact about ${target}`,
      content: String(fact.fact ?? ''),
      source: 'entity_facts',
      date: fact.updated_at,
      confidence: Number(fact.confidence ?? 0.7),
      relevance: 0.88,
      importance: 0.55,
      significance: 0.6,
      relationshipDistance: 1,
      reasons: ['verified active fact for target'],
    });
  }

  return out;
}

async function loadTextualCandidates(
  scope: WmaRequestScope,
  userId: string,
  target: string | null,
  intent: WorkingMemoryIntent,
  threadId?: string,
  temporalWindow?: TemporalWindow | null
): Promise<Candidate[]> {
  const like = `%${target ?? ''}%`;
  const wantsTarget = Boolean(target);
  const temporal = isTemporalIntent(intent);
  const isoRange = temporalWindow ? { gte: temporalWindow.start.toISOString(), lte: temporalWindow.end.toISOString() } : null;

  const applyDateRange = <T extends { gte: (col: string, val: string) => T; lte: (col: string, val: string) => T }>(
    q: T,
    column: string
  ): T => {
    if (!isoRange) return q;
    return q.gte(column, isoRange.gte).lte(column, isoRange.lte);
  };

  const [entries, chats, timeline, eventTargetHits, projects, biography, resolvedEvents] = await Promise.all([
    scope.traced(
      'journal_entries',
      temporal ? 'journal entries in temporal window' : 'recent journal entries',
      `journal_entries:${intent}`,
      () => {
        let q = supabaseAdmin
          .from('journal_entries')
          .select('id, content, summary, date, tags, source, metadata')
          .eq('user_id', userId);
        q = applyDateRange(q, 'date');
        return q.order('date', { ascending: false }).limit(temporal ? 12 : intent === 'LIFE_REVIEW' ? 8 : 6);
      }
    ),
    threadId
      ? scope.traced(
          'chat_messages',
          'current thread messages',
          `chat_messages:thread:${threadId}`,
          () =>
            supabaseAdmin
              .from('chat_messages')
              .select('id, content, created_at, session_id, role')
              .eq('user_id', userId)
              .eq('session_id', threadId)
              .order('created_at', { ascending: false })
              .limit(8)
        )
      : scope.traced(
          'chat_messages',
          'chat messages matching target',
          `chat_messages:target:${normalizeNameKey(target ?? '')}`,
          () =>
            supabaseAdmin
              .from('chat_messages')
              .select('id, content, created_at, session_id, role')
              .eq('user_id', userId)
              .eq('role', 'user')
              .ilike('content', like)
              .order('created_at', { ascending: false })
              .limit(6)
        ),
    scope.traced(
      'character_timeline_events',
      temporal ? 'timeline events in window' : 'recent timeline events',
      `timeline_events:recent:${intent}`,
      () => {
        let q = supabaseAdmin
          .from('character_timeline_events')
          .select('id, event_title, event_type, event_date, event_summary, confidence, metadata')
          .eq('user_id', userId);
        q = applyDateRange(q, 'event_date');
        return q
          .order('event_date', { ascending: false })
          .limit(temporal || intent === 'LIFE_REVIEW' || intent === 'EVENT_QUERY' ? 12 : 4);
      }
    ),
    intent === 'EVENT_QUERY' && target
      ? scope.traced(
          'character_timeline_events',
          'target-matched timeline events',
          `timeline_events:target:${normalizeNameKey(target)}`,
          () =>
            supabaseAdmin
              .from('character_timeline_events')
              .select('id, event_title, event_type, event_date, event_summary, confidence, metadata')
              .eq('user_id', userId)
              .or(eventSearchOrClause(target))
              .order('event_date', { ascending: false })
              .limit(6)
        )
      : Promise.resolve([] as any[]),
    fetchProjectsForTextual(scope, userId),
    temporal
      ? Promise.resolve([] as any[])
      : scope.traced(
      'narrative_accounts',
      'narrative accounts',
      `narrative_accounts:${intent}`,
      () =>
        supabaseAdmin
          .from('narrative_accounts')
          .select('id, account_type, narrative_text, metadata, recorded_at')
          .eq('user_id', userId)
          .order('recorded_at', { ascending: false })
          .limit(intent === 'IDENTITY_QUERY' || intent === 'LIFE_REVIEW' ? 4 : 2)
    ),
    // Event coverage fix: resolved_events is the recovery-populated event store
    // (the WMA previously read only character_timeline_events, which is sparser).
    // Read both and dedupe so EVENT_QUERY/LIFE_REVIEW actually return events.
    scope.traced(
      'resolved_events',
      'resolved events (recovery store)',
      `resolved_events:${intent}:${normalizeNameKey(target ?? '')}`,
      () => {
        const base = supabaseAdmin
          .from('resolved_events')
          .select('id, title, summary, type, start_time, confidence, tags, people, locations, metadata')
          .eq('user_id', userId);
        let scoped = wantsTarget && intent === 'EVENT_QUERY'
          ? base.or(
              (target!.match(/\b[a-z]{4,}/gi) ?? [target!])
                .slice(0, 4)
                .flatMap((tk) => [`title.ilike.%${escapeIlike(tk)}%`, `summary.ilike.%${escapeIlike(tk)}%`])
                .join(',') || `title.ilike.%${escapeIlike(target!.slice(0, 24))}%`
            )
          : base;
        scoped = applyDateRange(scoped, 'start_time');
        return scoped
          .order('start_time', { ascending: false, nullsFirst: false })
          .limit(temporal || intent === 'LIFE_REVIEW' || intent === 'EVENT_QUERY' || intent === 'RELATIONSHIP_QUERY' ? 12 : 5);
      }
    ),
  ]);

  const targetKey = normalizeNameKey(target ?? '');
  const includeByIntent = (text: string) => {
    if (!targetKey) return true;
    return normalizeNameKey(text).includes(targetKey);
  };

  const out: Candidate[] = [];

  for (const entry of (entries ?? []) as any[]) {
    const summaryText = String(entry.summary ?? '');
    const bodyText = String(entry.content ?? '');
    // Match the target against the full entry (summary + body). Auto-generated
    // summaries often omit the person named in the body, so matching on summary
    // alone silently dropped relevant episodes from PERSON/RELATIONSHIP queries.
    const matchText = `${summaryText} ${bodyText}`.trim();
    const matchesTarget = includeByIntent(matchText);
    const displayText = summaryText && (!wantsTarget || includeByIntent(summaryText))
      ? summaryText
      : matchText || summaryText || bodyText;
    if (temporalWindow && !occurredInWindow(entry.date, temporalWindow)) continue;
    if (wantsTarget && !matchesTarget && !['LIFE_REVIEW', 'IDENTITY_QUERY'].includes(intent)) continue;
    out.push({
      id: `episode:${entry.id}`,
      type: 'episode',
      title: entry.summary ? String(entry.summary).slice(0, 80) : 'Journal episode',
      content: displayText.slice(0, 700),
      source: 'journal_entries',
      date: entry.date,
      confidence: 0.72,
      relevance: temporal ? 0.95 : wantsTarget ? (matchesTarget ? 0.84 : 0.35) : 0.7,
      importance: 0.5,
      significance: Array.isArray(entry.tags) && entry.tags.length > 0 ? 0.6 : 0.45,
      relationshipDistance: 0.5,
      reasons: matchesTarget ? ['text matches target'] : ['recent episode'],
    });
  }

  for (const chat of (chats ?? []) as any[]) {
    const text = String(chat.content ?? '');
    if (temporalWindow && !occurredInWindow(chat.created_at, temporalWindow)) continue;
    if (wantsTarget && !includeByIntent(text) && !threadId) continue;
    out.push({
      id: `chat:${chat.id}`,
      type: intent === 'DEBUG_QUERY' ? 'debug' : 'episode',
      title: threadId ? 'Current thread message' : 'Past chat mention',
      content: text.slice(0, 600),
      source: 'chat_messages',
      date: chat.created_at,
      confidence: 0.68,
      relevance: threadId ? 0.86 : 0.72,
      importance: 0.45,
      significance: 0.4,
      relationshipDistance: threadId ? 0.8 : 0.45,
      reasons: [threadId ? 'same thread' : 'chat text matches target'],
      metadata: { session_id: chat.session_id, role: chat.role },
    });
  }

  const seenEventIds = new Set<string>();
  for (const event of [...(timeline ?? []), ...(eventTargetHits ?? [])] as any[]) {
    if (seenEventIds.has(event.id)) continue;
    seenEventIds.add(event.id);
    const text = `${event.event_title ?? ''} ${event.event_summary ?? ''}`;
    if (temporalWindow && !occurredInWindow(event.event_date, temporalWindow)) continue;
    if (wantsTarget && !includeByIntent(text) && !['LIFE_REVIEW', 'EVENT_QUERY'].includes(intent)) continue;
    out.push({
      id: `timeline:${event.id}`,
      type: intent === 'EVENT_QUERY' || intent === 'RELATIONSHIP_QUERY' ? 'event' : 'timeline',
      title: event.event_title ?? event.event_type ?? 'Timeline event',
      content: String(event.event_summary ?? event.event_title ?? ''),
      source: 'character_timeline_events',
      date: event.event_date,
      confidence: Number(event.confidence ?? 0.7),
      relevance: includeByIntent(text) ? (intent === 'EVENT_QUERY' ? 0.98 : 0.8) : 0.55,
      importance: 0.65,
      significance: Number((event.metadata as Record<string, unknown>)?.significance_score ?? 55) / 100,
      relationshipDistance: 0.5,
      reasons: includeByIntent(text) ? ['timeline text matches target'] : ['recent timeline'],
    });
  }

  for (const event of (resolvedEvents ?? []) as any[]) {
    const text = `${event.title ?? ''} ${event.summary ?? ''}`;
    if (temporalWindow && !occurredInWindow(event.start_time, temporalWindow)) continue;
    if (wantsTarget && !includeByIntent(text) && !['LIFE_REVIEW', 'EVENT_QUERY'].includes(intent)) continue;
    out.push({
      id: `resolved_event:${event.id}`,
      type: intent === 'PERSON_QUERY' || intent === 'RELATIONSHIP_QUERY' ? 'timeline' : 'event',
      title: String(event.title ?? event.type ?? 'Event'),
      content: String(event.summary ?? event.title ?? ''),
      source: 'resolved_events',
      date: event.start_time,
      confidence: Number(event.confidence ?? 0.75),
      relevance: includeByIntent(text) ? (intent === 'EVENT_QUERY' ? 0.97 : 0.78) : 0.6,
      importance: 0.68,
      significance: Number((event.metadata as Record<string, unknown>)?.significance_score ?? 60) / 100,
      relationshipDistance: 0.5,
      reasons: includeByIntent(text) ? ['resolved event matches target'] : ['recent resolved event'],
      metadata: { people: event.people, locations: event.locations, tags: event.tags },
    });
  }

  for (const project of projects) {
    const name = String(project.name ?? project.title ?? '');
    const text = `${name} ${project.description ?? ''} ${project.status ?? ''}`;
    if (intent !== 'PROJECT_QUERY' && intent !== 'LIFE_REVIEW' && intent !== 'IDENTITY_QUERY' && (wantsTarget ? !includeByIntent(text) : true)) continue;
    out.push({
      id: `project:${project.id}`,
      type: 'project',
      title: name || 'Project',
      content: String(project.description ?? project.status ?? name),
      source: 'projects',
      date: project.updated_at,
      confidence: 0.78,
      relevance: includeByIntent(text) ? 0.95 : 0.6,
      importance: 0.7,
      significance: 0.65,
      relationshipDistance: 0.5,
      reasons: ['project table match'],
    });
  }

  for (const account of (biography ?? []) as any[]) {
    const text = String(account.narrative_text ?? '');
    if (!text) continue;
    out.push({
      id: `narrative:${account.id}`,
      type: intent === 'IDENTITY_QUERY' ? 'preference' : 'timeline',
      title: String(account.account_type ?? 'narrative account').replace(/_/g, ' '),
      content: text.slice(0, 900),
      source: 'narrative_accounts',
      date: account.recorded_at,
      confidence: 0.82,
      relevance: intent === 'IDENTITY_QUERY' ? 0.95 : 0.65,
      importance: 0.85,
      significance: 0.85,
      relationshipDistance: 0.7,
      reasons: [intent === 'IDENTITY_QUERY' ? 'identity narrative' : 'biographical context'],
    });
  }

  return out;
}

async function loadSkillCandidates(
  scope: WmaRequestScope,
  userId: string,
  target: string | null,
  intent: WorkingMemoryIntent
): Promise<Candidate[]> {
  if (intent !== 'SKILL_QUERY' && intent !== 'LIFE_REVIEW' && intent !== 'IDENTITY_QUERY' && !target) {
    return [];
  }
  const rows = await scope.traced(
    'skills',
    'skills for user',
    `skills:${userId}`,
    () =>
      supabaseAdmin
        .from('skills')
        .select('id, skill_name, skill_category, description, current_level, total_xp, practice_count, last_practiced_at, confidence_score, is_active, metadata')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('practice_count', { ascending: false })
        .limit(12)
  );
  const targetKey = normalizeNameKey(target ?? '');
  const out: Candidate[] = [];
  for (const row of (rows ?? []) as any[]) {
    const name = String(row.skill_name ?? '');
    if (!name) continue;
    const matches = targetKey ? normalizeNameKey(name).includes(targetKey) || targetKey.includes(normalizeNameKey(name)) : false;
    if (intent !== 'SKILL_QUERY' && intent !== 'LIFE_REVIEW' && intent !== 'IDENTITY_QUERY' && !matches) continue;
    const level = Number(row.current_level ?? 1);
    const practice = Number(row.practice_count ?? 0);
    const category = String(row.skill_category ?? 'other');
    const isProfessional = category === 'professional' || category === 'technical';
    out.push({
      id: `skill:${row.id}`,
      type: 'skill',
      title: `${name} (${category})`,
      content: String(
        row.description ??
          `${name} — level ${level}, practiced ${practice}×, ${isProfessional ? 'professional' : 'personal'} skill`
      ),
      source: 'skills',
      date: row.last_practiced_at ?? null,
      confidence: Number(row.confidence_score ?? 0.7),
      relevance: matches ? 0.95 : intent === 'SKILL_QUERY' ? 0.9 : 0.55,
      importance: clamp01(level / 10 + practice / 50),
      significance: clamp01(0.4 + practice / 40),
      relationshipDistance: 0.5,
      reasons: matches ? ['skill matches target'] : practice >= 5 ? ['frequently practiced skill'] : ['active skill'],
      metadata: { level, total_xp: row.total_xp, practice_count: practice, category, is_professional: isProfessional },
    });
  }
  return out;
}

async function loadGoalCandidates(
  scope: WmaRequestScope,
  userId: string,
  target: string | null,
  intent: WorkingMemoryIntent,
  question = ''
): Promise<Candidate[]> {
  if (intent !== 'GOAL_QUERY' && intent !== 'LIFE_REVIEW' && intent !== 'IDENTITY_QUERY') {
    return [];
  }
  const wantsAbandoned = /\babandon(ed|ing)?\b/i.test(question);
  const [goalRows, insightRows] = await Promise.all([
    scope.traced(
      'goals',
      'goals for user',
      `goals:${userId}:${wantsAbandoned ? 'abandoned' : 'active'}`,
      () => {
        let query = supabaseAdmin
          .from('goals')
          .select('id, title, description, status, milestones, probability, last_action_at, updated_at, metadata, source')
          .eq('user_id', userId);
        if (wantsAbandoned) {
          query = query.eq('status', 'abandoned');
        } else {
          query = query.neq('status', 'abandoned');
        }
        return query.order('updated_at', { ascending: false }).limit(12);
      }
    ),
    scope.traced(
      'goal_insights',
      'goal insights for user',
      `goal_insights:${userId}`,
      () =>
        supabaseAdmin
          .from('goal_insights')
          .select('id, type, message, confidence, timestamp, related_goal_id, metadata')
          .eq('user_id', userId)
          .order('timestamp', { ascending: false })
          .limit(10)
    ),
  ]);

  const insightsByGoal = new Map<string, any[]>();
  for (const insight of (insightRows ?? []) as any[]) {
    const gid = insight.related_goal_id as string | null;
    if (!gid) continue;
    const list = insightsByGoal.get(gid) ?? [];
    list.push(insight);
    insightsByGoal.set(gid, list);
  }

  const targetKey = normalizeNameKey(target ?? '');
  const out: Candidate[] = [];
  for (const row of (goalRows ?? []) as any[]) {
    const title = String(row.title ?? '');
    if (!title) continue;
    const text = `${title} ${row.description ?? ''}`;
    const matches = targetKey ? normalizeNameKey(text).includes(targetKey) : false;
    const status = String(row.status ?? 'active').toLowerCase();
    const active = status === 'active';
    const stalled =
      status === 'paused' ||
      (row.last_action_at &&
        daysAgo(row.last_action_at) != null &&
        (daysAgo(row.last_action_at) ?? 0) > 30);
    const completed = status === 'completed';
    const insights = insightsByGoal.get(row.id) ?? [];
    const progressNotes = insights
      .filter((i) => ['progress', 'milestone', 'success_probability'].includes(String(i.type)))
      .slice(0, 2)
      .map((i) => String(i.message))
      .join('; ');
    const blockers = insights
      .filter((i) => ['stagnation', 'dependency_warning'].includes(String(i.type)))
      .slice(0, 2)
      .map((i) => String(i.message))
      .join('; ');
    const milestoneCount = Array.isArray(row.milestones) ? row.milestones.length : 0;
    const contentParts = [
      row.description ?? title,
      active ? 'status: active' : completed ? 'status: completed' : stalled ? 'status: stalled/paused' : `status: ${status}`,
      milestoneCount ? `milestones: ${milestoneCount}` : '',
      row.probability != null ? `probability: ${Number(row.probability).toFixed(2)}` : '',
      progressNotes ? `progress: ${progressNotes}` : '',
      blockers ? `blockers: ${blockers}` : '',
    ].filter(Boolean);

    out.push({
      id: `goal:${row.id}`,
      type: 'goal',
      title: completed ? `${title} [completed]` : stalled ? `${title} [stalled]` : title,
      content: contentParts.join(' | ').slice(0, 900),
      source: 'goals',
      date: row.updated_at ?? row.last_action_at ?? null,
      confidence: Number(row.probability ?? insights[0]?.confidence ?? 0.7),
      relevance: matches ? 0.95 : intent === 'GOAL_QUERY' ? (active ? 0.92 : 0.78) : 0.55,
      importance: active ? 0.85 : completed ? 0.6 : 0.5,
      significance: milestoneCount > 0 ? 0.75 : 0.6,
      relationshipDistance: 0.5,
      reasons: matches ? ['goal matches target'] : active ? ['active goal'] : completed ? ['completed goal'] : ['goal'],
      metadata: { status, milestone_count: milestoneCount, source: row.source, has_blockers: Boolean(blockers) },
    });
  }

  // Fallback when goals table is empty/missing — mine goal language from journal entries.
  if (out.length === 0 && intent === 'GOAL_QUERY') {
    const journalGoals = await scope.traced(
      'journal_entries',
      'journal goal mentions',
      `journal:goal_mentions:${userId}`,
      () =>
        supabaseAdmin
          .from('journal_entries')
          .select('id, summary, content, date, tags, metadata')
          .eq('user_id', userId)
          .or('summary.ilike.%goal%,content.ilike.%goal%,summary.ilike.%want to%,content.ilike.%working toward%,summary.ilike.%aspir%,tags.cs.{goal}')
          .order('date', { ascending: false })
          .limit(8)
    );
    for (const entry of (journalGoals ?? []) as any[]) {
      const text = String(entry.summary ?? entry.content ?? '');
      if (!text.trim()) continue;
      out.push({
        id: `goal:journal:${entry.id}`,
        type: 'goal',
        title: String(entry.summary ?? 'Goal mention').slice(0, 80),
        content: text.slice(0, 700),
        source: 'journal_entries',
        date: entry.date,
        confidence: 0.65,
        relevance: 0.8,
        importance: 0.7,
        significance: 0.65,
        relationshipDistance: 0.5,
        reasons: ['journal goal mention (goals table unavailable)'],
      });
    }
  }

  return out;
}

async function loadCommunityCandidates(
  scope: WmaRequestScope,
  userId: string,
  intent: WorkingMemoryIntent
): Promise<Candidate[]> {
  if (intent !== 'COMMUNITY_QUERY' && intent !== 'LIFE_REVIEW' && intent !== 'IDENTITY_QUERY') {
    return [];
  }
  const [communities, organizations] = await Promise.all([
    scope.traced(
      'social_communities',
      'social communities for user',
      `social_communities:${userId}`,
      () =>
        supabaseAdmin
          .from('social_communities')
          .select('id, theme, members, cohesion, size, metadata, updated_at')
          .eq('user_id', userId)
          .order('size', { ascending: false })
          .limit(10)
    ),
    scope.traced(
      'organizations',
      'organizations for user',
      `organizations:community:${userId}`,
      () =>
        supabaseAdmin
          .from('organizations')
          .select('id, name, description, type, group_type, status, importance_score, metadata, updated_at')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(8)
    ),
  ]);

  const out: Candidate[] = [];
  for (const row of (communities ?? []) as any[]) {
    const theme = String(row.theme ?? 'Community');
    const members = Array.isArray(row.members) ? row.members.slice(0, 8).join(', ') : '';
    const cohesion = Number(row.cohesion ?? 0.5);
    const size = Number(row.size ?? 0);
    const declining = cohesion < 0.35;
    const active = cohesion >= 0.5 && size >= 2;
    out.push({
      id: `community:${row.id}`,
      type: 'community',
      title: theme,
      content: `Members: ${members || 'unknown'} | size=${size} | cohesion=${cohesion.toFixed(2)}${declining ? ' | declining' : active ? ' | active' : ''}`,
      source: 'social_communities',
      date: row.updated_at ?? null,
      confidence: clamp01(cohesion + 0.2),
      relevance: intent === 'COMMUNITY_QUERY' ? (active ? 0.92 : 0.78) : 0.55,
      importance: clamp01(size / 10 + cohesion / 2),
      significance: cohesion,
      relationshipDistance: 0.6,
      reasons: [active ? 'active community' : declining ? 'declining community' : 'social cluster'],
      metadata: { size, cohesion, members: row.members },
    });
  }

  for (const org of (organizations ?? []) as any[]) {
    const name = String(org.name ?? 'Organization');
    const orgKind = org.group_type ?? org.type;
    const isCommunity =
      orgKind === 'family' ||
      /goth|household|crew|club|community|scene|circle|family/i.test(`${name} ${org.description ?? ''}`);
    out.push({
      id: `community:org:${org.id}`,
      type: 'community',
      title: `${name}${orgKind ? ` (${orgKind})` : ''}`,
      content: String(org.description ?? name),
      source: 'organizations',
      date: org.updated_at ?? null,
      confidence: 0.78,
      relevance: intent === 'COMMUNITY_QUERY' ? (isCommunity ? 0.9 : 0.72) : 0.5,
      importance: Number(org.importance_score ?? 0.65),
      significance: 0.6,
      relationshipDistance: 0.55,
      reasons: [isCommunity ? 'community organization' : 'organization / group membership'],
    });
  }
  return out;
}

async function loadProjectCandidates(
  scope: WmaRequestScope,
  userId: string,
  target: string | null,
  intent: WorkingMemoryIntent
): Promise<Candidate[]> {
  if (intent !== 'PROJECT_QUERY' && intent !== 'LIFE_REVIEW' && intent !== 'IDENTITY_QUERY' && !target) {
    return [];
  }
  const rows = await scope.traced(
    'projects',
    'projects for user',
    `projects:all:${userId}`,
    () =>
      supabaseAdmin
        .from('projects')
        .select('id, name, title, description, status, updated_at, metadata')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(10)
  );

  const out: Candidate[] = [];
  const targetKey = normalizeNameKey(target ?? '');

  const mapProjectRow = (project: ProjectRow & { id: string }, source: string) => {
    const name = String(project.name ?? project.title ?? '');
    const text = `${name} ${project.description ?? ''} ${project.status ?? ''}`;
    const matches = targetKey ? normalizeNameKey(text).includes(targetKey) : false;
    const status = String(project.status ?? 'active').toLowerCase();
    const dormant = status === 'paused' || status === 'dormant' || status === 'on_hold';
    const meta = (project.metadata as Record<string, unknown>) ?? {};
    const blockers = meta.blockers ?? meta.blocker;
    const milestones = meta.milestones;
    out.push({
      id: `${source === 'projects' ? 'project' : 'project:org'}:${project.id}`,
      type: 'project',
      title: dormant ? `${name || 'Project'} [dormant]` : name || 'Project',
      content: [
        project.description ?? project.status ?? name,
        blockers ? `blockers: ${String(blockers)}` : '',
        Array.isArray(milestones) ? `milestones: ${milestones.length}` : '',
      ]
        .filter(Boolean)
        .join(' | ')
        .slice(0, 700),
      source,
      date: project.updated_at ?? null,
      confidence: 0.78,
      relevance: matches ? 0.96 : intent === 'PROJECT_QUERY' ? (dormant ? 0.75 : 0.9) : 0.6,
      importance: dormant ? 0.45 : 0.75,
      significance: 0.65,
      relationshipDistance: 0.5,
      reasons: matches ? ['project matches target'] : dormant ? ['dormant project'] : ['active project'],
      metadata: { status, blockers, milestone_count: Array.isArray(milestones) ? milestones.length : 0 },
    });
  };

  for (const project of rows ?? []) {
    mapProjectRow(project, 'projects');
  }

  // Fallback when projects table is empty/missing — use organizations + journal mentions.
  if (out.length === 0) {
    const [orgs, journalHits] = await Promise.all([
      scope.traced(
        'organizations',
        'organizations as project fallback',
        `organizations:project_fallback:${userId}`,
        () =>
          supabaseAdmin
            .from('organizations')
            .select('id, name, description, status, updated_at, metadata, type')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .limit(8)
      ),
      scope.traced(
        'journal_entries',
        'journal project mentions',
        `journal:project_mentions:${userId}`,
        () =>
          supabaseAdmin
            .from('journal_entries')
            .select('id, summary, content, date, tags, metadata')
            .eq('user_id', userId)
            .or('summary.ilike.%lorebook%,content.ilike.%lorebook%,summary.ilike.%lifeledger%,content.ilike.%project%,summary.ilike.%building%')
            .order('date', { ascending: false })
            .limit(6)
      ),
    ]);

    for (const org of (orgs ?? []) as any[]) {
      const name = String(org.name ?? '');
      const desc = String(org.description ?? '');
      const looksLikeProject =
        /bootcamp|lorebook|lifeledger|building|startup|app|side project|working on/i.test(`${name} ${desc}`) ||
        org.metadata?.detected_from === 'chat_threads';
      if (intent === 'PROJECT_QUERY' && !looksLikeProject && org.type === 'family') continue;
      mapProjectRow(
        {
          id: org.id,
          name: org.name,
          title: org.name,
          description: org.description,
          status: org.status,
          updated_at: org.updated_at,
          metadata: org.metadata,
        },
        'organizations'
      );
    }

    for (const entry of (journalHits ?? []) as any[]) {
      const text = String(entry.summary ?? entry.content ?? '');
      if (!text.trim()) continue;
      out.push({
        id: `project:journal:${entry.id}`,
        type: 'project',
        title: String(entry.summary ?? 'Project journal mention').slice(0, 80),
        content: text.slice(0, 700),
        source: 'journal_entries',
        date: entry.date,
        confidence: 0.7,
        relevance: intent === 'PROJECT_QUERY' ? 0.82 : 0.55,
        importance: 0.65,
        significance: 0.6,
        relationshipDistance: 0.5,
        reasons: ['journal project mention'],
      });
    }
  }

  return out;
}

const INTENT_QUOTA: Partial<Record<WorkingMemoryIntent, { types: WorkingMemoryItem['type'][]; min: number }>> = {
  // A question about a person should reliably surface at least one episode that
  // involves them, even when relationship/timeline items score higher.
  PERSON_QUERY: { types: ['episode'], min: 1 },
  GOAL_QUERY: { types: ['goal'], min: 3 },
  DIRECTION_QUERY: { types: ['goal'], min: 2 },
  PROJECT_QUERY: { types: ['project'], min: 3 },
  SKILL_QUERY: { types: ['skill'], min: 3 },
  COMMUNITY_QUERY: { types: ['community'], min: 3 },
  RELATIONSHIP_QUERY: { types: ['relationship'], min: 2 },
  IDENTITY_QUERY: { types: ['goal', 'preference'], min: 2 },
};

function boostCandidatesForIntent(candidates: Candidate[], intent: WorkingMemoryIntent): Candidate[] {
  const quota = INTENT_QUOTA[intent];
  if (!quota) return candidates;
  return candidates.map((c) =>
    quota.types.includes(c.type) ? { ...c, relevance: clamp01(Math.max(c.relevance, 0.88)) } : c
  );
}

function selectBudget(
  candidates: Candidate[],
  maxItems: number,
  intent: WorkingMemoryIntent,
  target?: string | null
): { selected: WorkingMemoryItem[]; rejected: Array<WorkingMemoryItem & { rejectedReason: string }> } {
  const boosted = boostCandidatesForIntent(candidates, intent);
  const ranked = boosted
    .map(scoreCandidate)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence);

  const quota = INTENT_QUOTA[intent];
  const mustInclude: WorkingMemoryItem[] = [];
  if (quota) {
    const targetKey = normalizeNameKey(target ?? '');
    for (const type of quota.types) {
      const typed = ranked.filter((item) => item.type === type);
      const targetMatched = targetKey
        ? typed.filter((item) => {
            const targetText = item.type === 'episode' ? item.content : `${item.title} ${item.content}`;
            return normalizeNameKey(targetText).includes(targetKey);
          })
        : typed;
      const picks = [...targetMatched, ...typed.filter((item) => !targetMatched.some((matched) => matched.id === item.id))]
        .slice(0, quota.min);
      for (const pick of picks) {
        if (!mustInclude.some((m) => m.id === pick.id)) mustInclude.push(pick);
      }
    }
  }

  const mustIds = new Set(mustInclude.map((item) => item.id));
  const rest = ranked.filter((item) => !mustIds.has(item.id));
  const selected = [...mustInclude, ...rest].slice(0, maxItems);
  const selectedIds = new Set(selected.map((item) => item.id));
  const rejected = ranked
    .filter((item) => !selectedIds.has(item.id))
    .map((item) => ({
      ...item,
      rejectedReason: item.score < 0.45 ? 'below working-memory relevance threshold' : 'outside working-memory budget',
    }));
  return { selected, rejected };
}

function assemblyConfidence(intent: WorkingMemoryIntent, entities: WorkingMemoryEntity[], selected: WorkingMemoryItem[]): number {
  if (selected.length === 0 && entities.every((entity) => entity.source === 'question')) return 0.15;
  const avgItem = selected.length
    ? selected.reduce((sum, item) => sum + item.confidence, 0) / selected.length
    : 0.25;
  const entityBoost = entities.some((entity) => entity.id) ? 0.15 : 0;
  const intentBoost = intent === 'DEBUG_QUERY' ? 0.1 : 0;
  return Number(clamp01(avgItem + entityBoost + intentBoost).toFixed(2));
}

export function classifyIntentForAudit(question: string): WorkingMemoryIntent {
  return classifyIntent(question);
}

export async function assembleWorkingMemory(
  input: { question: string; userId: string; threadId?: string | null },
  options: AssembleOptions = {}
): Promise<WorkingMemoryAssembly> {
  const totalStarted = Date.now();
  const maxItems = options.maxItems ?? DEFAULT_BUDGET;
  const scope = new WmaRequestScope();

  const entityStarted = Date.now();
  const temporalResolved: ResolvedTemporalQuery = classifyTemporalQuery(input.question);
  const intent = classifyIntent(input.question);
  const target = extractQuestionTarget(input.question);
  const temporalQuery = isTemporalIntent(intent);
  const entities = await resolveTargetEntities(scope, input.userId, target);
  const entityResolutionMs = Date.now() - entityStarted;

  const primaryEntity =
    entities.find((entity) => entity.source === 'characters') ??
    entities.find((entity) => entity.id) ??
    entities[0] ??
    null;

  let characterRow: CharacterRow | null = null;
  if (primaryEntity?.source === 'characters' && primaryEntity.id && target) {
    const targetKey = normalizeNameKey(target);
    const characters = await fetchCharactersForResolve(scope, input.userId, target, targetKey);
    characterRow = characters.find((row) => row.id === primaryEntity.id) ?? null;
  }

  const candidateStarted = Date.now();
  const wantsHousehold = /\b(who lives with me|who do i live with|my household)\b/i.test(input.question);
  const isPersonish =
    intent !== 'EVENT_QUERY' &&
    !!primaryEntity &&
    (primaryEntity.type === 'PERSON' || intent === 'PERSON_QUERY' || intent === 'RELATIONSHIP_QUERY');
  // Relationship coverage fix: previously relationships only loaded when the target
  // resolved to a `characters` row (loadPersonCandidates) or for explicit household
  // queries. That left RELATIONSHIP_QUERY/LIFE_REVIEW/IDENTITY with zero relationships
  // when the target resolved to people_places (or not at all). Pull protagonist edges
  // for those intents too, and whenever a relationship-shaped query found no character.
  const wantsProtagonistRels =
    wantsHousehold ||
    intent === 'RELATIONSHIP_QUERY' ||
    intent === 'LIFE_REVIEW' ||
    intent === 'IDENTITY_QUERY' ||
    intent === 'COMMUNITY_QUERY' ||
    (intent === 'PERSON_QUERY' && !isPersonish);

  const [personCandidates, relationshipCandidates, threadRelationshipCandidates, goalCandidates, skillCandidates, communityCandidates, projectCandidates, textualCandidates] =
    await Promise.all([
      !temporalQuery && isPersonish
        ? loadPersonCandidates(scope, input.userId, primaryEntity!, target ?? primaryEntity!.name, characterRow)
        : Promise.resolve([] as Candidate[]),
      !temporalQuery && wantsProtagonistRels
        ? loadProtagonistRelationshipCandidates(scope, input.userId)
        : Promise.resolve([] as Candidate[]),
      !temporalQuery && input.threadId
        ? loadThreadRelationshipGroupCandidates(scope, input.userId, input.threadId)
        : Promise.resolve([] as Candidate[]),
      !temporalQuery ? loadGoalCandidates(scope, input.userId, target, intent, input.question) : Promise.resolve([] as Candidate[]),
      !temporalQuery ? loadSkillCandidates(scope, input.userId, target, intent) : Promise.resolve([] as Candidate[]),
      !temporalQuery ? loadCommunityCandidates(scope, input.userId, intent) : Promise.resolve([] as Candidate[]),
      !temporalQuery ? loadProjectCandidates(scope, input.userId, target, intent) : Promise.resolve([] as Candidate[]),
      loadTextualCandidates(scope, input.userId, target, intent, input.threadId ?? undefined, temporalResolved.window),
    ]);
  const candidateGenerationMs = Date.now() - candidateStarted;

  const rankingStarted = Date.now();
  const merged = [
    ...personCandidates,
    ...relationshipCandidates,
    ...threadRelationshipCandidates,
    ...goalCandidates,
    ...skillCandidates,
    ...communityCandidates,
    ...projectCandidates,
    ...textualCandidates,
  ];
  // Dedupe project rows that appear in both dedicated loader and textual loader
  const seenIds = new Set<string>();
  const deduped = merged.filter((c) => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    return true;
  });
  const { selected, rejected } = selectBudget(deduped, maxItems, intent, target);
  const rankingMs = Date.now() - rankingStarted;
  const distributed = distribute(selected);

  const uncachedQueries = scope.queries.filter((query) => !query.cached);

  return {
    intent,
    entities,
    ...distributed,
    confidence: assemblyConfidence(intent, entities, selected),
    budget: {
      maxItems,
      selected: selected.length,
      rejected: rejected.length,
    },
    rejected,
    timing: {
      totalMs: Date.now() - totalStarted,
      entityResolutionMs,
      candidateGenerationMs,
      rankingMs,
      queryCount: uncachedQueries.length,
      queries: scope.queries,
    },
  };
}

export const workingMemoryAssembler = {
  assemble: assembleWorkingMemory,
  buildPacket: buildWorkingMemoryPacket,
};
