/**
 * Assemble character sections into Working Memory text for closed-scope /
 * "tell me about X" chat turns — same Character Query contract as the modal.
 */
import {
  getCharacterQuery,
  type CharacterQuery,
  type CharacterQuerySection,
} from './characterQueryService';

export type CharacterWorkingMemoryIntent =
  | 'who_is'
  | 'everything'
  | 'relationship'
  | 'timeline'
  | 'brief';

const INTENT_SECTIONS: Record<CharacterWorkingMemoryIntent, CharacterQuerySection[]> = {
  brief: ['identity', 'attributes', 'lore'],
  who_is: ['identity', 'attributes', 'lore', 'knowledge', 'organizations'],
  relationship: ['identity', 'knowledge', 'dynamics', 'lore'],
  timeline: ['identity', 'timelines', 'memories', 'knowledge'],
  everything: [
    'identity',
    'attributes',
    'lore',
    'knowledge',
    'organizations',
    'memories',
    'timelines',
    'dynamics',
  ],
};

export type CharacterWorkingMemoryBlock = {
  characterId: string;
  characterName: string;
  intent: CharacterWorkingMemoryIntent;
  text: string;
  sectionKeys: string[];
  generatedAt: string;
  query: CharacterQuery;
};

function line(label: string, value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return `${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`;
}

function formatQueryAsWorkingMemory(
  query: CharacterQuery,
  intent: CharacterWorkingMemoryIntent,
): string {
  const s = query.sections;
  const identity = s.identity;
  const name = identity?.name ?? 'Unknown';
  const parts: string[] = [`# Character: ${name}`, `Intent: ${intent}`];

  if (identity) {
    parts.push('## Identity');
    for (const row of [
      line('Role', identity.role),
      line('Archetype', identity.archetype),
      line('Summary', identity.summary),
      line('Relationship to you', identity.metadata?.relationship_to_user),
      line('Kinship', identity.metadata?.kinship_label),
      line('Aliases', (identity.alias ?? []).join(', ') || null),
    ]) {
      if (row) parts.push(row);
    }
    const topRels = (identity.relationships ?? []).slice(0, 8);
    if (topRels.length) {
      parts.push('Key people:');
      for (const rel of topRels) {
        parts.push(
          `- ${rel.character_name} (${String(rel.relationship_type).replace(/_/g, ' ')})`,
        );
      }
    }
  }

  if (s.attributes?.current?.length) {
    parts.push('## Attributes');
    for (const attr of s.attributes.current.slice(0, 20)) {
      const type = String(attr.attributeType ?? attr.attribute_type ?? '');
      const value = String(attr.attributeValue ?? attr.attribute_value ?? '');
      if (type && value) parts.push(`- ${type}: ${value}`);
    }
  }

  if (s.lore) {
    parts.push('## Lore');
    const skills = (s.lore.skills ?? []).map((x) => x.label).filter(Boolean);
    const hobbies = (s.lore.hobbies ?? []).map((x) => x.label).filter(Boolean);
    const groups = (s.lore.groups ?? []).map((x) => x.label ?? x.name).filter(Boolean);
    if (skills.length) parts.push(`Skills: ${skills.join(', ')}`);
    if (hobbies.length) parts.push(`Hobbies: ${hobbies.join(', ')}`);
    if (groups.length) parts.push(`Groups: ${groups.join(', ')}`);
  }

  if (s.knowledge) {
    parts.push('## Knowledge');
    if (s.knowledge.profile?.relationshipToUser) {
      parts.push(`Relationship to you: ${s.knowledge.profile.relationshipToUser}`);
    }
    for (const fact of (s.knowledge.facts ?? []).slice(0, 12)) {
      const text = typeof fact.fact === 'string' ? fact.fact : '';
      if (text) parts.push(`- ${text}`);
    }
    for (const claim of (s.knowledge.knowledgeClaims ?? []).slice(0, 8)) {
      if (claim.human_readable_claim) parts.push(`- ${claim.human_readable_claim}`);
    }
  }

  if (s.organizations?.length) {
    parts.push('## Organizations');
    for (const org of s.organizations.slice(0, 10)) {
      const orgName = String(org.name ?? org.organization_name ?? 'Group');
      const role = org.role ? ` (${String(org.role)})` : '';
      parts.push(`- ${orgName}${role}`);
    }
  }

  if (s.memories?.length) {
    parts.push('## Memories');
    for (const mem of s.memories.slice(0, 8)) {
      const summary = mem.summary || mem.title || mem.content?.slice(0, 160);
      if (summary) parts.push(`- [${mem.date}] ${summary}`);
    }
  }

  if (s.timelines) {
    parts.push('## Timelines');
    parts.push(
      `Shared experiences: ${s.timelines.summary?.sharedCount ?? s.timelines.sharedExperiences.length}; Lore events: ${s.timelines.summary?.loreCount ?? s.timelines.lore.length}`,
    );
    for (const ev of (s.timelines.summary?.recent ?? []).slice(0, 8)) {
      const title = String(ev.eventTitle ?? ev.title ?? 'Event');
      const date = String(ev.eventDate ?? ev.date ?? '');
      parts.push(`- ${date}: ${title}`);
    }
  }

  if (s.dynamics && (s.dynamics as { dynamics?: unknown }).dynamics) {
    parts.push('## Dynamics');
    parts.push(JSON.stringify((s.dynamics as { dynamics: unknown }).dynamics).slice(0, 800));
  }

  if (query.partialErrors && Object.keys(query.partialErrors).length > 0) {
    parts.push('## Partial errors');
    for (const [k, v] of Object.entries(query.partialErrors)) {
      parts.push(`- ${k}: ${v}`);
    }
  }

  return parts.join('\n');
}

export async function assembleCharacterWorkingMemory(
  userId: string,
  characterId: string,
  intent: CharacterWorkingMemoryIntent = 'who_is',
): Promise<CharacterWorkingMemoryBlock | null> {
  const sections = INTENT_SECTIONS[intent] ?? INTENT_SECTIONS.who_is;
  const query = await getCharacterQuery(userId, characterId, {
    sections: sections.join(','),
  });
  if (!query) return null;

  const characterName = query.sections.identity?.name ?? 'Unknown';
  return {
    characterId,
    characterName,
    intent,
    text: formatQueryAsWorkingMemory(query, intent),
    sectionKeys: Object.keys(query.sections),
    generatedAt: query.generatedAt,
    query,
  };
}
