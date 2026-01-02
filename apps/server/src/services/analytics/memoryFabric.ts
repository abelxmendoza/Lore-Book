/**
 * Memory Fabric Analytics Module
 * Builds similarity graph, detects clusters, and identifies outliers
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { BaseAnalyticsModule } from './base';
import type { AnalyticsPayload, MemoryData } from './types';

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

interface MemoryCluster {
  id: string;
  memories: MemoryData[];
  centroid: number[];
  summary: string;
  size: number;
}

export class MemoryFabricModule extends BaseAnalyticsModule {
  protected readonly moduleType = 'memory_fabric' as const;
  private readonly SIMILARITY_THRESHOLD = 0.7; // Minimum similarity for edges
  private readonly MIN_CLUSTER_SIZE = 3;

  async run(userId: string): Promise<AnalyticsPayload> {
    const cached = await this.getCachedResult(userId);
    if (cached) {
      return cached;
    }

    const memories = await this.fetchMemories(userId);
    
    if (memories.length < 3) {
      return this.emptyPayload();
    }

    // Filter memories with embeddings
    const memoriesWithEmbeddings = memories.filter(m => m.embedding && m.embedding.length > 0);
    
    if (memoriesWithEmbeddings.length < 3) {
      return this.emptyPayload();
    }

    // Build similarity graph
    const edges = this.buildSimilarityGraph(memoriesWithEmbeddings);
    
    // Detect communities (clusters)
    const clusters = this.detectCommunities(memoriesWithEmbeddings, edges);
    
    // Detect outliers
    const outliers = this.detectOutliers(memoriesWithEmbeddings, edges, clusters);

    const payload: AnalyticsPayload = {
      metrics: {
        totalMemories: memories.length,
        memoriesWithEmbeddings: memoriesWithEmbeddings.length,
        totalEdges: edges.length,
        clusters: clusters.length,
        outliers: outliers.length,
        averageClusterSize: clusters.length > 0
          ? clusters.reduce((sum, c) => sum + c.size, 0) / clusters.length
          : 0,
      },
      charts: [
        {
          type: 'bar',
          title: 'Cluster Sizes',
          data: clusters.map(c => ({ cluster: c.id, size: c.size })),
          xAxis: 'cluster',
          yAxis: 'size',
        },
      ],
      graph: {
        nodes: memoriesWithEmbeddings.map(m => ({
          id: m.id,
          label: m.text.substring(0, 50) + '...',
          type: 'memory',
          metadata: {
            date: m.created_at,
            sentiment: m.sentiment,
            topics: m.topics,
          },
        })),
        edges: edges.map(e => ({
          source: e.source,
          target: e.target,
          weight: e.weight,
          type: 'semantic',
        })),
      },
      clusters: clusters.map(c => ({
        id: c.id,
        label: c.summary,
        size: c.size,
        members: c.memories.map(m => m.id),
        summary: c.summary,
      })),
      insights: [
        ...this.generateClusterInsights(clusters),
        ...this.generateOutlierInsights(outliers),
      ],
      summary: this.generateSummary(clusters, outliers, edges),
    };

    await this.cacheResult(userId, payload);
    return payload;
  }

  /**
   * Build similarity graph using cosine similarity
   */
  private buildSimilarityGraph(memories: MemoryData[]): GraphEdge[] {
    const edges: GraphEdge[] = [];

    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const mem1 = memories[i];
        const mem2 = memories[j];

        if (!mem1.embedding || !mem2.embedding) {
          continue;
        }

        const similarity = this.cosineSimilarity(mem1.embedding, mem2.embedding);

        if (similarity >= this.SIMILARITY_THRESHOLD) {
          edges.push({
            source: mem1.id,
            target: mem2.id,
            weight: similarity,
          });
        }
      }
    }

    return edges;
  }

  /**
   * Detect communities using simplified Louvain-like algorithm
   * (Simplified version - full Louvain would require a graph library)
   */
  private detectCommunities(
    memories: MemoryData[],
    edges: GraphEdge[]
  ): MemoryCluster[] {
    // Build adjacency map
    const adjacency = new Map<string, Set<string>>();
    const edgeWeights = new Map<string, number>();

    for (const memory of memories) {
      adjacency.set(memory.id, new Set());
    }

    for (const edge of edges) {
      adjacency.get(edge.source)?.add(edge.target);
      adjacency.get(edge.target)?.add(edge.source);
      edgeWeights.set(`${edge.source}-${edge.target}`, edge.weight);
      edgeWeights.set(`${edge.target}-${edge.source}`, edge.weight);
    }

    // Simple community detection: connected components with high similarity
    const visited = new Set<string>();
    const clusters: MemoryCluster[] = [];
    let clusterId = 0;

    for (const memory of memories) {
      if (visited.has(memory.id)) {
        continue;
      }

      // BFS to find connected component
      const clusterMemories: MemoryData[] = [];
      const queue = [memory.id];
      visited.add(memory.id);

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const currentMemory = memories.find(m => m.id === currentId);
        if (currentMemory) {
          clusterMemories.push(currentMemory);
        }

        const neighbors = adjacency.get(currentId) || new Set();
        for (const neighborId of neighbors) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push(neighborId);
          }
        }
      }

      // Only create cluster if it meets minimum size
      if (clusterMemories.length >= this.MIN_CLUSTER_SIZE) {
        const centroid = this.computeCentroid(
          clusterMemories.map(m => m.embedding!).filter(e => e)
        );

        clusters.push({
          id: `cluster_${clusterId++}`,
          memories: clusterMemories,
          centroid,
          summary: this.generateClusterSummary(clusterMemories),
          size: clusterMemories.length,
        });
      }
    }

    return clusters;
  }

  /**
   * Compute centroid of embeddings
   */
  private computeCentroid(embeddings: number[][]): number[] {
    if (embeddings.length === 0) {
      return [];
    }

    const dim = embeddings[0].length;
    const centroid = new Array(dim).fill(0);

    for (const embedding of embeddings) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += embedding[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      centroid[i] /= embeddings.length;
    }

    return centroid;
  }

  /**
   * Generate cluster summary from memories
   */
  private generateClusterSummary(memories: MemoryData[]): string {
    // Use most common topics
    const topicCounts = new Map<string, number>();
    
    for (const memory of memories) {
      for (const topic of memory.topics || []) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }

    if (topicCounts.size > 0) {
      const topTopics = Array.from(topicCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([topic]) => topic);
      
      return `Cluster: ${topTopics.join(', ')}`;
    }

    // Fallback: use date range
    const dates = memories.map(m => new Date(m.created_at)).sort((a, b) => a.getTime() - b.getTime());
    const start = dates[0].toLocaleDateString();
    const end = dates[dates.length - 1].toLocaleDateString();
    
    return `Memory cluster (${start} - ${end})`;
  }

  /**
   * Detect outliers using edge connectivity (simplified Girvan-Newman)
   */
  private detectOutliers(
    memories: MemoryData[],
    edges: GraphEdge[],
    clusters: MemoryCluster[]
  ): MemoryData[] {
    // Build degree map
    const degrees = new Map<string, number>();
    
    for (const memory of memories) {
      degrees.set(memory.id, 0);
    }

    for (const edge of edges) {
      degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
    }

    // Find memories with very few connections
    const avgDegree = Array.from(degrees.values()).reduce((sum, d) => sum + d, 0) / degrees.size;
    const threshold = Math.max(1, avgDegree * 0.3); // 30% of average

    const outliers: MemoryData[] = [];
    
    for (const memory of memories) {
      const degree = degrees.get(memory.id) || 0;
      
      // Check if memory is in any cluster
      const inCluster = clusters.some(c => 
        c.memories.some(m => m.id === memory.id)
      );

      // Outlier if low connectivity and not in cluster
      if (degree < threshold && !inCluster) {
        outliers.push(memory);
      }
    }

    return outliers;
  }

  /**
   * Generate insights
   */
  private generateClusterInsights(clusters: MemoryCluster[]): Array<{ text: string; category: string; score: number }> {
    if (clusters.length === 0) {
      return [];
    }

    const largestCluster = clusters.reduce((largest, c) => 
      c.size > largest.size ? c : largest
    , clusters[0]);

    return [
      {
        text: `Detected ${clusters.length} memory clusters. Largest cluster contains ${largestCluster.size} memories about "${largestCluster.summary}".`,
        category: 'memory_clustering',
        score: clusters.length / 10, // Normalize
      },
    ];
  }

  private generateOutlierInsights(outliers: MemoryData[]): Array<{ text: string; category: string; score: number }> {
    if (outliers.length === 0) {
      return [];
    }

    return [
      {
        text: `Found ${outliers.length} outlier memories that don't strongly connect to other memories. These may represent unique or isolated experiences.`,
        category: 'outlier_detection',
        score: Math.min(1, outliers.length / 10), // Normalize
      },
    ];
  }

  private generateSummary(clusters: MemoryCluster[], outliers: MemoryData[], edges: GraphEdge[]): string {
    const totalMemories = clusters.reduce((sum, c) => sum + c.size, 0) + outliers.length;
    const clusteredMemories = clusters.reduce((sum, c) => sum + c.size, 0);
    const clusteringRatio = totalMemories > 0 ? (clusteredMemories / totalMemories) * 100 : 0;

    let summary = `Your memory fabric contains ${edges.length} semantic connections between ${totalMemories} memories. `;
    summary += `${clusters.length} distinct clusters were detected, representing ${clusteringRatio.toFixed(0)}% of your memories. `;
    
    if (outliers.length > 0) {
      summary += `${outliers.length} outlier memories stand apart from the main clusters, representing unique experiences.`;
    } else {
      summary += `All memories are well-connected within the fabric.`;
    }

    return summary;
  }

  private emptyPayload(): AnalyticsPayload {
    return {
      metrics: {},
      charts: [],
      graph: { nodes: [], edges: [] },
      clusters: [],
      insights: [],
      summary: 'Not enough data to generate memory fabric analytics.',
    };
  }
}

export const memoryFabricModule = new MemoryFabricModule();
