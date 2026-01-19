/**
 * Life Map Analytics Module
 * Combines all analytics into a global life story view
 */

import { logger } from '../../logger';

import { BaseAnalyticsModule } from './base';
import { identityPulseModule } from './identityPulse';
import { insightEngineModule } from './insightEngine';
import { memoryFabricModule } from './memoryFabric';
import { predictionEngineModule } from './predictionEngine';
import { relationshipAnalyticsModule } from './relationshipAnalytics';
import { sagaEngineModule } from './sagaEngine';
import type { AnalyticsPayload, MemoryData } from './types';

interface TurningPoint {
  date: string;
  type: 'emotional' | 'arc_shift' | 'relationship' | 'identity';
  description: string;
  significance: number;
}

export class LifeMapModule extends BaseAnalyticsModule {
  protected readonly moduleType = 'life_map' as const;

  async run(userId: string): Promise<AnalyticsPayload> {
    const cached = await this.getCachedResult(userId);
    if (cached) {
      return cached;
    }

    // Fetch all analytics modules (they use their own cache)
    const [
      identity,
      relationships,
      saga,
      fabric,
      insights,
      predictions,
    ] = await Promise.all([
      identityPulseModule.run(userId).catch(() => null),
      relationshipAnalyticsModule.run(userId).catch(() => null),
      sagaEngineModule.run(userId).catch(() => null),
      memoryFabricModule.run(userId).catch(() => null),
      insightEngineModule.run(userId).catch(() => null),
      predictionEngineModule.run(userId).catch(() => null),
    ]);

    const memories = await this.fetchMemories(userId);

    // Detect turning points
    const turningPoints = this.detectTurningPoints(memories, identity, saga, relationships);

    // Build global graph
    const lifeGraph = this.buildLifeGraph(identity, relationships, saga, fabric);

    // Generate master summary
    const masterSummary = this.generateMasterSummary(
      identity,
      relationships,
      saga,
      insights,
      predictions,
      turningPoints
    );

    const payload: AnalyticsPayload = {
      metrics: {
        totalMemories: memories.length,
        turningPoints: turningPoints.length,
        totalArcs: saga?.clusters?.length || 0,
        totalCharacters: relationships?.metrics?.totalCharacters || 0,
        currentLevel: 0, // Would come from XP module if integrated
        identityDrift: identity?.metrics?.driftScore || 0,
      },
      charts: [
        {
          type: 'line',
          title: 'Life Trajectory',
          data: this.buildTrajectoryData(identity, saga, memories),
          xAxis: 'date',
          yAxis: 'value',
        },
      ],
      graph: lifeGraph,
      insights: [
        ...(identity?.insights || []).slice(0, 2),
        ...(relationships?.insights || []).slice(0, 2),
        ...(saga?.insights || []).slice(0, 2),
        ...(insights?.insights || []).slice(0, 2),
        ...(predictions?.insights || []).slice(0, 2),
        ...turningPoints.map(tp => ({
          text: `Turning point: ${tp.description}`,
          category: 'turning_point',
          score: tp.significance,
        })),
      ],
      summary: masterSummary,
    };

    await this.cacheResult(userId, payload);
    return payload;
  }

  /**
   * Detect turning points from various analytics
   */
  private detectTurningPoints(
    memories: MemoryData[],
    identity: AnalyticsPayload | null,
    saga: AnalyticsPayload | null,
    relationships: AnalyticsPayload | null
  ): TurningPoint[] {
    const turningPoints: TurningPoint[] = [];

    if (memories.length < 5) {
      return turningPoints;
    }

    // Detect emotional turning points (significant sentiment shifts)
    const sentiments = memories.map(m => m.sentiment ?? 0);
    for (let i = 1; i < sentiments.length; i++) {
      const shift = Math.abs(sentiments[i] - sentiments[i - 1]);
      if (shift > 0.6) {
        turningPoints.push({
          date: memories[i].created_at,
          type: 'emotional',
          description: `Major emotional shift detected (${shift > 0 ? 'positive' : 'negative'})`,
          significance: Math.min(1, shift),
        });
      }
    }

    // Detect arc shifts from saga analytics
    if (saga?.clusters) {
      for (const arc of saga.clusters) {
        if (arc.members && arc.members.length > 0) {
          const firstMemory = memories.find(m => arc.members.includes(m.id));
          if (firstMemory) {
            turningPoints.push({
              date: firstMemory.created_at,
              type: 'arc_shift',
              description: `New arc: "${arc.label}"`,
              significance: 0.7,
            });
          }
        }
      }
    }

    // Detect identity drift from identity analytics
    if (identity?.metrics?.driftScore && identity.metrics.driftScore > 0.6) {
      const recentMemory = memories[memories.length - 1];
      turningPoints.push({
        date: recentMemory.created_at,
        type: 'identity',
        description: 'Significant identity evolution detected',
        significance: identity.metrics.driftScore,
      });
    }

    // Sort by date and limit
    return turningPoints
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-10); // Last 10 turning points
  }

  /**
   * Build global life graph combining all analytics
   */
  private buildLifeGraph(
    identity: AnalyticsPayload | null,
    relationships: AnalyticsPayload | null,
    saga: AnalyticsPayload | null,
    fabric: AnalyticsPayload | null
  ): { nodes: Array<{ id: string; label: string; type: string }>; edges: Array<{ source: string; target: string; weight: number; type: string }> } {
    const nodes: Array<{ id: string; label: string; type: string }> = [];
    const edges: Array<{ source: string; target: string; weight: number; type: string }> = [];

    // Add identity node
    if (identity) {
      nodes.push({
        id: 'identity',
        label: 'Identity',
        type: 'identity',
      });
    }

    // Add relationship nodes
    if (relationships?.graph?.nodes) {
      nodes.push(...relationships.graph.nodes);
      if (relationships.graph.edges) {
        edges.push(...relationships.graph.edges);
      }
    }

    // Add saga/arc nodes
    if (saga?.clusters) {
      for (const arc of saga.clusters) {
        nodes.push({
          id: arc.id,
          label: arc.label,
          type: 'arc',
        });
      }
    }

    // Add memory fabric nodes (sample)
    if (fabric?.graph?.nodes) {
      nodes.push(...fabric.graph.nodes.slice(0, 20)); // Limit to 20 for performance
      if (fabric.graph.edges) {
        edges.push(...fabric.graph.edges.slice(0, 50)); // Limit edges
      }
    }

    return { nodes, edges };
  }

  /**
   * Build trajectory data for chart
   */
  private buildTrajectoryData(
    identity: AnalyticsPayload | null,
    saga: AnalyticsPayload | null,
    memories: MemoryData[]
  ): Array<{ date: string; value: number }> {
    const trajectory: Array<{ date: string; value: number }> = [];

    // Use identity trajectory if available
    if (identity?.charts && identity.charts.length > 0) {
      const sentimentChart = identity.charts.find(c => c.title === 'Sentiment Trajectory');
      if (sentimentChart?.data) {
        return sentimentChart.data as Array<{ date: string; value: number }>;
      }
    }

    // Fallback: use raw sentiment
    for (const memory of memories) {
      trajectory.push({
        date: memory.created_at,
        value: memory.sentiment ?? 0,
      });
    }

    return trajectory;
  }

  /**
   * Generate master summary combining all analytics
   */
  private generateMasterSummary(
    identity: AnalyticsPayload | null,
    relationships: AnalyticsPayload | null,
    saga: AnalyticsPayload | null,
    insights: AnalyticsPayload | null,
    predictions: AnalyticsPayload | null,
    turningPoints: TurningPoint[]
  ): string {
    let summary = 'Your life map reveals a rich narrative. ';

    if (identity) {
      const driftScore = identity.metrics?.driftScore || 0;
      if (driftScore > 0.5) {
        summary += 'You\'re experiencing significant personal evolution. ';
      } else {
        summary += 'Your identity remains stable and grounded. ';
      }
    }

    if (relationships) {
      const totalChars = relationships.metrics?.totalCharacters || 0;
      summary += `Your relationship network includes ${totalChars} important people. `;
    }

    if (saga) {
      const totalArcs = saga.clusters?.length || 0;
      summary += `Your story contains ${totalArcs} distinct narrative arcs. `;
    }

    if (turningPoints.length > 0) {
      summary += `${turningPoints.length} significant turning points have shaped your journey. `;
    }

    if (insights) {
      const patterns = insights.metrics?.patterns || 0;
      if (patterns > 0) {
        summary += `${patterns} behavioral patterns have been identified. `;
      }
    }

    if (predictions) {
      const forecast = predictions.metrics?.forecastDays || 0;
      if (forecast > 0) {
        summary += `Looking ahead, your trajectory shows promise.`;
      }
    }

    return summary;
  }

  private emptyPayload(): AnalyticsPayload {
    return {
      metrics: {},
      charts: [],
      graph: { nodes: [], edges: [] },
      insights: [],
      summary: 'Not enough data to generate life map analytics.',
    };
  }
}

export const lifeMapModule = new LifeMapModule();
