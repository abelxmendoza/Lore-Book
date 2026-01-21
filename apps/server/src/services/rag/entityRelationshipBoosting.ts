import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { MemoryEntry } from '../../types';

/**
 * Entity Relationship Boosting Service
 * Boosts retrieval based on entity relationships and entity graph
 */
export class EntityRelationshipBoosting {
  /**
   * Boost entries based on entity relationships
   */
  async boostByEntities(
    entries: MemoryEntry[],
    queryEntities: string[],
    userId: string
  ): Promise<Array<MemoryEntry & { entityBoost: number }>> {
    try {
      if (queryEntities.length === 0 || entries.length === 0) {
        return entries.map(e => ({ ...e, entityBoost: 1.0 }));
      }

      // Get entity mentions for all entries
      const entryIds = entries.map(e => e.id).filter(Boolean);
      const { data: mentions } = await supabaseAdmin
        .from('entity_mentions')
        .select('memory_id, entity_id')
        .in('memory_id', entryIds)
        .eq('user_id', userId);

      // Get entity relationships
      const entityGraph = await this.buildEntityGraph(userId, queryEntities);

      // Calculate boosts
      const boosted = entries.map(entry => {
        const entryEntityIds = (mentions || [])
          .filter(m => m.memory_id === entry.id)
          .map(m => m.entity_id);

        const boost = this.calculateEntityBoost(
          queryEntities,
          entryEntityIds,
          entityGraph
        );

        return {
          ...entry,
          entityBoost: boost
        };
      });

      return boosted;
    } catch (error) {
      logger.error({ error }, 'Entity boosting failed');
      return entries.map(e => ({ ...e, entityBoost: 1.0 }));
    }
  }

  /**
   * Build entity relationship graph
   */
  private async buildEntityGraph(
    userId: string,
    queryEntities: string[]
  ): Promise<Map<string, string[]>> {
    const graph = new Map<string, string[]>();

    try {
      // Get entity IDs from names
      const { data: entities } = await supabaseAdmin
        .from('entities')
        .select('id, primary_name')
        .eq('user_id', userId)
        .in('primary_name', queryEntities);

      const entityIds = (entities || []).map(e => e.id);

      // Get relationships (from character_relationships, entity_relationships, etc.)
      const { data: relationships } = await supabaseAdmin
        .from('character_relationships')
        .select('person_id, related_person_id')
        .eq('user_id', userId)
        .or(`person_id.in.(${entityIds.join(',')}),related_person_id.in.(${entityIds.join(',')})`);

      // Build graph
      (relationships || []).forEach(rel => {
        const source = rel.person_id;
        const target = rel.related_person_id;

        if (!graph.has(source)) {
          graph.set(source, []);
        }
        graph.get(source)!.push(target);

        if (!graph.has(target)) {
          graph.set(target, []);
        }
        graph.get(target)!.push(source);
      });
    } catch (error) {
      logger.debug({ error }, 'Failed to build entity graph');
    }

    return graph;
  }

  /**
   * Calculate entity boost for an entry
   */
  private calculateEntityBoost(
    queryEntities: string[],
    entryEntityIds: string[],
    entityGraph: Map<string, string[]>
  ): number {
    if (entryEntityIds.length === 0) {
      return 1.0; // No boost if no entities
    }

    // Direct entity match boost
    const directMatches = queryEntities.filter(qe => 
      entryEntityIds.some(ee => ee === qe || this.entityNameMatch(qe, ee))
    ).length;

    if (directMatches > 0) {
      return 1.0 + (directMatches * 0.5); // Strong boost for direct matches
    }

    // Related entity boost (entities connected to query entities)
    let relatedBoost = 0;
    queryEntities.forEach(queryEntity => {
      const related = entityGraph.get(queryEntity) || [];
      const relatedMatches = related.filter(r => entryEntityIds.includes(r)).length;
      relatedBoost += relatedMatches * 0.3; // Moderate boost for related entities
    });

    return 1.0 + relatedBoost;
  }

  /**
   * Check if entity names match (simple)
   */
  private entityNameMatch(entity1: string, entity2: string): boolean {
    return entity1.toLowerCase() === entity2.toLowerCase();
  }

  /**
   * Boost entries by entity confidence
   */
  async boostByConfidence(
    entries: MemoryEntry[],
    userId: string
  ): Promise<Array<MemoryEntry & { confidenceBoost: number }>> {
    try {
      const entryIds = entries.map(e => e.id).filter(Boolean);
      
      // Get entity mentions with confidence
      const { data: mentions } = await supabaseAdmin
        .from('entity_mentions')
        .select('memory_id, entity_id')
        .in('memory_id', entryIds)
        .eq('user_id', userId);

      const { data: entities } = await supabaseAdmin
        .from('entities')
        .select('id, confidence')
        .eq('user_id', userId)
        .in('id', [...new Set((mentions || []).map(m => m.entity_id))]);

      const confidenceMap = new Map(
        (entities || []).map(e => [e.id, e.confidence || 0.5])
      );

      return entries.map(entry => {
        const entryEntityIds = (mentions || [])
          .filter(m => m.memory_id === entry.id)
          .map(m => m.entity_id);

        const avgConfidence = entryEntityIds.length > 0
          ? entryEntityIds.reduce((sum, id) => sum + (confidenceMap.get(id) || 0.5), 0) / entryEntityIds.length
          : 0.5;

        return {
          ...entry,
          confidenceBoost: 0.5 + (avgConfidence * 0.5) // Scale to 0.5-1.0
        };
      });
    } catch (error) {
      logger.error({ error }, 'Confidence boosting failed');
      return entries.map(e => ({ ...e, confidenceBoost: 1.0 }));
    }
  }
}

export const entityRelationshipBoosting = new EntityRelationshipBoosting();
