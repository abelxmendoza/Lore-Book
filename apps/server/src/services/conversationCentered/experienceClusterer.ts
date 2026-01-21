// =====================================================
// EXPERIENCE CLUSTERER
// Purpose: Cluster similar EXPERIENCE units for better event assembly
// Expected Impact: More accurate event assembly, reduced redundancy
// =====================================================

import { logger } from '../../logger';
import type { ExtractedUnit } from '../../types/conversationCentered';
import { semanticSimilarityService } from './semanticSimilarityService';

export type ExperienceCluster = {
  id: string;
  experiences: ExtractedUnit[];
  centroid: string; // Representative text
  similarity: number; // Average similarity within cluster
  temporalSpan?: {
    start: Date;
    end: Date;
  };
  entities: Set<string>; // Unique entity IDs
};

export type ClusteringOptions = {
  similarityThreshold?: 'strict' | 'moderate' | 'loose';
  maxClusterSize?: number;
  temporalWindow?: number; // milliseconds
};

/**
 * Clusters EXPERIENCE units by semantic similarity
 */
export class ExperienceClusterer {
  private readonly DEFAULT_THRESHOLD: 'moderate' | 'strict' | 'loose' = 'moderate';
  private readonly DEFAULT_MAX_CLUSTER_SIZE = 5;
  private readonly DEFAULT_TEMPORAL_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Cluster experiences by similarity
   */
  async clusterExperiences(
    experiences: ExtractedUnit[],
    options: ClusteringOptions = {}
  ): Promise<ExperienceCluster[]> {
    if (experiences.length === 0) return [];

    const threshold = options.similarityThreshold || this.DEFAULT_THRESHOLD;
    const maxSize = options.maxClusterSize || this.DEFAULT_MAX_CLUSTER_SIZE;
    const temporalWindow = options.temporalWindow || this.DEFAULT_TEMPORAL_WINDOW;

    const clusters: ExperienceCluster[] = [];
    const processed = new Set<string>();

    // Sort by timestamp if available
    const sorted = [...experiences].sort((a, b) => {
      const timeA = a.metadata?.timestamp ? new Date(a.metadata.timestamp).getTime() : 0;
      const timeB = b.metadata?.timestamp ? new Date(b.metadata.timestamp).getTime() : 0;
      return timeA - timeB;
    });

    for (let i = 0; i < sorted.length; i++) {
      if (processed.has(sorted[i].id)) continue;

      const cluster: ExperienceCluster = {
        id: `cluster-${clusters.length + 1}`,
        experiences: [sorted[i]],
        centroid: sorted[i].content || '',
        similarity: 1.0,
        entities: new Set(sorted[i].entity_ids || []),
      };

      processed.add(sorted[i].id);

      // Find similar experiences
      for (let j = i + 1; j < sorted.length; j++) {
        if (processed.has(sorted[j].id)) continue;
        if (cluster.experiences.length >= maxSize) break;

        // Check temporal proximity
        const timeA = sorted[i].metadata?.timestamp
          ? new Date(sorted[i].metadata.timestamp).getTime()
          : Date.now();
        const timeB = sorted[j].metadata?.timestamp
          ? new Date(sorted[j].metadata.timestamp).getTime()
          : Date.now();
        const timeDiff = Math.abs(timeB - timeA);

        if (timeDiff > temporalWindow) continue;

        // Check semantic similarity
        const similarity = await semanticSimilarityService.calculateSimilarity(
          sorted[i].content || '',
          sorted[j].content || '',
          threshold
        );

        if (similarity.isSimilar) {
          cluster.experiences.push(sorted[j]);
          processed.add(sorted[j].id);

          // Update entities
          (sorted[j].entity_ids || []).forEach(id => cluster.entities.add(id));

          // Update centroid (use longest text as representative)
          if ((sorted[j].content || '').length > cluster.centroid.length) {
            cluster.centroid = sorted[j].content || '';
          }
        }
      }

      // Calculate average similarity within cluster
      if (cluster.experiences.length > 1) {
        const similarities = await semanticSimilarityService.calculateBatchSimilarity(
          cluster.experiences.map(e => e.content || ''),
          threshold
        );
        const avgSimilarity =
          similarities.reduce((sum, s) => sum + s.similarity, 0) / similarities.length;
        cluster.similarity = avgSimilarity;
      }

      // Set temporal span
      if (cluster.experiences.length > 0) {
        const times = cluster.experiences
          .map(e => {
            const timestamp = e.metadata?.timestamp;
            return timestamp ? new Date(timestamp).getTime() : Date.now();
          })
          .filter(t => !isNaN(t));

        if (times.length > 0) {
          cluster.temporalSpan = {
            start: new Date(Math.min(...times)),
            end: new Date(Math.max(...times)),
          };
        }
      }

      clusters.push(cluster);
    }

    logger.debug(
      { clusterCount: clusters.length, experienceCount: experiences.length },
      'Clustered experiences'
    );

    return clusters;
  }

  /**
   * Cluster by temporal proximity only
   */
  clusterByTime(
    experiences: ExtractedUnit[],
    windowMs: number = this.DEFAULT_TEMPORAL_WINDOW
  ): ExperienceCluster[] {
    if (experiences.length === 0) return [];

    const sorted = [...experiences].sort((a, b) => {
      const timeA = a.metadata?.timestamp ? new Date(a.metadata.timestamp).getTime() : 0;
      const timeB = b.metadata?.timestamp ? new Date(b.metadata.timestamp).getTime() : 0;
      return timeA - timeB;
    });

    const clusters: ExperienceCluster[] = [];
    let currentCluster: ExperienceCluster | null = null;
    let clusterStartTime = 0;

    for (const exp of sorted) {
      const expTime = exp.metadata?.timestamp
        ? new Date(exp.metadata.timestamp).getTime()
        : Date.now();

      if (!currentCluster || expTime - clusterStartTime > windowMs) {
        // Start new cluster
        if (currentCluster) {
          clusters.push(currentCluster);
        }

        currentCluster = {
          id: `time-cluster-${clusters.length + 1}`,
          experiences: [exp],
          centroid: exp.content || '',
          similarity: 1.0,
          entities: new Set(exp.entity_ids || []),
          temporalSpan: {
            start: new Date(expTime),
            end: new Date(expTime),
          },
        };
        clusterStartTime = expTime;
      } else {
        // Add to current cluster
        currentCluster.experiences.push(exp);
        (exp.entity_ids || []).forEach(id => currentCluster!.entities.add(id));

        // Update temporal span
        if (currentCluster.temporalSpan) {
          currentCluster.temporalSpan.end = new Date(expTime);
        }
      }
    }

    if (currentCluster) {
      clusters.push(currentCluster);
    }

    return clusters;
  }

  /**
   * Cluster by entity overlap
   */
  clusterByEntities(experiences: ExtractedUnit[]): ExperienceCluster[] {
    if (experiences.length === 0) return [];

    const clusters: ExperienceCluster[] = [];
    const processed = new Set<string>();

    for (const exp of experiences) {
      if (processed.has(exp.id)) continue;

      const entitySet = new Set(exp.entity_ids || []);
      if (entitySet.size === 0) continue;

      const cluster: ExperienceCluster = {
        id: `entity-cluster-${clusters.length + 1}`,
        experiences: [exp],
        centroid: exp.content || '',
        similarity: 1.0,
        entities: new Set(entitySet),
      };

      processed.add(exp.id);

      // Find experiences with overlapping entities
      for (const otherExp of experiences) {
        if (processed.has(otherExp.id)) continue;

        const otherEntitySet = new Set(otherExp.entity_ids || []);
        const overlap = [...entitySet].filter(id => otherEntitySet.has(id));

        if (overlap.length > 0) {
          cluster.experiences.push(otherExp);
          processed.add(otherExp.id);

          // Merge entity sets
          otherEntitySet.forEach(id => cluster.entities.add(id));
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }
}

export const experienceClusterer = new ExperienceClusterer();
