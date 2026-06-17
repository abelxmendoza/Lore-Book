import { supabaseAdmin } from '../supabaseClient';
import { classifyEntity, type EntityClass } from '../entities/entityClassifier';
import { normalizeNameKey } from '../../utils/nameNormalization';

export type WorkingMemoryIntent =
  | 'PERSON_QUERY'
  | 'PLACE_QUERY'
  | 'PROJECT_QUERY'
  | 'EVENT_QUERY'
  | 'LIFE_REVIEW'
  | 'RELATIONSHIP_QUERY'
  | 'IDENTITY_QUERY'
  | 'DEBUG_QUERY';

export type WorkingMemoryEntity = {
  id: string | null;
  name: string;
  type: EntityClass | string;
  source: 'characters' | 'locations' | 'organizations' | 'people_places' | 'projects' | 'question';
  confidence: number;
};

export type WorkingMemoryItem = {
  id: string;
  type:
    | 'episode'
    | 'event'
    | 'project'
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
  { intent: 'LIFE_REVIEW', pattern: /\b(what have i been doing lately|what have i done lately|what's been going on|recently|lately|recap my life|life review)\b/i },
  { intent: 'IDENTITY_QUERY', pattern: /\b(what kind of person am i|who am i|what do you know about me|my identity|my values|what matters to me)\b/i },
  { intent: 'EVENT_QUERY', pattern: /\b(what happened at .*(graduation|party|wedding|funeral|birthday)|what happened during|tell me about .*graduation|what did i do with|event)\b/i },
  { intent: 'PLACE_QUERY', pattern: /\b(what happened at|what went on at|what was it like at|memories at|remember at)\b/i },
  { intent: 'PROJECT_QUERY', pattern: /\b(how is .* progressing|progress on|status of|how's .* going|project|lorebook)\b/i },
  { intent: 'RELATIONSHIP_QUERY', pattern: /\b(what do you remember about|relationship with|what happened with|story with|between me and|how am i related to|who lives with me|who do i live with|what role did)\b/i },
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
  for (const rule of INTENT_RULES) {
    if (rule.pattern.test(question)) return rule.intent;
  }
  return 'LIFE_REVIEW';
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
        source: 'people_places',
        confidence: 0.82,
      });
    }
  }

  if (entities.length === 0) {
    entities.push({ id: null, name: target, type: classification.type, source: 'question', confidence: classification.confidence });
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

  const rels = await scope.traced(
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
  );

  const nameMap = new Map(list.map((c) => [c.id, c.name]));
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

  for (const memory of (memories ?? []) as any[]) {
    out.push({
      id: `memory:${memory.id}`,
      type: 'episode',
      title: `Memory involving ${target}`,
      content: String(memory.summary ?? `Linked memory ${memory.journal_entry_id}`),
      source: 'character_memories',
      date: memory.created_at,
      confidence: 0.8,
      relevance: 0.95,
      importance: 0.65,
      significance: 0.6,
      relationshipDistance: 1,
      reasons: ['linked to target character'],
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
  threadId?: string
): Promise<Candidate[]> {
  const like = `%${target ?? ''}%`;
  const wantsTarget = Boolean(target);
  const [entries, chats, timeline, eventTargetHits, projects, biography] = await Promise.all([
    scope.traced(
      'journal_entries',
      'recent journal entries',
      `journal_entries:${intent}`,
      () =>
        supabaseAdmin
          .from('journal_entries')
          .select('id, content, summary, date, tags, source, metadata')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .limit(intent === 'LIFE_REVIEW' ? 8 : 6)
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
      'recent timeline events',
      `timeline_events:recent:${intent}`,
      () =>
        supabaseAdmin
          .from('character_timeline_events')
          .select('id, event_title, event_type, event_date, event_summary, confidence, metadata')
          .eq('user_id', userId)
          .order('event_date', { ascending: false })
          .limit(intent === 'LIFE_REVIEW' || intent === 'EVENT_QUERY' ? 8 : 4)
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
    scope.traced(
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
  ]);

  const targetKey = normalizeNameKey(target ?? '');
  const includeByIntent = (text: string) => {
    if (!targetKey) return true;
    return normalizeNameKey(text).includes(targetKey);
  };

  const out: Candidate[] = [];

  for (const entry of (entries ?? []) as any[]) {
    const text = String(entry.summary ?? entry.content ?? '');
    if (wantsTarget && !includeByIntent(text) && !['LIFE_REVIEW', 'IDENTITY_QUERY'].includes(intent)) continue;
    out.push({
      id: `episode:${entry.id}`,
      type: 'episode',
      title: entry.summary ? String(entry.summary).slice(0, 80) : 'Journal episode',
      content: text.slice(0, 700),
      source: 'journal_entries',
      date: entry.date,
      confidence: 0.72,
      relevance: wantsTarget ? (includeByIntent(text) ? 0.84 : 0.35) : 0.7,
      importance: 0.5,
      significance: Array.isArray(entry.tags) && entry.tags.length > 0 ? 0.6 : 0.45,
      relationshipDistance: 0.5,
      reasons: includeByIntent(text) ? ['text matches target'] : ['recent episode'],
    });
  }

  for (const chat of (chats ?? []) as any[]) {
    const text = String(chat.content ?? '');
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

  for (const project of projects) {
    const name = String(project.name ?? project.title ?? '');
    const text = `${name} ${project.description ?? ''} ${project.status ?? ''}`;
    if (intent !== 'PROJECT_QUERY' && (wantsTarget ? !includeByIntent(text) : true)) continue;
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

function selectBudget(candidates: Candidate[], maxItems: number): { selected: WorkingMemoryItem[]; rejected: Array<WorkingMemoryItem & { rejectedReason: string }> } {
  const ranked = candidates
    .map(scoreCandidate)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence);
  const selected = ranked.slice(0, maxItems);
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

export async function assembleWorkingMemory(
  input: { question: string; userId: string; threadId?: string | null },
  options: AssembleOptions = {}
): Promise<WorkingMemoryAssembly> {
  const totalStarted = Date.now();
  const maxItems = options.maxItems ?? DEFAULT_BUDGET;
  const scope = new WmaRequestScope();

  const entityStarted = Date.now();
  const intent = classifyIntent(input.question);
  const target = extractQuestionTarget(input.question);
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

  const [personCandidates, textualCandidates] = await Promise.all([
    wantsHousehold
      ? loadProtagonistRelationshipCandidates(scope, input.userId)
      : intent !== 'EVENT_QUERY' &&
          primaryEntity &&
          (primaryEntity.type === 'PERSON' || intent === 'PERSON_QUERY' || intent === 'RELATIONSHIP_QUERY')
        ? loadPersonCandidates(
            scope,
            input.userId,
            primaryEntity,
            target ?? primaryEntity.name,
            characterRow
          )
        : Promise.resolve([] as Candidate[]),
    loadTextualCandidates(scope, input.userId, target, intent, input.threadId ?? undefined),
  ]);
  const candidateGenerationMs = Date.now() - candidateStarted;

  const rankingStarted = Date.now();
  const { selected, rejected } = selectBudget([...personCandidates, ...textualCandidates], maxItems);
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
