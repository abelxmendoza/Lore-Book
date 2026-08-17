/**
 * Aggregates skills, hobbies, interests, group ties, and people associations
 * for a character — only from mention-derived lore (chat, facts, attributes).
 */
import { logger } from '../../logger';
import { entityAttributeDetector } from '../conversationCentered/entityAttributeDetector';
import {
  readCharacterAttributions,
  type CharacterInterestAttribution,
} from '../conversationCentered/interestAttribution';
import { attributionReasonLabel } from '../conversationCentered/interestSubjectResolver';
import { entityFactsService } from '../entityFactsService';
import { listPeripheralsForCharacter } from '../relationshipPeripheralService';
import { organizationService } from '../organizationService';
import { supabaseAdmin } from '../supabaseClient';
import {
  isSelfCharacterMetadata,
  resolveRelatedPersonType,
} from '../relationships/relatedPersonType';

export type CharacterLoreItem = {
  id: string;
  label: string;
  category?: string;
  confidence?: number;
  evidence?: string;
  source: 'chat' | 'inferred' | 'user';
  lastMentionedAt?: string;
  /** Why this chip is on this person (self lore vs their lore vs shared). */
  attributionReason?: string;
  attributionLabel?: string;
  subjectStance?: 'self' | 'other_person' | 'shared' | 'dismissed' | string;
};

export type CharacterPersonAssociation = {
  characterId: string | null;
  name: string;
  relationshipType: string;
  associationKind: 'direct' | 'mentioned' | 'inferred' | 'peripheral';
  hasMet: boolean | null;
  proximityLevel: string | null;
  summary?: string;
  closenessScore?: number;
  evidence?: string;
  domain?: string;
};

export type CharacterGroupAssociation = {
  organizationId: string;
  name: string;
  type?: string;
  role?: string;
  userRelationship?: string;
};

export type CharacterLoreProfile = {
  characterId: string;
  characterName: string;
  generatedAt: string;
  /** self = user's own card; other = someone else's lore as it pertains to the user */
  loreSubject: 'self' | 'other';
  skills: CharacterLoreItem[];
  hobbies: CharacterLoreItem[];
  interests: CharacterLoreItem[];
  /** Interests the user removed from this person — restorable; app will not re-add from chat. */
  removedHobbies: CharacterLoreItem[];
  groups: CharacterGroupAssociation[];
  people: CharacterPersonAssociation[];
  loreSnippets: CharacterLoreItem[];
  mentionOnly: boolean;
};

const HOBBY_CATEGORIES = new Set(['hobby', 'creative', 'physical', 'entertainment', 'social']);

function itemKey(label: string, category?: string): string {
  return `${(category ?? 'general').toLowerCase()}::${label.toLowerCase().trim()}`;
}

function pushUnique(items: CharacterLoreItem[], item: CharacterLoreItem): void {
  const key = itemKey(item.label, item.category);
  if (items.some((i) => itemKey(i.label, i.category) === key)) return;
  items.push(item);
}

export async function compileCharacterLoreProfile(
  userId: string,
  characterId: string,
): Promise<CharacterLoreProfile | null> {
  const { data: character, error } = await supabaseAdmin
    .from('characters')
    .select(
      'id, name, alias, summary, tags, metadata, has_met, proximity_level, relationship_depth, associated_with_character_ids, mentioned_by_character_ids, context_of_mention',
    )
    .eq('user_id', userId)
    .eq('id', characterId)
    .maybeSingle();

  if (error || !character) {
    logger.warn({ error, userId, characterId }, 'characterLoreProfile: character not found');
    return null;
  }

  const skills: CharacterLoreItem[] = [];
  const hobbies: CharacterLoreItem[] = [];
  const interests: CharacterLoreItem[] = [];
  const removedHobbies: CharacterLoreItem[] = [];
  const loreSnippets: CharacterLoreItem[] = [];

  const attributes = await entityAttributeDetector.getEntityAttributes(
    userId,
    characterId,
    'character',
    true,
  );

  for (const attr of attributes) {
    const type = String(attr.attributeType ?? '');
    const item: CharacterLoreItem = {
      id: `attr-${type}-${attr.attributeValue}`,
      label: attr.attributeValue,
      category: type,
      confidence: attr.confidence,
      evidence: attr.evidence,
      source: 'chat',
    };
    if (type === 'skill' || type === 'certification') {
      pushUnique(skills, item);
    } else if (type === 'hobby') {
      pushUnique(hobbies, item);
    } else if (type === 'interest') {
      pushUnique(interests, item);
    }
  }

  const { data: linkedInterests } = await supabaseAdmin
    .from('interests')
    .select(
      'id, interest_name, interest_category, interest_level, evidence_quotes, last_mentioned_at, description, metadata',
    )
    .eq('user_id', userId)
    .contains('related_character_ids', [characterId])
    .order('last_mentioned_at', { ascending: false })
    .limit(30);

  for (const row of linkedInterests ?? []) {
    const cat = row.interest_category ?? 'other';
    const attr = readCharacterAttributions(row.metadata as Record<string, unknown> | null)[
      characterId
    ] as CharacterInterestAttribution | undefined;
    const item: CharacterLoreItem = {
      id: row.id,
      label: row.interest_name,
      category: cat,
      confidence: row.interest_level,
      evidence:
        attr?.evidence ||
        row.evidence_quotes?.[0] ||
        row.description ||
        undefined,
      source: 'chat',
      lastMentionedAt: row.last_mentioned_at,
      attributionReason: attr?.reason,
      attributionLabel: attributionReasonLabel(attr?.reason),
      subjectStance: attr?.stance,
    };
    if (HOBBY_CATEGORIES.has(cat) || cat === 'hobby') {
      pushUnique(hobbies, item);
    } else {
      pushUnique(interests, item);
    }
  }

  // Previously dismissed from this person — restorable; blocked from silent re-attach.
  const { data: dismissedInterests } = await supabaseAdmin
    .from('interests')
    .select(
      'id, interest_name, interest_category, interest_level, evidence_quotes, last_mentioned_at, description, metadata, related_character_ids',
    )
    .eq('user_id', userId)
    .contains('metadata', { dismissed_character_ids: [characterId] })
    .order('updated_at', { ascending: false })
    .limit(40);

  for (const row of dismissedInterests ?? []) {
    const related = (row.related_character_ids as string[] | null) ?? [];
    if (related.includes(characterId)) continue; // still active
    const cat = row.interest_category ?? 'other';
    const attr = readCharacterAttributions(row.metadata as Record<string, unknown> | null)[
      characterId
    ] as CharacterInterestAttribution | undefined;
    pushUnique(removedHobbies, {
      id: row.id,
      label: row.interest_name,
      category: cat,
      confidence: row.interest_level,
      evidence: attr?.evidence || row.evidence_quotes?.[0] || row.description || undefined,
      source: 'user',
      lastMentionedAt: row.last_mentioned_at,
      attributionReason: attr?.reason ?? 'user_dismissed',
      attributionLabel: attributionReasonLabel(attr?.reason ?? 'user_dismissed'),
      subjectStance: 'dismissed',
    });
  }

  const meta = (character.metadata ?? {}) as Record<string, unknown>;
  const loreSubject: 'self' | 'other' =
    meta.is_self === true || meta.is_user === true ? 'self' : 'other';
  const metaSkills = meta.skills as Record<string, { level?: number; evidence?: string }> | undefined;
  if (metaSkills && typeof metaSkills === 'object') {
    for (const [name, detail] of Object.entries(metaSkills)) {
      pushUnique(skills, {
        id: `meta-skill-${name}`,
        label: name,
        category: 'skill',
        confidence: typeof detail?.level === 'number' ? detail.level : 0.6,
        evidence: detail?.evidence,
        source: 'inferred',
      });
    }
  }

  const contextHooks = Array.isArray(meta.context_hooks) ? meta.context_hooks : [];
  for (const hook of contextHooks) {
    if (typeof hook === 'string' && hook.trim()) {
      pushUnique(loreSnippets, {
        id: `hook-${hook.slice(0, 24)}`,
        label: hook,
        category: 'context_hook',
        source: 'inferred',
      });
    }
  }

  for (const tag of character.tags ?? []) {
    if (typeof tag === 'string' && tag.trim()) {
      pushUnique(loreSnippets, {
        id: `tag-${tag}`,
        label: tag,
        category: 'tag',
        source: 'user',
      });
    }
  }

  try {
    const facts = await entityFactsService.getEntityFacts(userId, characterId, 'character');
    for (const fact of facts.slice(0, 12)) {
      pushUnique(loreSnippets, {
        id: fact.id,
        label: fact.fact,
        category: fact.category ?? 'fact',
        confidence: fact.confidence,
        source: 'chat',
        lastMentionedAt: fact.last_confirmed_at ?? fact.updated_at,
      });
    }
  } catch (err) {
    logger.debug({ err, characterId }, 'characterLoreProfile: facts skipped');
  }

  const groups: CharacterGroupAssociation[] = [];
  const orgs = await organizationService.getOrganizationsByCharacter(userId, characterId, character.name);
  for (const org of orgs) {
    const member = org.members?.find(
      (m) =>
        m.character_id === characterId ||
        (!!character.name && m.character_name?.toLowerCase() === character.name.toLowerCase()),
    );
    groups.push({
      organizationId: org.id,
      name: org.name,
      type: org.type ?? org.group_type,
      role: member?.role,
      userRelationship: org.user_relationship ?? undefined,
    });
  }

  const { data: charOrgs, error: charOrgErr } = await supabaseAdmin
    .from('character_organizations')
    .select('organization_id, role, organizations(id, name, type)')
    .eq('character_id', characterId);

  if (!charOrgErr) {
    for (const row of charOrgs ?? []) {
      const org = row.organizations as { id: string; name: string; type?: string } | null;
      if (!org) continue;
      if (groups.some((g) => g.organizationId === org.id)) continue;
      groups.push({
        organizationId: org.id,
        name: org.name,
        type: org.type,
        role: row.role ?? undefined,
      });
    }
  }

  const people: CharacterPersonAssociation[] = [];
  const seenPeople = new Set<string>();

  const addPerson = (p: CharacterPersonAssociation) => {
    const key = p.characterId ?? p.name.toLowerCase();
    if (seenPeople.has(key)) return;
    seenPeople.add(key);
    people.push(p);
  };

  const { data: relRows } = await supabaseAdmin
    .from('character_relationships')
    .select('*')
    .eq('user_id', userId)
    .or(`source_character_id.eq.${characterId},target_character_id.eq.${characterId}`);

  const relatedIds = new Set<string>();
  for (const rel of relRows ?? []) {
    const otherId =
      rel.source_character_id === characterId ? rel.target_character_id : rel.source_character_id;
    relatedIds.add(otherId);
  }

  for (const id of [
    ...(character.associated_with_character_ids ?? []),
    ...(character.mentioned_by_character_ids ?? []),
  ]) {
    if (typeof id === 'string' && id !== characterId) relatedIds.add(id);
  }

  for (const org of orgs) {
    const groupType = String(org.group_type ?? org.type ?? '').toLowerCase();
    if (groupType !== 'family' && groupType !== 'household') continue;
    for (const member of org.members ?? []) {
      if (member.character_id && member.character_id !== characterId) {
        relatedIds.add(member.character_id);
      }
    }
  }

  const { data: relatedChars } = relatedIds.size
    ? await supabaseAdmin
        .from('characters')
        .select('id, name, has_met, proximity_level, relationship_depth, context_of_mention, metadata')
        .eq('user_id', userId)
        .in('id', Array.from(relatedIds))
    : { data: [] };

  const charById = new Map(
    (Array.isArray(relatedChars) ? relatedChars : []).map((c) => [c.id, c]),
  );
  const viewerIsSelf = loreSubject === 'self';
  const viewerRelationshipToYou =
    typeof meta.relationship_to_user === 'string' ? meta.relationship_to_user : null;

  let selfId: string | null = viewerIsSelf ? characterId : null;
  if (!selfId) {
    const { data: selfRow } = await supabaseAdmin
      .from('characters')
      .select('id, name, metadata')
      .eq('user_id', userId)
      .contains('metadata', { is_self: true })
      .maybeSingle();
    if (selfRow?.id) selfId = selfRow.id;
  }

  for (const rel of relRows ?? []) {
    const otherId =
      rel.source_character_id === characterId ? rel.target_character_id : rel.source_character_id;
    const other = charById.get(otherId);
    const otherMeta = ((other as { metadata?: Record<string, unknown> } | undefined)?.metadata ?? {}) as Record<string, unknown>;
    const hasMet = other?.has_met ?? null;
    const proximity = other?.proximity_level ?? null;
    addPerson({
      characterId: otherId,
      name: other?.name ?? 'Unknown',
      relationshipType: resolveRelatedPersonType({
        storedType: String(rel.relationship_type ?? ''),
        viewerIsSource: rel.source_character_id === characterId,
        viewerIsSelf,
        otherIsSelf: otherId === selfId || isSelfCharacterMetadata(otherMeta, other?.name),
        viewerRelationshipToYou,
        otherRelationshipToYou:
          typeof otherMeta.relationship_to_user === 'string' ? otherMeta.relationship_to_user : null,
        otherName: other?.name,
      }),
      associationKind: hasMet === false || proximity === 'unmet' || proximity === 'distant' ? 'mentioned' : 'direct',
      hasMet,
      proximityLevel: proximity,
      summary: rel.summary ?? undefined,
      closenessScore: rel.closeness_score ?? undefined,
      evidence: rel.metadata?.evidence as string | undefined,
    });
  }

  for (const org of orgs) {
    const groupType = String(org.group_type ?? org.type ?? '').toLowerCase();
    if (groupType !== 'family' && groupType !== 'household') continue;
    for (const member of org.members ?? []) {
      if (member.status && member.status !== 'active') continue;
      const otherId = member.character_id;
      if (!otherId || otherId === characterId) continue;
      const other = charById.get(otherId);
      const otherMeta = ((other as { metadata?: Record<string, unknown> } | undefined)?.metadata ?? {}) as Record<string, unknown>;
      const role = String(member.role ?? '').trim();
      addPerson({
        characterId: otherId,
        name: member.character_name,
        relationshipType: resolveRelatedPersonType({
          storedType: role && role !== 'member' ? role : 'family',
          viewerIsSource: true,
          viewerIsSelf,
          otherIsSelf: otherId === selfId || isSelfCharacterMetadata(otherMeta, member.character_name),
          viewerRelationshipToYou,
          otherRelationshipToYou:
            typeof otherMeta.relationship_to_user === 'string' ? otherMeta.relationship_to_user : null,
          otherName: member.character_name,
          groupRole: role,
        }),
        associationKind: 'inferred',
        hasMet: other?.has_met ?? null,
        proximityLevel: other?.proximity_level ?? null,
        summary: `Members of the same family group "${org.name}"`,
        domain: 'family',
      });
    }
  }

  for (const otherId of character.associated_with_character_ids ?? []) {
    if (typeof otherId !== 'string' || relRows?.some((r) => r.target_character_id === otherId || r.source_character_id === otherId)) {
      continue;
    }
    const other = charById.get(otherId);
    addPerson({
      characterId: otherId,
      name: other?.name ?? 'Unknown',
      relationshipType: 'associated_in_story',
      associationKind: 'inferred',
      hasMet: other?.has_met ?? null,
      proximityLevel: other?.proximity_level ?? null,
      summary: 'Linked through shared mentions or scene context.',
    });
  }

  for (const otherId of character.mentioned_by_character_ids ?? []) {
    if (typeof otherId !== 'string') continue;
    const other = charById.get(otherId);
    addPerson({
      characterId: otherId,
      name: other?.name ?? 'Unknown',
      relationshipType: 'mentioned_via',
      associationKind: 'mentioned',
      hasMet: other?.has_met ?? null,
      proximityLevel: other?.proximity_level ?? null,
      summary: `Mentioned in connection with ${other?.name ?? 'another person'}.`,
    });
  }

  const peripherals = await listPeripheralsForCharacter(userId, characterId).catch(() => []);

  for (const p of peripherals) {
    if (p.tier === 'dismissed') continue;
    addPerson({
      characterId: p.peripheral_person_id,
      name: p.peripheral_name ?? p.peripheral_surface,
      relationshipType: p.role,
      associationKind: 'peripheral',
      hasMet: p.has_met,
      proximityLevel: p.proximity,
      summary: p.associated_via,
      evidence: p.source_message_ids?.length ? `From ${p.source_message_ids.length} conversation mention(s)` : undefined,
      domain: p.domain,
      closenessScore: Math.round(p.confidence * 10),
    });
  }

  if (character.context_of_mention) {
    pushUnique(loreSnippets, {
      id: 'context-of-mention',
      label: character.context_of_mention,
      category: 'mention_context',
      source: 'chat',
    });
  }

  const mentionOnly =
    character.has_met === false ||
    character.proximity_level === 'unmet' ||
    character.proximity_level === 'distant' ||
    character.relationship_depth === 'mentioned_only';

  return {
    characterId,
    characterName: character.name,
    generatedAt: new Date().toISOString(),
    loreSubject,
    skills: skills.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
    hobbies: hobbies.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
    interests: interests.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)),
    removedHobbies,
    groups,
    people: people.sort((a, b) => (b.closenessScore ?? 0) - (a.closenessScore ?? 0)),
    loreSnippets,
    mentionOnly,
  };
}

/** Characters co-mentioned in text (for interest/attribute linking on ingest). */
export async function findCoMentionedCharacterIds(
  userId: string,
  text: string,
): Promise<string[]> {
  const normalized = text.toLowerCase();
  if (!normalized.trim()) return [];

  const { data: roster } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias')
    .eq('user_id', userId);

  const ids = new Set<string>();
  for (const row of roster ?? []) {
    const name = String(row.name ?? '').trim();
    if (name.length >= 2 && normalized.includes(name.toLowerCase())) {
      ids.add(row.id);
    }
    for (const alias of row.alias ?? []) {
      const a = String(alias ?? '').trim();
      if (a.length >= 2 && normalized.includes(a.toLowerCase())) {
        ids.add(row.id);
      }
    }
  }
  return Array.from(ids);
}

export const characterLoreProfileService = {
  compile: compileCharacterLoreProfile,
  findCoMentionedCharacterIds,
};
