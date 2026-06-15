import { fetchEntityProfile } from './chat/foundationRecallDataService';
import { entityFactsService } from './entityFactsService';
import { supabaseAdmin } from './supabaseClient';

export type RelatedEntity = {
  id: string;
  name: string;
  type: 'character' | 'organization' | 'location';
  relationship?: string;
};

export type CharacterKnowledgeBase = {
  characterId: string;
  name: string;
  aliases: string[];
  summary: string | null;
  identityMentions: Array<{ mention: string; source: string; evidenceCount: number }>;
  profile: {
    relationshipToUser: string | null;
    memoryCount: number;
    timelineEventCount: number;
    timelineEvents: Array<{ title: string; type: string; date: string | null; summary: string | null }>;
  };
  facts: Awaited<ReturnType<typeof entityFactsService.getEntityFacts>>;
  knowledgeClaims: Array<{
    id: string;
    human_readable_claim: string;
    knowledge_type?: string;
    confidence?: number;
    evidence_count?: number;
    evidence_links?: Array<{ evidence_summary?: string }>;
    last_reinforced_at?: string;
  }>;
  sceneCandidates: Array<Record<string, unknown>>;
  relatedEntities: RelatedEntity[];
  conversationLinks: Array<{
    sessionId: string;
    linkKind: string;
    mentionCount: number;
    firstLinkedAt: string;
    sessionTitle?: string;
  }>;
  intelligence: {
    totalEvidenceItems: number;
    lastUpdated: string | null;
    learningScore: number;
  };
};

async function loadKnowledgeClaimsForCharacter(userId: string, characterName: string) {
  const { data: claims, error: claimsErr } = await supabaseAdmin
    .from('crystallized_knowledge')
    .select('id, human_readable_claim, knowledge_type, confidence, status, last_reinforced_at, first_evidenced_at')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .order('confidence', { ascending: false });

  if (claimsErr || !claims?.length) return [];

  const claimIds = claims.map((c) => c.id);
  const { data: links } = await supabaseAdmin
    .from('knowledge_evidence_links')
    .select('knowledge_id, evidence_summary')
    .eq('user_id', userId)
    .in('knowledge_id', claimIds);

  if (!links?.length) return [];

  const nameLower = characterName.toLowerCase();
  const matchedIds = new Set<string>();
  const evidenceByClaimId: Record<string, typeof links> = {};

  for (const link of links) {
    if (!evidenceByClaimId[link.knowledge_id]) evidenceByClaimId[link.knowledge_id] = [];
    evidenceByClaimId[link.knowledge_id].push(link);
    if (link.evidence_summary?.toLowerCase().includes(nameLower)) {
      matchedIds.add(link.knowledge_id);
    }
  }

  return claims
    .filter((c) => matchedIds.has(c.id))
    .map((c) => ({
      ...c,
      evidence_count: evidenceByClaimId[c.id]?.length ?? 0,
      evidence_links: evidenceByClaimId[c.id] ?? [],
    }));
}

export async function getCharacterKnowledgeBase(
  userId: string,
  characterId: string
): Promise<CharacterKnowledgeBase | null> {
  const { data: character, error } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias, summary, updated_at')
    .eq('id', characterId)
    .eq('user_id', userId)
    .single();

  if (error || !character) return null;

  const [
    profile,
    facts,
    knowledgeClaims,
    sceneCandidatesResult,
    identityRows,
    relationships,
    timelineCountResult,
    orgsResult,
    conversationLinks,
  ] = await Promise.all([
    fetchEntityProfile(userId, character.name),
    entityFactsService.getEntityFacts(userId, characterId, 'character'),
    loadKnowledgeClaimsForCharacter(userId, character.name),
    import('./eventCandidates/eventCandidateService').then(({ eventCandidateService }) =>
      eventCandidateService.getCandidatesForEntity(userId, characterId)
    ),
    supabaseAdmin
      .from('character_identity_index')
      .select('mention, source, evidence_count, updated_at')
      .eq('user_id', userId)
      .eq('character_id', characterId)
      .order('evidence_count', { ascending: false })
      .limit(20),
    supabaseAdmin
      .from('character_relationships')
      .select('source_character_id, target_character_id, relationship_type')
      .or(`source_character_id.eq.${characterId},target_character_id.eq.${characterId}`),
    supabaseAdmin
      .from('character_timeline_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('character_id', characterId),
    supabaseAdmin
      .from('organization_members')
      .select('organization_id, role, organizations:organization_id(id, name)')
      .eq('user_id', userId)
      .eq('character_id', characterId),
    import('./conversationCentered/entityConversationLinkService').then(({ entityConversationLinkService }) =>
      entityConversationLinkService.getThreadsForEntity(userId, 'character', characterId)
    ),
  ]);

  const relatedCharacterIds = new Set<string>();
  for (const rel of relationships.data ?? []) {
    const otherId =
      rel.source_character_id === characterId ? rel.target_character_id : rel.source_character_id;
    if (otherId && otherId !== characterId) relatedCharacterIds.add(otherId);
  }

  const relTypeByCharId = new Map<string, string>();
  for (const rel of relationships.data ?? []) {
    const otherId =
      rel.source_character_id === characterId ? rel.target_character_id : rel.source_character_id;
    if (otherId) relTypeByCharId.set(otherId, rel.relationship_type);
  }

  let relatedCharacters: Array<{ id: string; name: string }> = [];
  if (relatedCharacterIds.size > 0) {
    const { data } = await supabaseAdmin
      .from('characters')
      .select('id, name')
      .in('id', Array.from(relatedCharacterIds));
    relatedCharacters = data ?? [];
  }

  const relatedEntities: RelatedEntity[] = [
    ...relatedCharacters.map((c) => ({
      id: c.id,
      name: c.name,
      type: 'character' as const,
      relationship: relTypeByCharId.get(c.id),
    })),
    ...(orgsResult.data ?? [])
      .map((row): RelatedEntity | null => {
        // PostgREST types the embed as an array, but an FK embed resolves to a
        // single object at runtime — normalize both shapes before reading it.
        const orgRaw = row.organizations as unknown;
        const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as
          | { id: string; name: string }
          | null
          | undefined;
        if (!org || typeof org !== 'object') return null;
        return {
          id: org.id,
          name: org.name,
          type: 'organization' as const,
          relationship: row.role ?? undefined,
        };
      })
      .filter((e): e is RelatedEntity => e !== null),
  ];

  const memoryCount = profile?.memoryCount ?? 0;
  const timelineEventCount = timelineCountResult.count ?? profile?.timelineEvents.length ?? 0;
  const identityMentions = (identityRows.data ?? []).map((row) => ({
    mention: row.mention,
    source: row.source,
    evidenceCount: row.evidence_count ?? 1,
  }));

  const totalEvidenceItems =
    facts.length +
    knowledgeClaims.reduce((sum, c) => sum + (c.evidence_count ?? 0), 0) +
    identityMentions.reduce((sum, m) => sum + m.evidenceCount, 0) +
    (sceneCandidatesResult?.length ?? 0);

  const learningScore = Math.min(
    100,
    Math.round(
      facts.length * 4 +
        knowledgeClaims.length * 10 +
        memoryCount * 2 +
        timelineEventCount * 3 +
        identityMentions.length * 3 +
        (sceneCandidatesResult?.length ?? 0) * 5
    )
  );

  const timestamps = [
    character.updated_at,
    ...facts.map((f) => f.updated_at).filter(Boolean),
    ...knowledgeClaims.map((c) => c.last_reinforced_at).filter(Boolean),
    ...(identityRows.data ?? []).map((r) => r.updated_at).filter(Boolean),
  ].filter(Boolean) as string[];

  const lastUpdated =
    timestamps.length > 0
      ? timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      : null;

  return {
    characterId: character.id,
    name: character.name,
    aliases: Array.isArray(character.alias) ? character.alias : [],
    summary: character.summary ?? null,
    identityMentions,
    profile: {
      relationshipToUser: profile?.relationshipToUser ?? null,
      memoryCount,
      timelineEventCount,
      timelineEvents: profile?.timelineEvents ?? [],
    },
    facts,
    knowledgeClaims,
    sceneCandidates: sceneCandidatesResult ?? [],
    relatedEntities,
    conversationLinks: (conversationLinks ?? []).map((link) => ({
      sessionId: link.sessionId,
      linkKind: link.linkKind,
      mentionCount: link.mentionCount,
      firstLinkedAt: link.firstLinkedAt,
      sessionTitle: link.sessionTitle,
    })),
    intelligence: {
      totalEvidenceItems,
      lastUpdated,
      learningScore,
    },
  };
}
