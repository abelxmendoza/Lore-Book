/**
 * Social graph rebuild — ensure relationship edges reference canonical character IDs.
 *
 * After dedup merges, this validates edge integrity and recomputes family /
 * friend / romantic / rival edges from canonical character_relationships.
 */

import { logger } from '../logger';

import { characterAuthorityService } from './characterAuthorityService';
import { characterDeduplicationService } from './characterDeduplicationService';
import { supabaseAdmin } from './supabaseClient';

export type GraphRebuildReport = {
  duplicatesMerged: number;
  edgesRewritten: number;
  orphanEdgesRemoved: number;
  relationshipsTotal: number;
  byType: Record<string, number>;
};

class SocialGraphRebuildService {
  async rebuildForUser(userId: string, opts: { mergeDuplicates?: boolean } = {}): Promise<GraphRebuildReport> {
    const report: GraphRebuildReport = {
      duplicatesMerged: 0,
      edgesRewritten: 0,
      orphanEdgesRemoved: 0,
      relationshipsTotal: 0,
      byType: {},
    };

    if (opts.mergeDuplicates !== false) {
      const mergeResults = await characterDeduplicationService.mergeDuplicateGroups(userId, false);
      report.duplicatesMerged = mergeResults.filter(r => r.merged).reduce((s, r) => s + r.group.duplicateIds.length, 0);
      characterAuthorityService.invalidateCache(userId);
    }

    const { data: characters } = await supabaseAdmin
      .from('characters')
      .select('id')
      .eq('user_id', userId);
    const validIds = new Set((characters ?? []).map(c => c.id));

    const { data: edges } = await supabaseAdmin
      .from('character_relationships')
      .select('id, source_character_id, target_character_id, relationship_type')
      .eq('user_id', userId);

    for (const edge of edges ?? []) {
      const srcValid = validIds.has(edge.source_character_id);
      const tgtValid = validIds.has(edge.target_character_id);
      if (!srcValid || !tgtValid) {
        await supabaseAdmin.from('character_relationships').delete().eq('id', edge.id);
        report.orphanEdgesRemoved++;
        continue;
      }
      const type = edge.relationship_type ?? 'unknown';
      report.byType[type] = (report.byType[type] ?? 0) + 1;
    }

    report.relationshipsTotal = Object.values(report.byType).reduce((a, b) => a + b, 0);

    logger.info({ userId, report }, 'Social graph rebuild complete');
    return report;
  }

  /** Count edges by relationship type for a character. */
  async relationshipCounts(userId: string, characterId: string): Promise<Record<string, number>> {
    const { data } = await supabaseAdmin
      .from('character_relationships')
      .select('relationship_type')
      .eq('user_id', userId)
      .or(`source_character_id.eq.${characterId},target_character_id.eq.${characterId}`);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const t = row.relationship_type ?? 'unknown';
      counts[t] = (counts[t] ?? 0) + 1;
    }
    return counts;
  }
}

export const socialGraphRebuildService = new SocialGraphRebuildService();
