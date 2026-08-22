/**
 * Shared character identity loader — used by GET /api/characters/:id,
 * character query, and profile-bundle so modal/card detail stay in parity.
 */
import { identityStrengthService } from '../identity/identityStrengthService';
import { dedupeRelationshipsByPerson } from '../relationships/dedupeCharacterRelationships';
import {
  isSelfCharacterMetadata,
  resolveRelatedPersonType,
} from '../relationships/relatedPersonType';
import { displayAvatarUrl } from '../characterAvatarService';
import { filterValidAliases } from './aliasConstraintService';
import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';

export type CharacterIdentityRelationship = {
  id: string;
  character_id: string;
  character_name: string;
  relationship_type: string;
  closeness_score?: number | null;
  summary?: string | null;
  status?: string | null;
};

export type CharacterSharedMemoryRef = {
  id: string;
  entry_id: string;
  /** Occurrence date only. Empty when unresolved — never recording time. */
  date: string;
  summary?: string;
  occurredAt?: string | null;
  mentionedAt?: string | null;
  recordedAt?: string | null;
  occurrenceStatus?: 'confirmed' | 'range' | 'unresolved';
  canonicalEventId?: string | null;
};

export type CharacterIdentity = {
  id: string;
  name: string;
  alias: string[];
  pronouns?: string | null;
  species?: string | null;
  archetype?: string | null;
  role?: string | null;
  status: string;
  first_appearance?: string | null;
  summary?: string | null;
  witty_tagline?: string | null;
  real_name?: string | null;
  context_hooks: string[];
  ontology_tags: string[];
  tags: string[];
  avatar_url?: string | null;
  social_media?: Record<string, string>;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  is_nickname?: boolean | null;
  importance_level?: string | null;
  importance_score?: number | null;
  proximity_level?: string | null;
  has_met?: boolean | null;
  relationship_depth?: string | null;
  associated_with_character_ids: string[];
  mentioned_by_character_ids: string[];
  context_of_mention?: string | null;
  likelihood_to_meet?: string | null;
  primary_organization?: {
    id: string;
    name: string;
    group_type?: string;
    role?: string | null;
    status?: string;
  } | null;
  memory_count: number;
  relationship_count: number;
  relationships: CharacterIdentityRelationship[];
  shared_memories: CharacterSharedMemoryRef[];
  identity_strength_score?: number | null;
  identity_strength?: unknown;
};

export async function loadCharacterIdentity(
  userId: string,
  characterId: string,
  options: { refreshBlurb?: boolean; recomputeIdentityStrength?: boolean } = {},
): Promise<CharacterIdentity | null> {
  const refreshBlurb = options.refreshBlurb !== false;
  const recomputeIdentityStrength = options.recomputeIdentityStrength !== false;

  const { data: character, error } = await supabaseAdmin
    .from('characters')
    .select('*')
    .eq('id', characterId)
    .eq('user_id', userId)
    .single();

  if (error || !character) return null;

  // Move "Person the Epithet" out of primary name into alias + contextual_title.
  const { repairEpithetPrimaryNameIfNeeded } = await import('./epithetPrimaryNameRepair');
  const epithetRepair = await repairEpithetPrimaryNameIfNeeded(userId, character.id, {
    name: character.name,
    alias: character.alias,
    metadata: character.metadata as Record<string, unknown> | null,
    first_name: character.first_name,
    last_name: character.last_name,
  });
  if (epithetRepair.repaired) {
    const { data: refreshed } = await supabaseAdmin
      .from('characters')
      .select('*')
      .eq('id', characterId)
      .eq('user_id', userId)
      .single();
    if (refreshed) Object.assign(character, refreshed);
  }

  // Suggest a story epithet when none exists yet (async — next open shows it).
  const { resolveStoredEpithet } = await import('../../utils/personNameEpithet');
  if (!resolveStoredEpithet(character.metadata as Record<string, unknown>)) {
    void import('./epithetGenerationService')
      .then(({ maybeGenerateCharacterEpithet }) =>
        maybeGenerateCharacterEpithet(userId, characterId),
      )
      .catch((err) => {
        logger.debug({ err, characterId }, 'epithet generation skipped');
      });
  }
  const { data: rosterRows } = await supabaseAdmin
    .from('characters')
    .select('id, name')
    .eq('user_id', userId);
  const otherCanonicalNames = (rosterRows ?? [])
    .filter((row) => row.id !== character.id)
    .map((row) => row.name)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
  const sanitizedAliases = filterValidAliases(character.name, character.alias ?? [], {
    otherCanonicalNames,
  });
  if (JSON.stringify(sanitizedAliases) !== JSON.stringify(character.alias ?? [])) {
    await supabaseAdmin
      .from('characters')
      .update({
        alias: sanitizedAliases.length > 0 ? sanitizedAliases : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', character.id)
      .eq('user_id', userId);
    character.alias = sanitizedAliases;
  }

  const { data: relationships } = await supabaseAdmin
    .from('character_relationships')
    .select('*')
    .or(`source_character_id.eq.${character.id},target_character_id.eq.${character.id}`);

  const metadataEarly = { ...((character.metadata || {}) as Record<string, unknown>) };
  const dismissedAssociatedIds = new Set(
    (Array.isArray(metadataEarly.dismissed_associated_character_ids)
      ? metadataEarly.dismissed_associated_character_ids
      : []
    ).filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
  const associatedCharacterIds = new Set<string>(
    [
      ...(Array.isArray(character.associated_with_character_ids)
        ? character.associated_with_character_ids
        : []),
      ...(Array.isArray(character.mentioned_by_character_ids)
        ? character.mentioned_by_character_ids
        : []),
    ].filter(
      (id): id is string =>
        typeof id === 'string' &&
        id.length > 0 &&
        id !== character.id &&
        !dismissedAssociatedIds.has(id),
    ),
  );

  const relationshipCharacterIds = new Set<string>();
  relationships?.forEach((rel) => {
    if (rel.source_character_id === character.id) {
      relationshipCharacterIds.add(rel.target_character_id);
    } else {
      relationshipCharacterIds.add(rel.source_character_id);
    }
  });
  associatedCharacterIds.forEach((id) => relationshipCharacterIds.add(id));

  const { data: relatedCharacters } =
    relationshipCharacterIds.size > 0
      ? await supabaseAdmin
          .from('characters')
          .select('id, name, metadata')
          .in('id', Array.from(relationshipCharacterIds))
      : { data: [] };

  const characterNameMap = new Map<string, string>(
    relatedCharacters?.map((char) => [char.id, char.name] as [string, string]) || [],
  );
  const relatedMetaById = new Map(
    (relatedCharacters ?? []).map((row) => [row.id, (row.metadata ?? {}) as Record<string, unknown>]),
  );

  const { data: memories } = await supabaseAdmin
    .from('character_memories')
    .select('id, journal_entry_id, created_at, summary')
    .eq('character_id', character.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const { count: memoryCount } = await supabaseAdmin
    .from('character_memories')
    .select('*', { count: 'exact', head: true })
    .eq('character_id', character.id);

  const { count: relationshipCount } = await supabaseAdmin
    .from('character_relationships')
    .select('*', { count: 'exact', head: true })
    .or(`source_character_id.eq.${character.id},target_character_id.eq.${character.id}`);

  const metadata = { ...((character.metadata || {}) as Record<string, unknown>) };
  const isSelfCharacter = Boolean(
    metadata.is_self || metadata.is_user || /^me$/i.test(character.name),
  );
  const pollutedHooks =
    !isSelfCharacter && Array.isArray(metadata.context_hooks)
      ? metadata.context_hooks.some(
          (hook) =>
            typeof hook === 'string' &&
            /interview|epirus|resume|warehouse diagnostics|caffeine and firmware/i.test(hook),
        )
      : false;

  let wittyTagline =
    (typeof metadata.witty_tagline === 'string' && metadata.witty_tagline) ||
    (typeof metadata.character_blurb === 'string' ? metadata.character_blurb : null);

  if (refreshBlurb && (!wittyTagline || pollutedHooks)) {
    try {
      const { characterBlurbService } = await import('./characterBlurbService');
      const blurb = await characterBlurbService.refreshAndPersist(userId, character.id, {
        isSelf: isSelfCharacter,
      });
      wittyTagline = blurb?.wittyTagline ?? wittyTagline;
      if (blurb) {
        metadata.witty_tagline = blurb.wittyTagline;
        metadata.character_blurb = blurb.wittyTagline;
        metadata.profile_summary = blurb.profileSummary;
        metadata.context_hooks = blurb.contextHooks;
        metadata.ontology_tags = blurb.ontologyTags;
      }
    } catch (err) {
      logger.debug({ err, characterId }, 'character identity blurb refresh skipped');
    }
  }

  const social_media = metadata.social_media as Record<string, string> | undefined;
  const directRelationships = dedupeRelationshipsByPerson(
    (relationships ?? [])
      .filter((rel) => {
        const status = String(rel.status ?? 'active').toLowerCase();
        if (status === 'superseded' || status === 'deleted' || status === 'inactive') return false;
        return rel.relationship_type !== 'possible_family';
      })
      .map((rel) => {
        const relatedCharId =
          rel.source_character_id === character.id
            ? rel.target_character_id
            : rel.source_character_id;
        const otherMeta = relatedMetaById.get(relatedCharId) ?? {};
        return {
          id: rel.id as string,
          character_id: relatedCharId as string,
          character_name: characterNameMap.get(relatedCharId) || 'Unknown',
          relationship_type: resolveRelatedPersonType({
            storedType: String(rel.relationship_type ?? ''),
            viewerIsSource: rel.source_character_id === character.id,
            viewerIsSelf: isSelfCharacter,
            otherIsSelf: isSelfCharacterMetadata(otherMeta, characterNameMap.get(relatedCharId)),
            viewerRelationshipToYou:
              typeof metadata.relationship_to_user === 'string' ? metadata.relationship_to_user : null,
            otherRelationshipToYou:
              typeof otherMeta.relationship_to_user === 'string' ? otherMeta.relationship_to_user : null,
            otherName: characterNameMap.get(relatedCharId),
          }),
          closeness_score: rel.closeness_score,
          summary: rel.summary,
          status: rel.status,
        };
      }),
  );
  const directlyRelatedIds = new Set(directRelationships.map((rel) => rel.character_id));
  const inferredStoryRelationships = Array.from(associatedCharacterIds)
    .filter((id) => !directlyRelatedIds.has(id))
    .map((id) => ({
      id: `story-association-${character.id}-${id}`,
      character_id: id,
      character_name: characterNameMap.get(id) || 'Unknown',
      relationship_type: 'story_association',
      closeness_score: 3,
      summary: 'Connected through shared story context, mentions, or scene grouping.',
      status: 'inferred' as string | null,
    }));
  const allRelationships = [...directRelationships, ...inferredStoryRelationships];

  let primary_organization: CharacterIdentity['primary_organization'] = null;
  try {
    const { organizationService } = await import('../organizationService');
    const preferred =
      (typeof metadata.primary_organization_id === 'string' && metadata.primary_organization_id) ||
      (typeof metadata.primary_group_id === 'string' && metadata.primary_group_id) ||
      undefined;
    const primaryByCharacter = await organizationService.getPrimaryAffiliationsByCharacterIds(
      userId,
      [character.id],
      preferred ? { preferredOrgIdByCharacter: { [character.id]: preferred } } : undefined,
    );
    primary_organization = primaryByCharacter[character.id] ?? null;
  } catch (err) {
    logger.debug({ err, characterId: character.id }, 'primary organization attach skipped');
  }

  if (recomputeIdentityStrength) {
    void identityStrengthService.recompute(
      userId,
      'character',
      character.id,
      {
        confidence: typeof metadata.confidence === 'number' ? (metadata.confidence as number) : undefined,
        evidenceCount: memoryCount || 0,
        connectedEntities: relationshipCount || 0,
        confirmedRelationships: directRelationships.filter(
          (rel) => rel.status && rel.status !== 'inferred',
        ).length,
        interactionCount: memoryCount || 0,
      },
      {
        identity_strength_score: character.identity_strength_score,
        identity_strength: character.identity_strength,
      },
    );
  }

  return {
    id: character.id,
    name: character.name,
    alias: character.alias || [],
    pronouns: character.pronouns,
    species: character.species,
    archetype: character.archetype,
    role: character.role,
    status: character.status || 'active',
    first_appearance: character.first_appearance,
    summary: character.summary,
    witty_tagline: wittyTagline,
    real_name:
      (typeof metadata.real_name === 'string' && metadata.real_name) ||
      [character.first_name, character.last_name].filter(Boolean).join(' ').trim() ||
      null,
    context_hooks: Array.isArray(metadata.context_hooks) ? (metadata.context_hooks as string[]) : [],
    ontology_tags: Array.isArray(metadata.ontology_tags) ? (metadata.ontology_tags as string[]) : [],
    tags: character.tags || [],
    avatar_url: displayAvatarUrl(character),
    social_media: social_media || undefined,
    metadata,
    created_at: character.created_at,
    updated_at: character.updated_at,
    first_name: character.first_name ?? null,
    middle_name: typeof metadata.middle_name === 'string' ? metadata.middle_name : null,
    last_name: character.last_name ?? null,
    is_nickname: character.is_nickname ?? null,
    importance_level: character.importance_level ?? null,
    importance_score: character.importance_score ?? null,
    proximity_level: character.proximity_level ?? null,
    has_met: character.has_met ?? null,
    relationship_depth: character.relationship_depth ?? null,
    associated_with_character_ids: character.associated_with_character_ids ?? [],
    mentioned_by_character_ids: character.mentioned_by_character_ids ?? [],
    context_of_mention: character.context_of_mention ?? null,
    likelihood_to_meet: character.likelihood_to_meet ?? null,
    memory_count: memoryCount || 0,
    relationship_count: Math.max(relationshipCount || 0, allRelationships.length),
    relationships: allRelationships,
    shared_memories: memories?.length
      ? await (async () => {
          const { mapCharacterMemoriesToTemporalRefs } = await import('../temporal/journalMemoryTemporalLoader');
          return mapCharacterMemoriesToTemporalRefs(userId, memories);
        })()
      : [],
    identity_strength_score: character.identity_strength_score,
    identity_strength: character.identity_strength,
    primary_organization,
  };
}
