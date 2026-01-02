/**
 * Cluster Rebuild Job
 * Rebuilds memory clusters from embeddings
 */

import { supabaseAdmin } from '../services/supabaseClient';
import { logger } from '../logger';

interface Cluster {
  id: string;
  name: string;
  entry_ids: string[];
  centroid: number[];
  created_at: string;
}

/**
 * Simple clustering algorithm (K-means approximation)
 * In production, you'd use a more sophisticated clustering library
 */
function createClusters(entries: Array<{ id: string; embedding: number[] }>, k: number = 5): Cluster[] {
  // Placeholder clustering logic
  // In production, use a proper clustering algorithm like K-means or DBSCAN
  const clusters: Cluster[] = [];
  
  if (!entries || entries.length === 0) {
    return clusters;
  }

  // Simple approach: divide entries into k groups
  const entriesPerCluster = Math.ceil(entries.length / k);
  
  for (let i = 0; i < k; i++) {
    const startIdx = i * entriesPerCluster;
    const endIdx = Math.min(startIdx + entriesPerCluster, entries.length);
    const clusterEntries = entries.slice(startIdx, endIdx);
    
    if (clusterEntries.length === 0) continue;

    // Calculate centroid (mean of embeddings)
    const centroid = clusterEntries[0].embedding.map((_, dim) => {
      return clusterEntries.reduce((sum, entry) => sum + (entry.embedding[dim] || 0), 0) / clusterEntries.length;
    });

    clusters.push({
      id: `cluster-${i + 1}`,
      name: `Cluster ${i + 1}`,
      entry_ids: clusterEntries.map(e => e.id),
      centroid,
      created_at: new Date().toISOString()
    });
  }

  return clusters;
}

export async function runClusterRebuild(): Promise<{ clustersCreated: number; errors: number }> {
  logger.info('Starting cluster rebuild job');
  
  let clustersCreated = 0;
  let errors = 0;

  try {
    // Fetch entries with embeddings
    const { data: entries, error: fetchError } = await supabaseAdmin
      .from('journal_entries')
      .select('id, embedding')
      .not('embedding', 'is', null)
      .limit(1000);

    if (fetchError) {
      logger.error({ error: fetchError }, 'Failed to fetch entries for clustering');
      throw fetchError;
    }

    if (!entries || entries.length === 0) {
      logger.info('No entries with embeddings to cluster');
      return { clustersCreated: 0, errors: 0 };
    }

    logger.info({ count: entries.length }, 'Creating clusters from entries');

    // Filter entries with valid embeddings
    const entriesWithEmbeddings = entries
      .filter(e => e.embedding && Array.isArray(e.embedding) && e.embedding.length > 0)
      .map(e => ({
        id: e.id,
        embedding: e.embedding as number[]
      }));

    if (entriesWithEmbeddings.length === 0) {
      logger.warn('No entries with valid embeddings found');
      return { clustersCreated: 0, errors: 0 };
    }

    // Create clusters
    const clusters = createClusters(entriesWithEmbeddings, 5);

    // Upsert clusters (clear old clusters first)
    const { error: deleteError } = await supabaseAdmin
      .from('memory_clusters')
      .delete()
      .neq('id', ''); // Delete all clusters

    if (deleteError) {
      logger.warn({ error: deleteError }, 'Failed to clear old clusters, continuing anyway');
    }

    // Insert new clusters
    for (const cluster of clusters) {
      try {
        const { error: insertError } = await supabaseAdmin
          .from('memory_clusters')
          .upsert({
            id: cluster.id,
            name: cluster.name,
            entry_ids: cluster.entry_ids,
            centroid: cluster.centroid,
            created_at: cluster.created_at,
            updated_at: new Date().toISOString()
          });

        if (insertError) {
          logger.error({ error: insertError, clusterId: cluster.id }, 'Failed to insert cluster');
          errors++;
        } else {
          clustersCreated++;
        }
      } catch (error) {
        logger.error({ error, clusterId: cluster.id }, 'Error inserting cluster');
        errors++;
      }
    }

    logger.info({ clustersCreated, errors }, 'Cluster rebuild job completed');
    return { clustersCreated, errors };
  } catch (error) {
    logger.error({ error }, 'Cluster rebuild job failed');
    throw error;
  }
}

