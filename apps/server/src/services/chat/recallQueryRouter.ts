/**
 * Recall Query Router — Sprint G
 *
 * Routes incoming user queries to the appropriate foundation data layer
 * and returns a structured recall context block for injection into the
 * system prompt.
 *
 * Intent types:
 *   biography  — "What do you know about me?" "Who am I?"
 *   entity     — "What happened with Sol?" "Tell me about Abuela."
 *   temporal   — "What was I doing recently?" "What happened lately?"
 *   fact       — "Where do I live?" "What am I working on?"
 *   thread     — "What were we talking about?" "Earlier in this conversation"
 *
 * Uses foundation data from Sprints B–F:
 *   characters → character_relationships → character_timeline_events
 *   narrative_accounts (biography_snapshot)
 *   people_places (entity lookup)
 *   journal_entries (recent temporal recall)
 */

import { supabaseAdmin } from '../supabaseClient';

// ── Intent patterns ───────────────────────────────────────────────────────────

const BIOGRAPHY_RE = /\b(what do you know about me|who am i|what.s my story|tell me about myself|what have you learned|my biography|my life story|what do you remember about me)\b/i;
const TEMPORAL_RE  = /\b(recently|lately|what.*(was|were|have) i (doing|up to|working|building)|what happened (lately|recently|this week|today)|just (did|told you|mentioned)|what.*(last|past) (few|couple|week|month))\b/i;
const THREAD_RE    = /\b(earlier|this conversation|what we (discussed|talked|were talking)|remember what i (said|told)|in this (chat|thread))\b/i;
const LOCATION_RE  = /\b(where (do|did) i live|where.s my (home|house|place)|where am i from|my (address|location|city|neighborhood))\b/i;
const WORK_RE      = /\b(what am i working on|what.s my (job|work|project|career)|am i (employed|working)|what do i do (for work|for a living))\b/i;

// ── Known entity name list (populated from people_places at runtime) ──────────

async function loadKnownEntities(userId: string): Promise<Map<string, { id: string; type: string }>> {
  const { data } = await supabaseAdmin
    .from('people_places')
    .select('id, name, type, corrected_names')
    .eq('user_id', userId);

  const map = new Map<string, { id: string; type: string }>();
  for (const entity of data ?? []) {
    map.set(entity.name.toLowerCase(), { id: entity.id, type: entity.type });
    for (const alias of entity.corrected_names ?? []) {
      map.set(alias.toLowerCase(), { id: entity.id, type: entity.type });
    }
  }
  return map;
}

function detectMentionedEntityName(message: string, knownEntities: Map<string, { id: string; type: string }>): string | null {
  const lower = message.toLowerCase();
  // Check longest names first to avoid partial matches
  const sorted = [...knownEntities.keys()].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (name.length >= 3 && lower.includes(name)) return name;
  }
  return null;
}

// ── Recall data fetchers ──────────────────────────────────────────────────────

async function fetchBiographyContext(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('narrative_accounts')
    .select('narrative_text, metadata, recorded_at')
    .eq('user_id', userId)
    .eq('account_type', 'biography_snapshot')
    .single();

  if (!data) return '';

  const meta = data.metadata as any;
  const themes: string[] = (meta.themes ?? []).map((t: any) => t.theme);
  const period = (meta.periods ?? [])[0]?.label ?? null;

  return [
    '## BIOGRAPHY',
    data.narrative_text,
    themes.length ? `\n**Current themes:** ${themes.join(', ')}` : '',
    period ? `**Current life period:** ${period}` : '',
  ].filter(Boolean).join('\n');
}

async function fetchEntityContext(userId: string, entityName: string): Promise<string> {
  const lower = entityName.toLowerCase();

  // 1. Find the character record
  const { data: chars } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias, metadata')
    .eq('user_id', userId);

  const char = (chars ?? []).find(c =>
    c.name.toLowerCase() === lower ||
    (c.alias ?? []).some((a: string) => a.toLowerCase() === lower)
  );

  if (!char) return `No character record found for "${entityName}".`;

  const lines: string[] = [`## ${char.name.toUpperCase()}`];
  const meta = char.metadata as any;
  if (meta?.mention_count) lines.push(`Mentioned ${meta.mention_count} times across ${meta.source_memory_count} memories.`);
  if (char.alias?.length) lines.push(`Also known as: ${char.alias.join(', ')}`);

  // 2. Find relationship with protagonist
  const { data: rels } = await supabaseAdmin
    .from('character_relationships')
    .select('relationship_type, status, metadata')
    .eq('user_id', userId)
    .or(`source_character_id.eq.${char.id},target_character_id.eq.${char.id}`);

  for (const rel of rels ?? []) {
    const memCount = (rel.metadata as any)?.co_mention_count ?? 0;
    lines.push(`**Relationship:** ${rel.relationship_type} (${rel.status}) — shared in ${memCount} memories`);
  }

  // 3. Pull timeline events for this character
  const { data: events } = await supabaseAdmin
    .from('character_timeline_events')
    .select('event_title, event_type, event_date, event_summary, emotional_impact, confidence')
    .eq('user_id', userId)
    .eq('character_id', char.id)
    .order('event_date', { ascending: true })
    .limit(5);

  if (events?.length) {
    lines.push('\n**Timeline events:**');
    for (const ev of events) {
      const date = ev.event_date ? new Date(ev.event_date).toDateString() : 'Unknown date';
      lines.push(`• ${date}: ${ev.event_title} [${ev.event_type}]`);
      if (ev.event_summary) lines.push(`  ${ev.event_summary.slice(0, 150)}`);
    }
  }

  // 4. Pull relevant journal entries
  const sourceEntryIds: string[] = meta?.source_entry_ids ?? [];
  if (sourceEntryIds.length) {
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('content, date, mood')
      .in('id', sourceEntryIds.slice(0, 3))
      .order('date', { ascending: false });

    if (entries?.length) {
      lines.push('\n**From journal:**');
      for (const e of entries) {
        lines.push(`• ${e.content.slice(0, 400)}`);
      }
    }
  }

  return lines.join('\n');
}

async function fetchTemporalContext(userId: string): Promise<string> {
  // Most recent timeline events
  const { data: events } = await supabaseAdmin
    .from('character_timeline_events')
    .select('event_title, event_type, event_date, event_summary')
    .eq('user_id', userId)
    .order('event_date', { ascending: false })
    .limit(5);

  // Most recent journal entries
  const { data: entries } = await supabaseAdmin
    .from('journal_entries')
    .select('content, date, mood, summary')
    .eq('user_id', userId)
    .not('metadata->>extractionMethod', 'is', null)
    .order('date', { ascending: false })
    .limit(5);

  const lines: string[] = ['## RECENT ACTIVITY'];

  if (events?.length) {
    lines.push('**Recent timeline events:**');
    for (const ev of events) {
      const date = ev.event_date ? new Date(ev.event_date).toDateString() : '';
      lines.push(`• ${date}: ${ev.event_title} [${ev.event_type}]`);
      if (ev.event_summary) lines.push(`  ${ev.event_summary.slice(0, 150)}`);
    }
  }

  if (entries?.length) {
    lines.push('\n**Recent memories:**');
    for (const e of entries) {
      const label = e.summary ?? e.content.slice(0, 100);
      lines.push(`• ${label}`);
    }
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

  const facts = (data.metadata as any)?.facts;
  if (!facts) return '';

  if (factType === 'location') {
    const loc = facts.identity?.location;
    const living = facts.livingSituation;
    return loc
      ? `Location: ${loc}.${living ? `\nLiving situation: ${living.slice(0, 200)}` : ''}`
      : 'Location not yet recorded.';
  }

  if (factType === 'work') {
    const employment = facts.identity?.employment;
    const upcoming = facts.upcomingEvents ?? [];
    const events = (facts.keyEvents ?? []).filter((e: any) => e.eventType === 'career_event');
    return [
      employment ? `Employment: ${employment}` : '',
      upcoming.length ? `Upcoming: ${upcoming.join('; ')}` : '',
      events.length ? `Career events: ${events.map((e: any) => e.title).join('; ')}` : '',
    ].filter(Boolean).join('\n');
  }

  return '';
}

// ── Public router ─────────────────────────────────────────────────────────────

export type RecallIntent =
  | 'biography'
  | 'entity'
  | 'temporal'
  | 'location'
  | 'work'
  | 'thread'
  | 'general';

export type RecallResult = {
  intent: RecallIntent;
  entityName: string | null;
  contextBlock: string;
  confidence: number;
};

/**
 * Route a user message to the appropriate recall data layer.
 * Returns a formatted context block ready for injection into the system prompt.
 */
export async function routeRecallQuery(
  userId: string,
  message: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<RecallResult> {
  const knownEntities = await loadKnownEntities(userId);

  // ── Thread recall (check conversation history first) ────────────────────────
  if (THREAD_RE.test(message) && conversationHistory.length > 0) {
    const recent = conversationHistory
      .slice(-6)
      .map(m => `${m.role}: ${m.content.slice(0, 100)}`)
      .join('\n');
    return {
      intent: 'thread',
      entityName: null,
      contextBlock: `## CURRENT THREAD CONTEXT\n${recent}`,
      confidence: 0.9,
    };
  }

  // ── Biography recall ─────────────────────────────────────────────────────────
  if (BIOGRAPHY_RE.test(message)) {
    const block = await fetchBiographyContext(userId);
    return {
      intent: 'biography',
      entityName: null,
      contextBlock: block || 'No biography data available yet.',
      confidence: block ? 0.95 : 0.3,
    };
  }

  // ── Fact: location ───────────────────────────────────────────────────────────
  if (LOCATION_RE.test(message)) {
    const block = await fetchFactContext(userId, 'location');
    return {
      intent: 'location',
      entityName: null,
      contextBlock: block || 'Location not recorded.',
      confidence: block ? 0.9 : 0.3,
    };
  }

  // ── Fact: work/career ────────────────────────────────────────────────────────
  if (WORK_RE.test(message)) {
    const block = await fetchFactContext(userId, 'work');
    return {
      intent: 'work',
      entityName: null,
      contextBlock: block || 'Work/career information not recorded.',
      confidence: block ? 0.9 : 0.3,
    };
  }

  // ── Entity recall ────────────────────────────────────────────────────────────
  const mentionedEntity = detectMentionedEntityName(message, knownEntities);
  if (mentionedEntity) {
    const block = await fetchEntityContext(userId, mentionedEntity);
    return {
      intent: 'entity',
      entityName: mentionedEntity,
      contextBlock: block,
      confidence: 0.9,
    };
  }

  // ── Temporal recall ──────────────────────────────────────────────────────────
  if (TEMPORAL_RE.test(message)) {
    const block = await fetchTemporalContext(userId);
    return {
      intent: 'temporal',
      entityName: null,
      contextBlock: block,
      confidence: 0.8,
    };
  }

  // ── General: return biography + recent ───────────────────────────────────────
  const [bioBlock, tempBlock] = await Promise.all([
    fetchBiographyContext(userId),
    fetchTemporalContext(userId),
  ]);

  return {
    intent: 'general',
    entityName: null,
    contextBlock: [bioBlock, tempBlock].filter(Boolean).join('\n\n'),
    confidence: 0.6,
  };
}
