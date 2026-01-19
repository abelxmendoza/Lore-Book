/**
 * Saga Engine Analytics Module
 * Detects narrative arcs, clusters memories by topic, and generates saga labels
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { BaseAnalyticsModule } from './base';
import type { AnalyticsPayload, MemoryData, ArcData } from './types';

interface MemoryCluster {
  id: string;
  memories: MemoryData[];
  centroid: number[];
  topic: string;
  startDate: string;
  endDate: string;
  sentiment: number;
}

export class SagaEngineModule extends BaseAnalyticsModule {
  protected readonly moduleType = 'saga' as const;

  async run(userId: string): Promise<AnalyticsPayload> {
    const cached = await this.getCachedResult(userId);
    if (cached) {
      return cached;
    }

    const memories = await this.fetchMemories(userId);
    
    if (memories.length < 5) {
      return this.emptyPayload();
    }

    // Sort by date
    memories.sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Cluster memories using embedding similarity
    const clusters = await this.clusterMemories(memories);
    
    // Detect arc boundaries
    const arcs = this.detectArcBoundaries(clusters, memories);
    
    // Generate saga labels
    const sagas = await this.generateSagaLabels(arcs, userId);
    
    // Create timeline bands
    const timelineBands = this.createTimelineBands(arcs);

    const payload: AnalyticsPayload = {
      metrics: {
        totalArcs: arcs.length,
        totalSagas: sagas.length,
        averageArcDuration: this.computeAverageArcDuration(arcs),
        arcDensity: arcs.length / (this.getTimeSpan(memories) / (1000 * 60 * 60 * 24)), // arcs per day
      },
      charts: [
        {
          type: 'area',
          title: 'Arc Timeline',
          data: timelineBands,
          xAxis: 'date',
          yAxis: 'intensity',
        },
        {
          type: 'bar',
          title: 'Arc Sentiment Distribution',
          data: arcs.map(a => ({ arc: a.label, sentiment: a.sentiment })),
          xAxis: 'arc',
          yAxis: 'sentiment',
        },
      ],
      clusters: arcs.map(a => ({
        id: a.id,
        label: a.label,
        size: a.memories.length,
        members: a.memories.map(m => m.id),
        summary: a.summary,
      })),
      insights: [
        ...this.generateArcInsights(arcs),
        ...this.generateSagaInsights(sagas),
      ],
      summary: this.generateSummary(arcs, sagas, memories),
    };

    await this.cacheResult(userId, payload);
    return payload;
  }

  /**
   * Cluster memories using HDBSCAN-like approach (simplified KMeans fallback)
   */
  private async clusterMemories(memories: MemoryData[]): Promise<MemoryCluster[]> {
    // Filter memories with embeddings
    const memoriesWithEmbeddings = memories.filter(m => m.embedding && m.embedding.length > 0);
    
    if (memoriesWithEmbeddings.length < 3) {
      return [];
    }

    // Determine optimal number of clusters (between 2 and sqrt(n))
    const k = Math.min(Math.max(2, Math.floor(Math.sqrt(memoriesWithEmbeddings.length))), 10);

    // Simple KMeans clustering
    const clusters = this.kmeansClustering(memoriesWithEmbeddings, k);

    // Generate topic labels for each cluster
    const clustersWithTopics = await Promise.all(
      clusters.map(async (cluster) => {
        const topic = await this.extractTopic(cluster.memories);
        return { ...cluster, topic };
      })
    );

    return clustersWithTopics;
  }

  /**
   * KMeans clustering (simplified)
   */
  private kmeansClustering(memories: MemoryData[], k: number): MemoryCluster[] {
    if (memories.length === 0) {
      return [];
    }

    // Initialize centroids randomly
    const centroids: number[][] = [];
    const step = Math.floor(memories.length / k);
    for (let i = 0; i < k; i++) {
      const idx = Math.min(i * step, memories.length - 1);
      centroids.push([...memories[idx].embedding!]);
    }

    let clusters: MemoryCluster[] = [];
    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
      // Assign memories to nearest centroid
      const assignments: MemoryData[][] = Array(k).fill(null).map(() => []);
      
      for (const memory of memories) {
        if (!memory.embedding) continue;
        
        let minDist = Infinity;
        let nearestCluster = 0;
        
        for (let i = 0; i < centroids.length; i++) {
          const dist = 1 - this.cosineSimilarity(memory.embedding, centroids[i]);
          if (dist < minDist) {
            minDist = dist;
            nearestCluster = i;
          }
        }
        
        assignments[nearestCluster].push(memory);
      }

      // Update centroids
      let changed = false;
      for (let i = 0; i < k; i++) {
        if (assignments[i].length === 0) continue;
        
        const newCentroid = this.computeCentroid(
          assignments[i].map(m => m.embedding!).filter(e => e)
        );
        
        const oldCentroid = centroids[i];
        const similarity = this.cosineSimilarity(newCentroid, oldCentroid);
        
        if (similarity < 0.95) {
          changed = true;
          centroids[i] = newCentroid;
        }
      }

      if (!changed) {
        break;
      }

      iterations++;
    }

    // Create final clusters
    const finalAssignments: MemoryData[][] = Array(k).fill(null).map(() => []);
    for (const memory of memories) {
      if (!memory.embedding) continue;
      
      let minDist = Infinity;
      let nearestCluster = 0;
      
      for (let i = 0; i < centroids.length; i++) {
        const dist = 1 - this.cosineSimilarity(memory.embedding, centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          nearestCluster = i;
        }
      }
      
      finalAssignments[nearestCluster].push(memory);
    }

    // Build cluster objects
    clusters = [];
    for (let i = 0; i < k; i++) {
      if (finalAssignments[i].length === 0) continue;
      
      const clusterMemories = finalAssignments[i];
      clusterMemories.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      clusters.push({
        id: `cluster_${i}`,
        memories: clusterMemories,
        centroid: centroids[i],
        topic: '', // Will be filled later
        startDate: clusterMemories[0].created_at,
        endDate: clusterMemories[clusterMemories.length - 1].created_at,
        sentiment: clusterMemories.reduce((sum, m) => sum + (m.sentiment ?? 0), 0) / clusterMemories.length,
      });
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
   * Extract topic from cluster of memories
   */
  private async extractTopic(memories: MemoryData[]): Promise<string> {
    // Use most common tags/topics
    const topicCounts = new Map<string, number>();
    
    for (const memory of memories) {
      for (const topic of memory.topics || []) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }

    if (topicCounts.size > 0) {
      const sorted = Array.from(topicCounts.entries())
        .sort((a, b) => b[1] - a[1]);
      return sorted[0][0];
    }

    // Fallback: use first few words of first memory
    if (memories.length > 0) {
      const words = memories[0].text.split(/\s+/).slice(0, 3);
      return words.join(' ');
    }

    return 'Untitled Arc';
  }

  /**
   * Detect arc boundaries based on sentiment/topic shifts
   */
  private detectArcBoundaries(clusters: MemoryCluster[], memories: MemoryData[]): ArcData[] {
    const arcs: ArcData[] = [];

    for (const cluster of clusters) {
      if (cluster.memories.length < 2) {
        continue;
      }

      // Detect if this cluster represents a distinct arc
      const sentimentShift = this.detectSentimentShift(cluster.memories);
      const topicShift = this.detectTopicShift(cluster.memories);

      if (sentimentShift || topicShift || cluster.memories.length >= 5) {
        arcs.push({
          id: cluster.id,
          label: cluster.topic || 'Untitled Arc',
          summary: this.generateArcSummary(cluster.memories),
          start_date: cluster.startDate,
          end_date: cluster.endDate,
          color: this.getArcColor(cluster.sentiment),
        });
      }
    }

    return arcs;
  }

  /**
   * Detect sentiment shift within cluster
   */
  private detectSentimentShift(memories: MemoryData[]): boolean {
    if (memories.length < 3) {
      return false;
    }

    const sentiments = memories.map(m => m.sentiment ?? 0);
    const firstHalf = sentiments.slice(0, Math.floor(sentiments.length / 2));
    const secondHalf = sentiments.slice(Math.floor(sentiments.length / 2));

    const firstAvg = firstHalf.reduce((sum, s) => sum + s, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, s) => sum + s, 0) / secondHalf.length;

    return Math.abs(secondAvg - firstAvg) > 0.3;
  }

  /**
   * Detect topic shift within cluster
   */
  private detectTopicShift(memories: MemoryData[]): boolean {
    if (memories.length < 3) {
      return false;
    }

    const firstHalf = memories.slice(0, Math.floor(memories.length / 2));
    const secondHalf = memories.slice(Math.floor(memories.length / 2));

    const firstTopics = new Set(firstHalf.flatMap(m => m.topics || []));
    const secondTopics = new Set(secondHalf.flatMap(m => m.topics || []));

    // Compute overlap
    const overlap = Array.from(firstTopics).filter(t => secondTopics.has(t)).length;
    const total = new Set([...firstTopics, ...secondTopics]).size;

    return total > 0 && overlap / total < 0.4; // Less than 40% overlap
  }

  /**
   * Generate arc summary
   */
  private generateArcSummary(memories: MemoryData[]): string {
    if (memories.length === 0) {
      return '';
    }

    // Use most common topics
    const topicCounts = new Map<string, number>();
    for (const memory of memories) {
      for (const topic of memory.topics || []) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }

    const topTopics = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([topic]) => topic);

    return `Arc focused on: ${topTopics.join(', ')}`;
  }

  /**
   * Get arc color based on sentiment
   */
  private getArcColor(sentiment: number): string {
    if (sentiment > 0.3) {
      return '#10b981'; // Green
    } else if (sentiment < -0.3) {
      return '#ef4444'; // Red
    } else {
      return '#6b7280'; // Gray
    }
  }

  /**
   * Generate saga labels (store in arcs table)
   */
  private async generateSagaLabels(arcs: ArcData[], userId: string): Promise<ArcData[]> {
    // Group arcs into sagas (temporal proximity)
    const sagas: ArcData[][] = [];
    const sortedArcs = [...arcs].sort((a, b) =>
      new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );

    let currentSaga: ArcData[] = [];
    for (const arc of sortedArcs) {
      if (currentSaga.length === 0) {
        currentSaga.push(arc);
      } else {
        const lastArc = currentSaga[currentSaga.length - 1];
        const gap = new Date(arc.start_date).getTime() - new Date(lastArc.end_date || lastArc.start_date).getTime();
        const gapDays = gap / (1000 * 60 * 60 * 24);

        if (gapDays < 30) {
          // Same saga
          currentSaga.push(arc);
        } else {
          // New saga
          sagas.push(currentSaga);
          currentSaga = [arc];
        }
      }
    }
    if (currentSaga.length > 0) {
      sagas.push(currentSaga);
    }

    // Store arcs in database
    for (const arc of arcs) {
      try {
        await supabaseAdmin
          .from('arcs')
          .upsert({
            id: arc.id,
            user_id: userId,
            label: arc.label,
            summary: arc.summary,
            start_date: arc.start_date,
            end_date: arc.end_date,
            color: arc.color,
          }, {
            onConflict: 'id'
          });
      } catch (error) {
        logger.error({ error, arcId: arc.id }, 'Error storing arc');
      }
    }

    // Generate saga labels
    const sagaLabels: ArcData[] = [];
    for (let i = 0; i < sagas.length; i++) {
      const saga = sagas[i];
      const sagaLabel = `Saga ${i + 1}: ${saga[0].label}`;
      
      sagaLabels.push({
        id: `saga_${i}`,
        label: sagaLabel,
        summary: `${saga.length} arcs spanning ${this.getTimeSpan(saga.map(a => ({ created_at: a.start_date })))} days`,
        start_date: saga[0].start_date,
        end_date: saga[saga.length - 1].end_date || saga[saga.length - 1].start_date,
        color: saga[0].color,
      });
    }

    return sagaLabels;
  }

  /**
   * Create timeline bands for visualization
   */
  private createTimelineBands(arcs: ArcData[]): Array<{ date: string; intensity: number; arc: string }> {
    const bands: Array<{ date: string; intensity: number; arc: string }> = [];

    for (const arc of arcs) {
      const start = new Date(arc.start_date);
      const end = arc.end_date ? new Date(arc.end_date) : new Date();
      const duration = end.getTime() - start.getTime();
      const days = Math.max(1, duration / (1000 * 60 * 60 * 24));

      // Add points along the arc
      const points = Math.min(10, Math.max(2, Math.floor(days / 7))); // Weekly points
      for (let i = 0; i <= points; i++) {
        const date = new Date(start.getTime() + (duration * i / points));
        bands.push({
          date: date.toISOString(),
          intensity: 1 - (i / points) * 0.3, // Slight decay
          arc: arc.label,
        });
      }
    }

    return bands.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  /**
   * Compute average arc duration in days
   */
  private computeAverageArcDuration(arcs: ArcData[]): number {
    if (arcs.length === 0) {
      return 0;
    }

    const durations = arcs.map(arc => {
      const start = new Date(arc.start_date);
      const end = arc.end_date ? new Date(arc.end_date) : new Date();
      return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    });

    return durations.reduce((sum, d) => sum + d, 0) / durations.length;
  }

  /**
   * Get time span in days
   */
  private getTimeSpan(memories: Array<{ created_at: string }>): number {
    if (memories.length < 2) {
      return 0;
    }

    const sorted = [...memories].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const start = new Date(sorted[0].created_at);
    const end = new Date(sorted[sorted.length - 1].created_at);
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  }

  /**
   * Generate insights
   */
  private generateArcInsights(arcs: ArcData[]): Array<{ text: string; category: string; score: number }> {
    if (arcs.length === 0) {
      return [];
    }

    const longestArc = arcs.reduce((longest, arc) => {
      const duration = arc.end_date
        ? (new Date(arc.end_date).getTime() - new Date(arc.start_date).getTime()) / (1000 * 60 * 60 * 24)
        : 0;
      const longestDuration = longest.end_date
        ? (new Date(longest.end_date).getTime() - new Date(longest.start_date).getTime()) / (1000 * 60 * 60 * 24)
        : 0;
      return duration > longestDuration ? arc : longest;
    }, arcs[0]);

    return [
      {
        text: `Detected ${arcs.length} narrative arcs. "${longestArc.label}" is your longest arc.`,
        category: 'arc_detection',
        score: arcs.length / 10, // Normalize
      },
    ];
  }

  private generateSagaInsights(sagas: ArcData[]): Array<{ text: string; category: string; score: number }> {
    if (sagas.length === 0) {
      return [];
    }

    return [
      {
        text: `Your life story contains ${sagas.length} major saga${sagas.length > 1 ? 's' : ''}, each representing a distinct chapter.`,
        category: 'saga_detection',
        score: sagas.length / 5, // Normalize
      },
    ];
  }

  private generateSummary(arcs: ArcData[], sagas: ArcData[], memories: MemoryData[]): string {
    const avgDuration = this.computeAverageArcDuration(arcs);
    const timeSpan = this.getTimeSpan(memories);

    let summary = `Your narrative contains ${arcs.length} distinct arcs organized into ${sagas.length} saga${sagas.length > 1 ? 's' : ''}. `;
    summary += `Arcs average ${avgDuration.toFixed(1)} days in duration, spanning ${timeSpan.toFixed(0)} days total. `;
    
    if (arcs.length > 0) {
      const positiveArcs = arcs.filter(a => {
        // Determine if arc is positive based on color or other metrics
        return a.color === '#10b981';
      }).length;
      
      summary += `${positiveArcs} arc${positiveArcs !== 1 ? 's are' : ' is'} marked as positive.`;
    }

    return summary;
  }

  private emptyPayload(): AnalyticsPayload {
    return {
      metrics: {},
      charts: [],
      clusters: [],
      insights: [],
      summary: 'Not enough data to generate saga analytics.',
    };
  }
}

export const sagaEngineModule = new SagaEngineModule();

