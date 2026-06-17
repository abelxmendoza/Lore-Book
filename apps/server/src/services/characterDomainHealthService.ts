/**
 * Character domain health metrics for audit reports.
 */

import { characterAuthorityService } from './characterAuthorityService';
import { characterDeduplicationService } from './characterDeduplicationService';
import { characterInfluenceService } from './characterInfluenceService';
import { supabaseAdmin } from './supabaseClient';

export type CharacterDomainHealth = {
  userId: string;
  generatedAt: string;
  canonicalCharacters: number;
  peoplePlacesPersons: number;
  probableDuplicates: number;
  exactDuplicateGroups: number;
  crossStoreCollisions: number;
  orphanRelationshipEdges: number;
  charactersWithoutRelationships: number;
  charactersWithoutEpisodes: number;
  familyEdgeCount: number;
  friendEdgeCount: number;
  romanticEdgeCount: number;
  authorityMapEntries: number;
  topInfluencers: Array<{ name: string; score: number }>;
};

class CharacterDomainHealthService {
  async generateReport(userId: string): Promise<CharacterDomainHealth> {
    const [
      { count: charCount },
      { count: ppCount },
      { data: characters },
      duplicateGroups,
      probableDupes,
      { data: edges },
      { count: authorityCount },
    ] = await Promise.all([
      supabaseAdmin.from('characters').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('people_places').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('type', 'person'),
      supabaseAdmin.from('characters').select('id, name, metadata').eq('user_id', userId),
      characterDeduplicationService.findDuplicateGroups(userId),
      characterDeduplicationService.auditDuplicates(userId),
      supabaseAdmin.from('character_relationships').select('id, source_character_id, target_character_id, relationship_type').eq('user_id', userId),
      supabaseAdmin.from('character_authority_map').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);

    const validIds = new Set((characters ?? []).map(c => c.id));
    let orphanEdges = 0;
    let familyEdges = 0;
    let friendEdges = 0;
    let romanticEdges = 0;
    const charsWithRels = new Set<string>();

    for (const e of edges ?? []) {
      if (!validIds.has(e.source_character_id) || !validIds.has(e.target_character_id)) {
        orphanEdges++;
        continue;
      }
      charsWithRels.add(e.source_character_id);
      charsWithRels.add(e.target_character_id);
      const t = (e.relationship_type ?? '').toLowerCase();
      if (t === 'family') familyEdges++;
      if (t === 'friend') friendEdges++;
      if (t === 'romantic') romanticEdges++;
    }

    // Cross-store: people_places persons without character link
    let crossStoreCollisions = 0;
    const { data: ppRows } = await supabaseAdmin
      .from('people_places')
      .select('id, name')
      .eq('user_id', userId)
      .eq('type', 'person');
    for (const pp of ppRows ?? []) {
      const resolved = await characterAuthorityService.resolveByPeoplePlace(userId, pp.id);
      if (!resolved.characterId) crossStoreCollisions++;
    }

    // Characters without episodes
    let withoutEpisodes = 0;
    for (const c of characters ?? []) {
      const { count } = await supabaseAdmin
        .from('character_memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('character_id', c.id);
      if ((count ?? 0) === 0) withoutEpisodes++;
    }

    const influencers = await characterInfluenceService.getTopInfluencers(userId, 5);

    return {
      userId,
      generatedAt: new Date().toISOString(),
      canonicalCharacters: charCount ?? 0,
      peoplePlacesPersons: ppCount ?? 0,
      probableDuplicates: probableDupes.filter(d => d.confidence >= 0.85).length,
      exactDuplicateGroups: duplicateGroups.length,
      crossStoreCollisions,
      orphanRelationshipEdges: orphanEdges,
      charactersWithoutRelationships: (characters ?? []).filter(c => !charsWithRels.has(c.id)).length,
      charactersWithoutEpisodes: withoutEpisodes,
      familyEdgeCount: familyEdges,
      friendEdgeCount: friendEdges,
      romanticEdgeCount: romanticEdges,
      authorityMapEntries: authorityCount ?? 0,
      topInfluencers: influencers.map(i => ({ name: i.name, score: i.influenceScore })),
    };
  }
}

export const characterDomainHealthService = new CharacterDomainHealthService();
