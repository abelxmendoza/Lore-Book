import { v4 as uuid } from 'uuid';

import { logger } from '../logger';
import type { TaskMemoryBridge, TaskRecord, TimelineEvent } from '../types';

import { supabaseAdmin } from './supabaseClient';

export type TimelineEventInput = {
  title: string;
  description?: string;
  tags?: string[];
  occurredAt?: string;
  taskId?: string;
  context?: Record<string, unknown>;
};

class TaskTimelineService {
  async createEvent(userId: string, input: TimelineEventInput): Promise<TimelineEvent> {
    const event: TimelineEvent = {
      id: uuid(),
      user_id: userId,
      task_id: input.taskId ?? null,
      title: input.title.trim(),
      description: input.description ?? null,
      tags: input.tags ?? [],
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      context: input.context ?? {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin.from('timeline_events').insert(event).select('*').single();
    if (error) {
      logger.error({ error, event }, 'Failed to create timeline event');
      throw error;
    }

    return data as TimelineEvent;
  }

  async createBridge(
    userId: string,
    taskId: string,
    timelineEventId: string,
    bridgeType: string,
    metadata?: Record<string, unknown>
  ): Promise<TaskMemoryBridge> {
    const bridge: TaskMemoryBridge = {
      id: uuid(),
      user_id: userId,
      task_id: taskId,
      timeline_event_id: timelineEventId,
      bridge_type: bridgeType,
      journal_entry_id: null,
      metadata: metadata ?? {},
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin.from('task_memory_bridges').insert(bridge).select('*').single();
    if (error) {
      logger.error({ error, bridge }, 'Failed to create task memory bridge');
      throw error;
    }

    return data as TaskMemoryBridge;
  }

  async linkTaskCreation(userId: string, task: TaskRecord) {
    try {
      const event = await this.createEvent(userId, {
        title: task.title,
        description: task.description ?? undefined,
        tags: ['task', 'new', task.category, task.intent ?? undefined].filter(Boolean) as string[],
        occurredAt: task.due_date ?? undefined,
        taskId: task.id,
        context: {
          priority: task.priority,
          due_date: task.due_date,
          source: task.source,
          metadata: task.metadata
        }
      });

      await this.createBridge(userId, task.id, event.id, 'task_created', {
        intent: task.intent,
        category: task.category,
        due_date: task.due_date
      });

      return event;
    } catch (error) {
      logger.warn({ error }, 'Task was created but timeline bridge failed');
      return null;
    }
  }

  private buildCompletionReflection(task: TaskRecord): string {
    const dueHint = task.due_date ? ` (due ${new Date(task.due_date).toDateString()})` : '';
    const effortHint = task.effort >= 2 ? 'heavy-lift' : task.effort === 1 ? 'medium' : 'quick hit';
    const priorityHint = task.priority >= 6 ? 'high-priority' : task.priority >= 4 ? 'important' : 'low-friction';
    return `Completed ${task.title}${dueHint}. Category: ${task.category}. Effort: ${effortHint}. Priority: ${priorityHint}.`;
  }

  async linkTaskCompletion(userId: string, task: TaskRecord) {
    try {
      const reflection = this.buildCompletionReflection(task);
      const event = await this.createEvent(userId, {
        title: `Completed: ${task.title}`,
        description: reflection,
        tags: ['task', 'completed', task.category],
        occurredAt: new Date().toISOString(),
        taskId: task.id,
        context: {
          status: task.status,
          due_date: task.due_date,
          priority: task.priority,
          reflection
        }
      });

      await this.createBridge(userId, task.id, event.id, 'task_completed', {
        reflection,
        category: task.category,
        priority: task.priority
      });

      return { event, reflection };
    } catch (error) {
      logger.warn({ error }, 'Task completion recorded without timeline bridge');
      return null;
    }
  }

  async getRecentEvents(userId: string, limit = 25): Promise<TimelineEvent[]> {
    const { data, error } = await supabaseAdmin
      .from('timeline_events')
      .select('*')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error }, 'Failed to fetch task timeline events');
      throw error;
    }

    return (data as TimelineEvent[]) ?? [];
  }
}

export const taskTimelineService = new TaskTimelineService();
