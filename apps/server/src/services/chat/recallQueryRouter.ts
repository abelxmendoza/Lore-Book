/**
 * Recall Query Router — Sprint G / AF
 *
 * Routes recall queries to foundation tables first. Journal entries are a
 * supplement for biography/general only — never the primary surface for
 * character roster, family, or entity queries.
 */

import { supabaseAdmin } from '../supabaseClient';
import {
  fetchCharacterRoster,
  fetchFamilyMembers,
  fetchEntityProfile,
  formatCharacterRosterForChat,
  formatGroupedCharacterRosterForChat,
  formatStoryRosterForChat,
  formatFamilyTreeForChat,
  formatFamilyRosterForChat,
  formatEntityProfileForChat,
  resolveCharacterByName,
} from './foundationRecallDataService';
import {
  BIOGRAPHY_RE,
  CHARACTER_LIST_RE,
  FAMILY_RECALL_RE,
  FAMILY_KIN_TERM_RE,
  ENTITY_PREFIX_RE,
  CONVERSATION_RECALL_RE,
  WHO_IS_RE,
  matchesEntityQuery,
  TEMPORAL_RE,
  THREAD_RE,
  LOCATION_RE,
  WORK_RE,
} from './recallIntentPatterns';
import { buildConversationSummaryWithRosterFallback } from './conversationSummaryBuilder';
import { buildThreadRecall, THREAD_RECALL_RE } from './threadRecallService';
import { loadFoundationEntityIndex } from './foundationEntityIndex';

async function loadKnownEntities(userId: string): Promise<Map<string, { id: string; type: string }>> {
  return loadFoundationEntityIndex(userId);
}

function extractEntityNameFromQuery(message: string): string | null {
  const m = message.trim().match(ENTITY_PREFIX_RE);
  if (!m || m.index === undefined) return null;
  const rest = message.slice(m.index + m[0].length).trim();
  // Multi-word proper names: "Ashley De La Cruz", "Tío Juan"
  const nameMatch = rest.match(/^([A-ZÁÉÍÓÚÑ][\w.'-]{1,40}(?:\s+(?:de|del|la|los|las|y|van|von|di|da|le|el|the|a|an|T[ií]o|T[ií]a)\s+[A-ZÁÉÍÓÚÑ][\w.'-]{1,40}){0,8})/);
  const name = nameMatch?.[1]?.replace(/[?!.,]{1,8}$/, '').trim() ?? rest.split(/[\s,?!.]+/)[0] ?? '';
  if (!name || !/^[A-ZÁÉÍÓÚÑ]/.test(name)) return null;
  return name;
}

async function detectMentionedEntityName(
  message: string,
  userId: string,
  knownEntities: Map<string, { id: string; type: string }>
): Promise<string | null> {
  const fromPattern = extractEntityNameFromQuery(message);
  if (fromPattern) {
    const char = await resolveCharacterByName(userId, fromPattern);
    if (char) return char.name;
    if (knownEntities.has(fromPattern.toLowerCase())) return fromPattern;
  }

  const lower = message.toLowerCase();
  const { data: chars } = await supabaseAdmin
    .from('characters')
    .select('name, alias')
    .eq('user_id', userId);

  const names: string[] = [];
  for (const c of chars ?? []) {
    names.push(c.name);
    for (const a of c.alias ?? []) names.push(a);
  }
  names.sort((a, b) => b.length - a.length);

  for (const name of names) {
    if (name.length >= 3 && lower.includes(name.toLowerCase())) return name;
  }

  const sorted = [...knownEntities.keys()].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (name.length >= 3 && lower.includes(name)) return name;
  }
  return null;
}

type BiographySnapshotRow = {
  narrative_text?: string | null;
  metadata?: Record<string, unknown> | null;
  recorded_at?: string | null;
};

type FullLifeChapter = {
  title?: string | null;
  text?: string | null;
  timeSpan?: { start?: string | null; end?: string | null } | null;
  themes?: string[] | null;
};

type FullLifeBiographyRow = {
  title?: string | null;
  subtitle?: string | null;
  biography_data?: {
    chapters?: FullLifeChapter[] | null;
  } | null;
  updated_at?: string | null;
};

function cleanBiographyText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function formatIdentityFacts(snapshot: BiographySnapshotRow | null): string {
  const metadata = snapshot?.metadata ?? {};
  const facts = metadata.facts as Record<string, unknown> | undefined;
  const identity = facts?.identity as Record<string, unknown> | undefined;
  const lines: string[] = [];

  const push = (label: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) lines.push(`- ${label}: ${value.trim()}`);
  };

  push('Name', identity?.name);
  push('Background', identity?.background);
  push('Hometown', identity?.hometown);
  push('Location', identity?.location);
  push('Education', identity?.education);
  push('Career', identity?.career ?? identity?.employment);
  push('Languages', identity?.languages);

  return lines.length ? ['## CORE IDENTITY', ...lines].join('\n') : '';
}

function formatLifeChapters(fullLife: FullLifeBiographyRow | null): string {
  const chapters = fullLife?.biography_data?.chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) return '';

  const ordered = [...chapters].sort((a, b) => {
    const aTime = Date.parse(a.timeSpan?.start ?? '');
    const bTime = Date.parse(b.timeSpan?.start ?? '');
    if (!Number.isFinite(aTime)) return 1;
    if (!Number.isFinite(bTime)) return -1;
    return aTime - bTime;
  });

  const rendered = ordered
    .map((chapter) => {
      const text = cleanBiographyText(chapter.text);
      if (!text) return '';
      const title = cleanBiographyText(chapter.title) || 'Life chapter';
      const start = chapter.timeSpan?.start?.slice(0, 10);
      const end = chapter.timeSpan?.end?.slice(0, 10);
      const dates = start ? ` (${start}${end && end !== start ? ` to ${end}` : ''})` : '';
      return `### ${title}${dates}\n${text}`;
    })
    .filter(Boolean);

  if (rendered.length === 0) return '';
  return [
    '## LIFE STORY — CHRONOLOGICAL',
    fullLife?.subtitle ? cleanBiographyText(fullLife.subtitle) : '',
    ...rendered,
  ].filter(Boolean).join('\n\n');
}

/**
 * "Who am I?" is a longitudinal identity request, not a recent-memory query.
 * Lead with stable identity, then the full chronological life story, and keep
 * the rolling snapshot in a clearly subordinate current-context section.
 */
export function formatLongitudinalBiographyContext(
  snapshot: BiographySnapshotRow | null,
  fullLife: FullLifeBiographyRow | null,
): string {
  const identity = formatIdentityFacts(snapshot);
  const lifeChapters = formatLifeChapters(fullLife);
  const currentSnapshot = cleanBiographyText(snapshot?.narrative_text);
  const meta = snapshot?.metadata ?? {};
  const themes = ((meta.themes as Array<{ theme?: string }> | undefined) ?? [])
    .map((theme) => cleanBiographyText(theme.theme))
    .filter(Boolean);

  const body = [
    identity,
    lifeChapters,
    currentSnapshot ? `## CURRENT CHAPTER\n${currentSnapshot}` : '',
    themes.length ? `**Current themes:** ${themes.join(', ')}` : '',
  ].filter(Boolean);

  return body.length ? ['## BIOGRAPHY', ...body].join('\n\n') : '';
}

async function fetchBiographyContext(userId: string): Promise<string> {
  const [snapshotResult, fullLifeResult] = await Promise.all([
    supabaseAdmin
      .from('narrative_accounts')
      .select('narrative_text, metadata, recorded_at')
      .eq('user_id', userId)
      .eq('account_type', 'biography_snapshot')
      .maybeSingle(),
    supabaseAdmin
      .from('biographies')
      .select('title, subtitle, biography_data, updated_at')
      .eq('user_id', userId)
      .eq('is_core_lorebook', true)
      .eq('lorebook_name', 'My Full Life Story')
      .order('lorebook_version', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const snapshot = snapshotResult.data as BiographySnapshotRow | null;
  const fullLife = fullLifeResult.data as FullLifeBiographyRow | null;
  return formatLongitudinalBiographyContext(snapshot, fullLife);
}

async function fetchEntityContext(
  userId: string,
  entityName: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<string> {
  const profile = await fetchEntityProfile(userId, entityName);
  if (!profile) return `No character record found for "${entityName}". Not yet created.`;

  const threadText = conversationHistory
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n');

  return formatEntityProfileForChat(profile, { threadText });
}

async function fetchCharacterListContext(userId: string): Promise<string> {
  return formatStoryRosterForChat(userId);
}

async function fetchFamilyContext(userId: string): Promise<string> {
  const [bioBlock, members, tree] = await Promise.all([
    fetchBiographyContext(userId),
    fetchFamilyMembers(userId),
    formatFamilyTreeForChat(userId),
  ]);
  const rosterBlock = formatFamilyRosterForChat(members, bioBlock || undefined);
  return tree ? `${tree}\n\n${rosterBlock}` : rosterBlock;
}

async function fetchTemporalContext(userId: string): Promise<string> {
  const { data: events } = await supabaseAdmin
    .from('character_timeline_events')
    .select('event_title, event_type, event_date, event_summary')
    .eq('user_id', userId)
    .order('event_date', { ascending: false })
    .limit(5);

  const lines: string[] = ['## RECENT TIMELINE'];
  if (events?.length) {
    for (const ev of events) {
      const date = ev.event_date ? new Date(ev.event_date).toDateString() : '';
      lines.push(`• ${date}: ${ev.event_title} [${ev.event_type}]`);
      if (ev.event_summary) lines.push(`  ${ev.event_summary.slice(0, 150)}`);
    }
  } else {
    lines.push('No timeline events recorded yet.');
  }
  return lines.join('\n');
}

async function fetchFactContext(userId: string, factType: 'location' | 'work'): Promise<string> {
  const { data } = await supabaseAdmin
    .from('narrative_accounts')
    .select('metadata')
    .eq('user_id', userId)
    .eq('account_type', 'biography_snapshot')
    .single();

  if (!data) return '';

  const facts = (data.metadata as Record<string, unknown>)?.facts as Record<string, unknown> | undefined;
  if (!facts) return '';

  if (factType === 'location') {
    const identity = facts.identity as Record<string, string> | undefined;
    const loc = identity?.location;
    const living = facts.livingSituation as string | undefined;
    return loc
      ? `Location: ${loc}.${living ? `\nLiving situation: ${living.slice(0, 200)}` : ''}`
      : 'Location not yet recorded.';
  }

  if (factType === 'work') {
    const identity = facts.identity as Record<string, string> | undefined;
    const employment = identity?.employment;
    const upcoming = (facts.upcomingEvents as string[]) ?? [];
    const events = ((facts.keyEvents as Array<{ eventType: string; title: string }>) ?? []).filter(
      (e) => e.eventType === 'career_event'
    );
    return [
      employment ? `Employment: ${employment}` : '',
      upcoming.length ? `Upcoming: ${upcoming.join('; ')}` : '',
      events.length ? `Career events: ${events.map((e) => e.title).join('; ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

export type RecallIntent =
  | 'biography'
  | 'character_list'
  | 'character_roster'
  | 'family'
  | 'relationship_summary'
  | 'entity'
  | 'temporal'
  | 'location'
  | 'work'
  | 'thread'
  | 'conversation'
  | 'general';

export type RecallResult = {
  intent: RecallIntent;
  entityName: string | null;
  contextBlock: string;
  confidence: number;
  /** When true, callers must not append raw journal snippets. */
  foundationPrimary: boolean;
};

export async function routeRecallQuery(
  userId: string,
  message: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<RecallResult> {
  const knownEntities = await loadKnownEntities(userId);

  if (CONVERSATION_RECALL_RE.test(message) && conversationHistory.length > 0) {
    const block = await buildConversationSummaryWithRosterFallback(userId, conversationHistory);
    return {
      intent: 'conversation',
      entityName: null,
      contextBlock: block,
      confidence: 0.95,
      foundationPrimary: true,
    };
  }

  if (THREAD_RECALL_RE.test(message) || (THREAD_RE.test(message) && conversationHistory.length > 0)) {
    const thread = await buildThreadRecall(userId, message, { conversationHistory });
    return {
      intent: 'thread',
      entityName: null,
      contextBlock: thread.content,
      confidence: thread.confidence,
      foundationPrimary: true,
    };
  }

  if (CHARACTER_LIST_RE.test(message)) {
    const block = await fetchCharacterListContext(userId);
    return {
      intent: 'character_roster',
      entityName: null,
      contextBlock: block,
      confidence: 0.95,
      foundationPrimary: true,
    };
  }

  if (FAMILY_RECALL_RE.test(message) || FAMILY_KIN_TERM_RE.test(message)) {
    const block = await fetchFamilyContext(userId);
    return {
      intent: 'family',
      entityName: null,
      contextBlock: block,
      confidence: block.includes('No family members') ? 0.4 : 0.95,
      foundationPrimary: true,
    };
  }

  if (BIOGRAPHY_RE.test(message)) {
    const bioBlock = await fetchBiographyContext(userId);
    const block = bioBlock || 'No biography snapshot yet.';
    return {
      intent: 'biography',
      entityName: null,
      contextBlock: block,
      confidence: bioBlock ? 0.95 : 0.4,
      foundationPrimary: true,
    };
  }

  if (LOCATION_RE.test(message)) {
    const block = await fetchFactContext(userId, 'location');
    return {
      intent: 'location',
      entityName: null,
      contextBlock: block || 'Location not recorded.',
      confidence: block ? 0.9 : 0.3,
      foundationPrimary: true,
    };
  }

  if (WORK_RE.test(message)) {
    const block = await fetchFactContext(userId, 'work');
    return {
      intent: 'work',
      entityName: null,
      contextBlock: block || 'Work/career information not recorded.',
      confidence: block ? 0.9 : 0.3,
      foundationPrimary: true,
    };
  }

  const mentionedEntity = await detectMentionedEntityName(message, userId, knownEntities);
  if (mentionedEntity || (WHO_IS_RE.test(message) && matchesEntityQuery(message))) {
    const entityName = mentionedEntity ?? extractEntityNameFromQuery(message);
    if (entityName) {
      const block = await fetchEntityContext(userId, entityName, conversationHistory);
      return {
        intent: 'entity',
        entityName,
        contextBlock: block,
        confidence: block.includes('No character record') ? 0.35 : 0.95,
        foundationPrimary: true,
      };
    }
  }

  if (TEMPORAL_RE.test(message)) {
    const block = await fetchTemporalContext(userId);
    return {
      intent: 'temporal',
      entityName: null,
      contextBlock: block,
      confidence: 0.85,
      foundationPrimary: true,
    };
  }

  const [bioBlock, tempBlock, roster] = await Promise.all([
    fetchBiographyContext(userId),
    fetchTemporalContext(userId),
    fetchCharacterRoster(userId),
  ]);

  const rosterLine =
    roster.length > 0
      ? `## PEOPLE\n${await formatGroupedCharacterRosterForChat(userId, roster)}`
      : '';

  return {
    intent: 'general',
    entityName: null,
    contextBlock: [bioBlock, rosterLine, tempBlock].filter(Boolean).join('\n\n'),
    confidence: 0.6,
    foundationPrimary: false,
  };
}

/**
 * Sprint AF — coverage report for each foundation layer.
 */
export async function buildRecallCoverageReport(userId: string): Promise<
  Array<{ layer: string; stored: boolean; retrievable: boolean; sample: string }>
> {
  const [
    bio,
    roster,
    family,
    rels,
    timeline,
    memories,
  ] = await Promise.all([
    fetchBiographyContext(userId),
    fetchCharacterRoster(userId),
    fetchFamilyMembers(userId),
    supabaseAdmin.from('character_relationships').select('id').eq('user_id', userId).limit(1),
    supabaseAdmin.from('character_timeline_events').select('id').eq('user_id', userId).limit(1),
    supabaseAdmin.from('character_memories').select('id').eq('user_id', userId).limit(1),
  ]);

  return [
    {
      layer: 'biography',
      stored: bio.length > 0,
      retrievable: bio.length > 0,
      sample: bio.slice(0, 80),
    },
    {
      layer: 'characters',
      stored: roster.length > 0,
      retrievable: roster.length > 0,
      sample: roster.map((r) => r.name).join(', '),
    },
    {
      layer: 'relationships',
      stored: (rels.data?.length ?? 0) > 0,
      retrievable: family.length > 0 || (rels.data?.length ?? 0) > 0,
      sample: `${rels.data?.length ?? 0} relationship rows`,
    },
    {
      layer: 'timeline',
      stored: (timeline.data?.length ?? 0) > 0,
      retrievable: (timeline.data?.length ?? 0) > 0,
      sample: `${timeline.data?.length ?? 0} events`,
    },
    {
      layer: 'journal_memories',
      stored: (memories.data?.length ?? 0) > 0,
      retrievable: (memories.data?.length ?? 0) > 0,
      sample: `${memories.data?.length ?? 0} character_memory links`,
    },
  ];
}
