import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { ParacosmElement, ParacosmCluster, ParacosmWorld } from './paracosmTypes';

/**
 * Storage service for paracosm data
 */
export class ParacosmStorage {
  /**
   * Save paracosm elements
   */
  async saveElements(userId: string, elements: ParacosmElement[]): Promise<any[]> {
    const saved: any[] = [];

    try {
      for (const element of elements) {
        const { data: row, error } = await supabase
          .from('paracosm_elements')
          .insert({
            user_id: userId,
            memory_id: element.memory_id || null,
            category: element.category,
            text: element.text,
            evidence: element.evidence,
            timestamp: element.timestamp,
            confidence: element.confidence,
            vividness: element.vividness,
            emotional_intensity: element.emotional_intensity,
            embedding: element.embedding || null,
          })
          .select()
          .single();

        if (error) {
          logger.error({ error, element }, 'Error inserting paracosm element');
          continue;
        }

        saved.push(row);
      }

      logger.debug({ count: saved.length }, 'Saved paracosm elements');
    } catch (error) {
      logger.error({ error }, 'Error saving paracosm elements');
    }

    return saved;
  }

  /**
   * Save clusters
   */
  async saveClusters(userId: string, clusters: ParacosmCluster[]): Promise<any[]> {
    const saved: any[] = [];

    try {
      for (const cluster of clusters) {
        // Insert cluster
        const { data: clusterRow, error: clusterError } = await supabase
          .from('paracosm_clusters')
          .insert({
            user_id: userId,
            label: cluster.label,
            themes: cluster.themes,
          })
          .select()
          .single();

        if (clusterError) {
          logger.error({ error: clusterError, cluster }, 'Error inserting cluster');
          continue;
        }

        // Link elements to cluster
        for (const element of cluster.elements) {
          if (element.id) {
            await supabaseAdmin.from('paracosm_cluster_elements').insert({
              cluster_id: clusterRow.id,
              element_id: element.id,
            });
          }
        }

        saved.push(clusterRow);
      }

      logger.debug({ count: saved.length }, 'Saved paracosm clusters');
    } catch (error) {
      logger.error({ error }, 'Error saving paracosm clusters');
    }

    return saved;
  }

  /**
   * Save world
   */
  async saveWorld(userId: string, world: ParacosmWorld): Promise<any> {
    try {
      const { data: worldRow, error: worldError } = await supabase
        .from('paracosm_worlds')
        .insert({
          user_id: userId,
          name: world.name,
          description: world.description,
          data: world,
        })
        .select()
        .single();

      if (worldError) {
        logger.error({ error: worldError, world }, 'Error inserting world');
        throw worldError;
      }

      // Link clusters to world
      for (const cluster of world.clusters) {
        if (cluster.id) {
          await supabaseAdmin.from('paracosm_world_clusters').insert({
            world_id: worldRow.id,
            cluster_id: cluster.id,
          });
        }
      }

      logger.debug({ worldId: worldRow.id }, 'Saved paracosm world');
      return worldRow;
    } catch (error) {
      logger.error({ error, world }, 'Error saving paracosm world');
      throw error;
    }
  }

  /**
   * Get worlds for a user
   */
  async getWorlds(userId: string): Promise<ParacosmWorld[]> {
    try {
      const { data, error } = await supabase
        .from('paracosm_worlds')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error }, 'Error fetching worlds');
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        clusters: row.data?.clusters || [],
        user_id: row.user_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting worlds');
      return [];
    }
  }

  /**
   * Get elements for a user
   */
  async getElements(userId: string, limit: number = 100): Promise<ParacosmElement[]> {
    try {
      const { data, error } = await supabase
        .from('paracosm_elements')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error({ error }, 'Error fetching elements');
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        category: row.category,
        text: row.text,
        evidence: row.evidence,
        timestamp: row.timestamp,
        confidence: row.confidence,
        vividness: row.vividness,
        emotional_intensity: row.emotional_intensity,
        embedding: row.embedding || [],
        memory_id: row.memory_id,
        user_id: row.user_id,
        created_at: row.created_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting elements');
      return [];
    }
  }
}

