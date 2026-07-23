import { logger } from '../../logger';

import { goalCognitionEngine } from './goalCognitionEngine';
import type { Goal, GoalContext, GoalStatus } from './types';

/**
 * Extracts goals from journal entries, tasks, arcs, and timeline
 */
export class GoalExtractor {
  /**
   * Extract goals from all sources
   */
  extract(ctx: GoalContext): Goal[] {
    const goals: Goal[] = [];

    try {
      // Extract from journal entries
      const fromEntries = this.fromEntries(ctx.entries || []);
      goals.push(...fromEntries);

      // Extract from tasks
      const fromTasks = this.fromTasks(ctx.tasks || ctx.continuity?.tasks || []);
      goals.push(...fromTasks);

      // Extract from arcs
      const fromArcs = this.fromArcs(ctx.arcs || []);
      goals.push(...fromArcs);

      // Merge duplicates
      const merged = this.mergeDuplicates(goals);

      logger.debug({ goals: merged.length }, 'Extracted goals');

      return merged;
    } catch (error) {
      logger.error({ error }, 'Failed to extract goals');
      return [];
    }
  }

  /**
   * Extract goals from journal entries
   */
  private fromEntries(entries: any[]): Goal[] {
    const goals: Goal[] = [];

    for (const entry of entries) {
      const content = entry.content || '';
      const cognition = goalCognitionEngine.evaluate({
        ownerEntityId: entry.user_id ?? 'unknown-user',
        sourceText: content,
        proposedTitle: entry.title,
        proposedKind: 'QUEST',
        sourceMessageId: entry.id,
        sourceType: 'journal',
        authorRole: 'user',
        now: new Date(entry.date || entry.created_at || Date.now()),
      });

      if (cognition.eligibility.eligible) {
        goals.push({
          id: `goal_entry_${entry.id}`,
          title: cognition.candidate.canonicalTitle,
          description: content,
          created_at: entry.date || entry.created_at,
          updated_at: entry.date || entry.updated_at,
          last_action_at: entry.date || entry.updated_at,
          status: 'active',
          source: 'entry',
          source_id: entry.id,
          metadata: {
            tags: entry.tags,
            sentiment: entry.sentiment,
            cognition: {
              kind: cognition.candidate.kind,
              temporal_state: cognition.candidate.temporalState,
              domain: cognition.candidate.domain,
              confidence: cognition.candidate.confidence,
              evidence: cognition.candidate.originalText,
            },
          },
        });
      }
    }

    return goals;
  }

  /**
   * Extract goals from tasks
   */
  private fromTasks(tasks: any[]): Goal[] {
    const goals: Goal[] = [];

    for (const task of tasks) {
      // Only include tasks that seem like goals (not simple todos)
      const isGoal = task.isGoal || task.type === 'goal';

      if (isGoal) {
        goals.push({
          id: `goal_task_${task.id}`,
          title: task.title || task.name,
          description: task.description || task.notes,
          created_at: task.created_at || task.createdAt,
          updated_at: task.updated_at || task.updatedAt,
          last_action_at: task.updated_at || task.updatedAt,
          status: this.mapTaskStatus(task.status),
          source: 'task',
          source_id: task.id,
          metadata: {
            task_status: task.status,
            due_date: task.due_date || task.dueDate,
          },
        });
      }
    }

    return goals;
  }

  /**
   * Extract goals from arcs
   */
  private fromArcs(arcs: any[]): Goal[] {
    const goals: Goal[] = [];

    for (const arc of arcs) {
      // Filter arcs that are goal-oriented
      if (arc.type === 'goal' || arc.name?.toLowerCase().includes('goal')) {
        goals.push({
          id: `goal_arc_${arc.id}`,
          title: arc.name || arc.title,
          description: arc.summary || arc.description,
          created_at: arc.created_at || arc.createdAt,
          updated_at: arc.updated_at || arc.updatedAt,
          last_action_at: arc.updated_at || arc.updatedAt,
          status: 'active',
          source: 'arc',
          source_id: arc.id,
          metadata: {
            arc_type: arc.type,
          },
        });
      }
    }

    return goals;
  }

  /**
   * Merge duplicate goals
   */
  private mergeDuplicates(goals: Goal[]): Goal[] {
    const map = new Map<string, Goal>();

    for (const goal of goals) {
      const key = goal.title.toLowerCase().trim();
      
      if (!map.has(key)) {
        map.set(key, goal);
      } else {
        // Merge with existing goal (keep the one with more recent update)
        const existing = map.get(key)!;
        const existingDate = new Date(existing.updated_at);
        const newDate = new Date(goal.updated_at);
        
        if (newDate > existingDate) {
          // Update with newer goal, but preserve metadata
          map.set(key, {
            ...goal,
            metadata: {
              ...existing.metadata,
              ...goal.metadata,
              merged_from: [...(existing.metadata?.merged_from || []), existing.id],
            },
          });
        } else {
          // Keep existing, but add to merged_from
          existing.metadata = {
            ...existing.metadata,
            merged_from: [...(existing.metadata?.merged_from || []), goal.id],
          };
        }
      }
    }

    return Array.from(map.values());
  }

  /**
   * Map task status to goal status
   */
  private mapTaskStatus(taskStatus?: string): GoalStatus {
    if (!taskStatus) return 'active';
    
    const statusMap: Record<string, GoalStatus> = {
      completed: 'completed',
      done: 'completed',
      cancelled: 'abandoned',
      abandoned: 'abandoned',
      paused: 'paused',
    };

    return statusMap[taskStatus.toLowerCase()] || 'active';
  }
}
