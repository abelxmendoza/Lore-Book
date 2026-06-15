/**
 * Foundation Recall Data Service — Sprint AF
 *
 * Reads structured lore from foundation tables (not raw journal snippets):
 *   characters → character_memories → character_relationships → character_timeline_events
 *   narrative_accounts (biography_snapshot)
 */

import { supabaseAdmin } from '../supabaseClient';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { formatFactsAndMeaning } from './significanceRecall';

const FAMILY_REL_RE =
  /family|parent|child|sibling|spouse|cousin|mother|father|brother|sister|grand|in-law|partner|wife|husband|grandmother|grandfather|abuela|abuelo|aunt|uncle|niece|nephew/i;

const PROFESSIONAL_REL_RE =
  /work|colleague|boss|manager|coworker|employer|client|professional|mentor|supervisor|teammate|employee|staff/i;

const ROMANTIC_REL_RE =
  /romantic|crush|dating|boyfriend|girlfriend|wife|husband|situationship|hookup|lover|ex\b|situationship|one.night/i;

type RosterCategory = 'Family' | 'Romantic' | 'Professional' | 'Scene';

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

async function loadRomanticCharacterIds(userId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from('romantic_relationships')
    .select('person_id')
    .eq('user_id', userId)
    .eq('person_type', 'character');

  return new Set((data ?? []).map((row) => row.person_id as string));
}

function categorizeRosterEntry(
  entry: CharacterRosterEntry,
  romanticIds: Set<string>
): RosterCategory {
  const rel = (entry.relationshipToUser ?? '').toLowerCase();
  if (romanticIds.has(entry.id) || ROMANTIC_REL_RE.test(rel)) return 'Romantic';
  if (FAMILY_REL_RE.test(rel)) return 'Family';
  if (PROFESSIONAL_REL_RE.test(rel)) return 'Professional';
  return 'Scene';
}

function formatRosterMemberLines(entry: CharacterRosterEntry): string {
  const bullets: string[] = [];
  if (entry.relationshipToUser) bullets.push(entry.relationshipToUser);
  if (entry.memoryCount > 0) {
    bullets.push(
      `Appears in ${entry.memoryCount} ${entry.memoryCount === 1 ? 'memory' : 'memories'}`
    );
  }
  if (entry.timelineEventCount > 0) {
    bullets.push(
      `${entry.timelineEventCount} timeline ${entry.timelineEventCount === 1 ? 'event' : 'events'}`
    );
  }
  const detail = bullets.length ? `\n  • ${bullets.join('\n  • ')}` : '';
  return `**${entry.name}**${detail}`;
}

/**
 * Sprint AI — grouped character roster (Family / Romantic / Professional / Scene).
 */
export async function formatGroupedCharacterRosterForChat(
  userId: string,
  roster?: CharacterRosterEntry[]
): Promise<string> {
  const entries = roster ?? (await fetchCharacterRoster(userId));
  const people = entries.filter((e) => !e.isSelf);
  if (people.length === 0) return 'No characters recorded yet.';

  const romanticIds = await loadRomanticCharacterIds(userId);
  const groups: Record<RosterCategory, CharacterRosterEntry[]> = {
    Family: [],
    Romantic: [],
    Professional: [],
    Scene: [],
  };

  for (const entry of people) {
    groups[categorizeRosterEntry(entry, romanticIds)].push(entry);
  }

  const lines = [`**Characters in your story (${people.length})**`, ''];
  const order: RosterCategory[] = ['Family', 'Romantic', 'Professional', 'Scene'];

  for (const category of order) {
    const members = groups[category];
    if (!members.length) continue;
    lines.push(`**${category}**`, '');
    for (const entry of members) {
      lines.push(formatRosterMemberLines(entry));
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

/**
 * Sprint AI — family relationship graph from character_relationships.
 */
export async function formatFamilyTreeForChat(userId: string): Promise<string | null> {
  const [members, rels, chars] = await Promise.all([
    fetchFamilyMembers(userId),
    loadRelationships(userId),
    loadCharacters(userId),
  ]);

  if (members.length === 0) return null;

  const self = findSelfCharacter(chars);
  const idToName = new Map(chars.map((c) => [c.id, c.name]));
  const familyIds = new Set(members.map((m) => m.id));
  if (self) familyIds.add(self.id);

  const roots = members.filter(
    (m) =>
      /grand|abuela|abuelo|grandmother|grandfather/i.test(m.name) ||
      /grand|abuela|abuelo|mother|father/i.test(m.relationshipToUser ?? '')
  );

  const linkedNames = new Set<string>();
  const lines = ['**Family structure**', ''];

  const appendMemberLine = (name: string, note: string, prefix: '├──' | '└──') => {
    lines.push(`${prefix} ${name}${note}`);
  };

  if (roots.length > 0) {
    for (const root of roots.slice(0, 2)) {
      lines.push(`**${root.name}**`);

      for (const rel of rels) {
        if (!FAMILY_REL_RE.test(rel.relationship_type)) continue;
        const involvesRoot =
          rel.source_character_id === root.id || rel.target_character_id === root.id;
        if (!involvesRoot) continue;

        const otherId =
          rel.source_character_id === root.id
            ? rel.target_character_id
            : rel.source_character_id;
        if (self && otherId === self.id) continue;

        const otherName = idToName.get(otherId);
        if (!otherName || linkedNames.has(otherName)) continue;
        linkedNames.add(otherName);

        const member = members.find((m) => m.id === otherId);
        const note = member?.relationshipToUser
          ? ` (${member.relationshipToUser})`
          : ` (${rel.relationship_type.replace(/_/g, ' ')})`;
        appendMemberLine(otherName, note, '├──');
      }

      for (const member of members) {
        if (member.id === root.id || linkedNames.has(member.name)) continue;
        appendMemberLine(
          member.name,
          member.relationshipToUser ? ` (${member.relationshipToUser})` : '',
          '├──'
        );
        linkedNames.add(member.name);
      }

      appendMemberLine('You', '', '└──');
      lines.push('');
    }
  } else {
    for (const member of members) {
      appendMemberLine(
        member.name,
        member.relationshipToUser ? ` (${member.relationshipToUser})` : '',
        '├──'
      );
    }
    appendMemberLine('You', '', '└──');
  }

  return lines.join('\n');
}

export function formatCharacterRosterForChat(roster: CharacterRosterEntry[]): string {
  if (roster.length === 0) return 'No characters recorded yet.';

  const people = roster.filter((e) => !e.isSelf);
  const lines = [`**Characters in your story (${people.length})**`, ''];

  for (const entry of people) {
    const bullets: string[] = [];
    if (entry.relationshipToUser) bullets.push(entry.relationshipToUser);
    if (entry.memoryCount > 0) {
      bullets.push(`appears in ${entry.memoryCount} ${entry.memoryCount === 1 ? 'memory' : 'memories'}`);
    }
    if (entry.timelineEventCount > 0) {
      bullets.push(`${entry.timelineEventCount} timeline ${entry.timelineEventCount === 1 ? 'event' : 'events'}`);
    }
    const detail = bullets.length ? `\n  • ${bullets.join('\n  • ')}` : '';
    lines.push(`**${entry.name}**${detail}`);
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

  parts.push('', `**Family (${members.length})**`, '');
  for (const m of members) {
    const bullets: string[] = [];
    if (m.relationshipToUser) bullets.push(m.relationshipToUser);
    if (m.memoryCount > 0) {
      bullets.push(`appears in ${m.memoryCount} ${m.memoryCount === 1 ? 'memory' : 'memories'}`);
    }
    if (m.timelineEventCount > 0) {
      bullets.push(`${m.timelineEventCount} timeline ${m.timelineEventCount === 1 ? 'event' : 'events'}`);
    }
    const detail = bullets.length ? `\n  • ${bullets.join('\n  • ')}` : '';
    parts.push(`**${m.name}**${detail}`);
  }
  return parts.join('\n');
}

export function formatEntityProfileForChat(
  profile: EntityProfile,
  options?: { threadText?: string }
): string {
  const lines: string[] = [`**${profile.name}**`];
  if (profile.aliases.length) lines.push(`Also known as: ${profile.aliases.join(', ')}`);
  if (profile.relationshipToUser) lines.push(`Relationship: ${profile.relationshipToUser}`);
  if (profile.romanticSummary) lines.push(`Romantic: ${profile.romanticSummary}`);
  lines.push(
    `${profile.memoryCount} linked ${profile.memoryCount === 1 ? 'memory' : 'memories'} across your story`
  );

  const factStrings =
    profile.facts.length > 0
      ? profile.facts
      : profile.timelineEvents.map((ev) => {
          const date = ev.date ? new Date(ev.date).toLocaleDateString() : '';
          return date ? `${date}: ${ev.title}` : ev.title;
        });

  const { factsBlock, meaningBlock } = formatFactsAndMeaning(
    factStrings,
    options?.threadText
  );

  lines.push('', '**Facts:**', factsBlock);

  if (meaningBlock) {
    lines.push('', '**Meaning:**', meaningBlock);
  }

  if (profile.timelineEvents.length && profile.facts.length > 0) {
    lines.push('', '**Timeline:**');
    for (const ev of profile.timelineEvents) {
      const date = ev.date ? new Date(ev.date).toLocaleDateString() : 'Unknown date';
      lines.push(`• ${date}: ${ev.title} [${ev.type}]`);
      if (ev.summary) lines.push(`  ${ev.summary.slice(0, 150)}`);
    }
  }

  if (profile.memoryCount === 0 && profile.facts.length === 0 && profile.timelineEvents.length === 0) {
    lines.push('', '_Not yet created in structured memory — mention them again to build the record._');
  }

  return lines.join('\n');
}
