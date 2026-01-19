import { logger } from '../../logger';
import { spawnPython } from '../../utils/pythonBridge';

import type { Habit, HabitInsight } from './types';

/**
 * Clusters habits using Python analytics
 */
export class HabitClusterer {
  /**
   * Cluster habits
   */
  async cluster(habits: Habit[]): Promise<HabitInsight[]> {
    try {
      if (habits.length === 0) {
        return [];
      }

      // Use Python bridge for clustering
      const result = await spawnPython('habits.clustering:cluster', {
        habits: habits.map(h => ({
          id: h.id,
          action: h.action,
          category: h.category,
          frequency: h.frequency,
          streak: h.streak,
        })),
      });

      // Convert Python results to HabitInsight format
      const insights: HabitInsight[] = [];

      if (result?.clusters && Array.isArray(result.clusters)) {
        for (const cluster of result.clusters) {
          // Update habit with cluster_id
          const habit = habits.find(h => h.id === cluster.habitId || h.id === cluster.habit_id);
          if (habit) {
            habit.cluster_id = cluster.cluster_id || cluster.clusterId;
          }

          insights.push({
            id: cluster.id || crypto.randomUUID(),
            type: 'cluster_assignment',
            message: cluster.message || `Habit "${cluster.habitId || cluster.habit_id}" assigned to cluster`,
            confidence: cluster.confidence || 0.6,
            timestamp: cluster.timestamp || new Date().toISOString(),
            habit_id: cluster.habitId || cluster.habit_id,
            metadata: {
              cluster_id: cluster.cluster_id || cluster.clusterId,
              python_cluster: cluster,
            },
          });
        }
      }

      logger.debug({ habits: habits.length, clusters: insights.length }, 'Clustered habits');

      return insights;
    } catch (error) {
      logger.error({ error }, 'Failed to cluster habits');
      // Return basic clustering based on category
      return this.fallbackClustering(habits);
    }
  }

  /**
   * Fallback clustering when Python is unavailable
   */
  private fallbackClustering(habits: Habit[]): HabitInsight[] {
    const insights: HabitInsight[] = [];
    const categoryMap = new Map<string, number>();

    for (const habit of habits) {
      const category = habit.category || 'other';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, categoryMap.size);
      }

      const clusterId = `cluster_${categoryMap.get(category)}`;
      habit.cluster_id = clusterId;

      insights.push({
        id: crypto.randomUUID(),
        type: 'cluster_assignment',
        message: `Habit "${habit.action}" assigned to ${category} cluster`,
        confidence: 0.5,
        timestamp: new Date().toISOString(),
        habit_id: habit.id || '',
        metadata: {
          cluster_id: clusterId,
          category,
          method: 'fallback',
        },
      });
    }

    return insights;
  }
}


