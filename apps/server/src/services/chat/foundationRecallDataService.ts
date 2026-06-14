/**
 * Foundation Recall Data Service — Sprint AF
 *
 * Reads structured lore from foundation tables (not raw journal snippets):
 *   characters → character_memories → character_relationships → character_timeline_events
 *   narrative_accounts (biography_snapshot)
 */

import { supabaseAdmin } from '../supabaseClient';
import { normalizeNameKey } from '../../utils/nameNormalization';

const FAMILY_REL_RE =
  /family|parent|child|sibling|spouse|cousin|mother|father|brother|sister|grand|in-law|partner|wife|husband|grandmother|grandfather|abuela|abuelo|aunt|uncle|niece|nephew/i;

export type CharacterRosterEntry = {
  id: string;
  name: string;
  aliases: string[];
  relationshipToUser: string | null;
  memoryCount: number;
  timelineEventCount: number;
  isSelf: boolean;
};

export type FamilyMemberEntry = CharacterRosterEntry;

export type EntityProfile = {
  characterId: string;
  name: string;
  aliases: string[];
  relationshipToUser: string | null;
  memoryCount: number;
  timelineEvents: Array<{
    title: string;
    type: string;
    date: string | null;
    summary: string | null;
  }>;
  facts: string[];
  romanticSummary: string | null;
};

type CharacterRow = {
  id: string;
  name: string;
  alias: string[] | null;
  metadata: Record<string, unknown> | null;
  importance_level?: string | null;
};

type RelationshipRow = {
  relationship_type: string;
  status: string | null;
  source_character_id: string;
  target_character_id: string;
  metadata: Record<string, unknown> | null;
};

async function loadCharacters(userId: string): Promise<CharacterRow[]> {
  const { data } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias, metadata, importance_level')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return (data ?? []) as CharacterRow[];
}

function findSelfCharacter(chars: CharacterRow[]): CharacterRow | null {
  return (
    chars.find(
      (c) =>
        c.metadata?.is_self === true ||
        c.importance_level === 'protagonist' ||
        /^you$/i.test(c.name)
    ) ?? null
  );
}

async function loadMemoryCounts(userId: string): Promise<Map<string, number>> {
  const { data } = await supabaseAdmin
    .from('character_memories')
    .select('character_id')
    .eq('user_id', userId);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.character_id, (counts.get(row.character_id) ?? 0) + 1);
  }
  return counts;
}

async function loadTimelineCounts(userId: string): Promise<Map<string, number>> {
  const { data } = await supabaseAdmin
    .from('character_timeline_events')
    .select('character_id')
    .eq('user_id', userId);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.character_id, (counts.get(row.character_id) ?? 0) + 1);
  }
  return counts;
}

async function loadRelationships(userId: string): Promise<RelationshipRow[]> {
  const { data } = await supabaseAdmin
    .from('character_relationships')
    .select('relationship_type, status, source_character_id, target_character_id, metadata')
    .eq('user_id', userId);
  return (data ?? []) as RelationshipRow[];
}

function relationshipLabelForCharacter(
  charId: string,
  selfId: string | null,
  rels: RelationshipRow[]
): string | null {
  if (!selfId) return null;

  for (const rel of rels) {
    const involves =
      (rel.source_character_id === charId && rel.target_character_id === selfId) ||
      (rel.source_character_id === selfId && rel.target_character_id === charId);
    if (involves) {
      const status = rel.status ? ` (${rel.status})` : '';
      return `${rel.relationship_type}${status}`;
    }
  }

  // Any family-type relationship involving this character
  for (const rel of rels) {
    if (
      (rel.source_character_id === charId || rel.target_character_id === charId) &&
      FAMILY_REL_RE.test(rel.relationship_type)
    ) {
      return rel.relationship_type;
    }
  }

  return null;
}

function toRosterEntry(
  char: CharacterRow,
  self: CharacterRow | null,
  memoryCounts: Map<string, number>,
  timelineCounts: Map<string, number>,
  rels: RelationshipRow[]
): CharacterRosterEntry {
  const meta = char.metadata ?? {};
  const memoryCount =
    memoryCounts.get(char.id) ??
    (typeof meta.mention_count === 'number' ? meta.mention_count : 0);
  const timelineEventCount = timelineCounts.get(char.id) ?? 0;
  const isSelf =
    char.metadata?.is_self === true ||
    char.importance_level === 'protagonist' ||
    /^you$/i.test(char.name) ||
    char.id === self?.id;

  return {
    id: char.id,
    name: char.name,
    aliases: char.alias ?? [],
    relationshipToUser: isSelf ? 'protagonist (you)' : relationshipLabelForCharacter(char.id, self?.id ?? null, rels),
    memoryCount,
    timelineEventCount,
    isSelf,
  };
}

/**
 * Full character roster with evidence counts from foundation tables.
 */
export async function fetchCharacterRoster(userId: string): Promise<CharacterRosterEntry[]> {
  const [chars, memoryCounts, timelineCounts, rels] = await Promise.all([
    loadCharacters(userId),
    loadMemoryCounts(userId),
    loadTimelineCounts(userId),
    loadRelationships(userId),
  ]);

  const self = findSelfCharacter(chars);
  return chars.map((c) => toRosterEntry(c, self, memoryCounts, timelineCounts, rels));
}

/**
 * Family members derived from character_relationships before journal fallback.
 */
export async function fetchFamilyMembers(userId: string): Promise<FamilyMemberEntry[]> {
  const roster = await fetchCharacterRoster(userId);
  const rels = await loadRelationships(userId);
  const self = findSelfCharacter(await loadCharacters(userId));

  const familyCharIds = new Set<string>();
  for (const rel of rels) {
    if (!FAMILY_REL_RE.test(rel.relationship_type)) continue;
    familyCharIds.add(rel.source_character_id);
    familyCharIds.add(rel.target_character_id);
  }
  if (self) familyCharIds.delete(self.id);

  return roster.filter((entry) => !entry.isSelf && familyCharIds.has(entry.id));
}

/**
 * Resolve a character by name or alias from the characters table.
 */
export async function resolveCharacterByName(
  userId: string,
  name: string
): Promise<CharacterRow | null> {
  const lower = normalizeNameKey(name);
  const chars = await loadCharacters(userId);

  const exact =
    chars.find(
      (c) =>
        normalizeNameKey(c.name) === lower ||
        (c.alias ?? []).some((a) => normalizeNameKey(a) === lower)
    ) ?? null;
  if (exact) return exact;

  if (lower.length >= 3) {
    const partial = chars.find((c) => {
      const cn = normalizeNameKey(c.name);
      return cn.includes(lower) || lower.includes(cn);
    });
    if (partial) return partial;

    const tokens = lower.split(' ').filter(Boolean);
    if (tokens.length >= 2) {
      const byTokens = chars.find((c) => {
        const cn = normalizeNameKey(c.name);
        return tokens.every((t) => cn.includes(t));
      });
      if (byTokens) return byTokens;
    }
  }

  return null;
}

/**
 * Entity profile from foundation tables (relationships + timeline, not journal snippets).
 */
export async function fetchEntityProfile(userId: string, entityName: string): Promise<EntityProfile | null> {
  const char = await resolveCharacterByName(userId, entityName);
  if (!char) return null;

  const [memoryCounts, rels, selfChars] = await Promise.all([
    loadMemoryCounts(userId),
    loadRelationships(userId),
    loadCharacters(userId),
  ]);
  const self = findSelfCharacter(selfChars);

  const [{ data: events }, { data: facts }, { data: romantic }] = await Promise.all([
    supabaseAdmin
      .from('character_timeline_events')
      .select('event_title, event_type, event_date, event_summary')
      .eq('user_id', userId)
      .eq('character_id', char.id)
      .order('event_date', { ascending: true })
      .limit(8),
    supabaseAdmin
      .from('entity_facts')
      .select('fact, confidence')
      .eq('user_id', userId)
      .eq('entity_type', 'character')
      .eq('entity_id', char.id)
      .eq('status', 'active')
      .order('confidence', { ascending: false })
      .limit(8),
    supabaseAdmin
      .from('romantic_relationships')
      .select('relationship_type, status, start_date, end_date, is_current, metadata')
      .eq('user_id', userId)
      .eq('person_id', char.id)
      .eq('person_type', 'character')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let romanticSummary: string | null = null;
  if (romantic?.relationship_type) {
    const type = String(romantic.relationship_type).replace(/_/g, ' ');
    const status = romantic.status ? ` (${romantic.status})` : '';
    romanticSummary = `${type}${status}`;
    const meta = romantic.metadata as Record<string, unknown> | null;
    const note = typeof meta?.summary === 'string' ? meta.summary : null;
    if (note) romanticSummary += ` — ${note}`;
  }

  return {
    characterId: char.id,
    name: char.name,
    aliases: char.alias ?? [],
    relationshipToUser: relationshipLabelForCharacter(char.id, self?.id ?? null, rels),
    memoryCount: memoryCounts.get(char.id) ?? 0,
    timelineEvents: (events ?? []).map((ev) => ({
      title: ev.event_title,
      type: ev.event_type,
      date: ev.event_date,
      summary: ev.event_summary,
    })),
    facts: (facts ?? []).map((f) => f.fact as string),
    romanticSummary,
  };
}

export function formatCharacterRosterForChat(roster: CharacterRosterEntry[]): string {
  if (roster.length === 0) return 'No characters recorded yet.';

  const lines = [`Here are the people in your story (${roster.length}):`, ''];
  for (const entry of roster) {
    const rel = entry.relationshipToUser ? ` — ${entry.relationshipToUser}` : '';
    lines.push(
      `• ${entry.name}${rel} — ${entry.memoryCount} ${entry.memoryCount === 1 ? 'memory' : 'memories'} — ${entry.timelineEventCount} timeline ${entry.timelineEventCount === 1 ? 'event' : 'events'}`
    );
  }
  return lines.join('\n');
}

export function formatFamilyRosterForChat(
  members: FamilyMemberEntry[],
  biographyBlock?: string
): string {
  const parts: string[] = [];

  if (biographyBlock?.trim()) {
    parts.push('What I know about you:', '', biographyBlock.replace(/^## BIOGRAPHY\s*/i, '').trim());
  }

  if (members.length === 0) {
    parts.push(parts.length ? '' : '', 'No family members recorded yet in character relationships.');
    return parts.filter(Boolean).join('\n');
  }

  parts.push('', `Family members (${members.length}):`, '');
  for (const m of members) {
    const rel = m.relationshipToUser ? ` — ${m.relationshipToUser}` : '';
    parts.push(
      `• ${m.name}${rel} — ${m.memoryCount} ${m.memoryCount === 1 ? 'memory' : 'memories'} — ${m.timelineEventCount} timeline ${m.timelineEventCount === 1 ? 'event' : 'events'}`
    );
  }
  return parts.join('\n');
}

export function formatEntityProfileForChat(profile: EntityProfile): string {
  const lines: string[] = [`**${profile.name}**`];
  if (profile.aliases.length) lines.push(`Also known as: ${profile.aliases.join(', ')}`);
  if (profile.relationshipToUser) lines.push(`Relationship: ${profile.relationshipToUser}`);
  if (profile.romanticSummary) lines.push(`Romantic: ${profile.romanticSummary}`);
  lines.push(
    `${profile.memoryCount} linked ${profile.memoryCount === 1 ? 'memory' : 'memories'} across your story`
  );

  if (profile.facts.length) {
    lines.push('', 'What I know:');
    for (const fact of profile.facts.slice(0, 6)) {
      lines.push(`• ${fact}`);
    }
  }

  if (profile.timelineEvents.length) {
    lines.push('', 'Timeline:');
    for (const ev of profile.timelineEvents) {
      const date = ev.date ? new Date(ev.date).toLocaleDateString() : 'Unknown date';
      lines.push(`• ${date}: ${ev.title} [${ev.type}]`);
      if (ev.summary) lines.push(`  ${ev.summary.slice(0, 150)}`);
    }
  }

  return lines.join('\n');
}
