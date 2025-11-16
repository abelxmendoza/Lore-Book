import { addDays, differenceInCalendarDays, parseISO } from 'date-fns';
import { v4 as uuid } from 'uuid';

import { config } from '../config';
import { logger } from '../logger';
import type {
  TaskCategory,
  TaskEvent,
  TaskIntent,
  TaskRecord,
  TaskSource,
  TaskStatus
} from '../types';
import { supabaseAdmin } from './supabaseClient';

type TaskInput = {
  title: string;
  description?: string;
  category?: TaskCategory;
  intent?: TaskIntent;
  source?: TaskSource;
  status?: TaskStatus;
  dueDate?: string | null;
  priority?: number;
  metadata?: Record<string, unknown>;
  externalId?: string | null;
  externalSource?: string | null;
};

type ChatExtraction = {
  created: TaskRecord[];
  commands: string[];
};

type ListFilters = {
  status?: TaskStatus;
  limit?: number;
};

const CATEGORY_KEYWORDS: Record<TaskCategory, string[]> = {
  robotics: ['robot', 'jetson', 'pi', 'nano', 'code', 'build', 'firmware', 'sensor', 'deploy'],
  finance: ['pay', 'budget', 'debt', 'card', 'chase', 'discover', 'invoice', 'tax'],
  fitness: ['lift', 'bjj', 'muay', 'train', 'cardio', 'run', 'weight', 'gym'],
  school: ['lesson', 'kanji', 'homework', 'class', 'study', 'assignment', 'japanese'],
  home: ['house', 'mom', 'family', 'kitchen', 'clean', 'yard'],
  content: ['youtube', 'content', 'video', 'edit', 'post', 'omega technologies', 'newsletter'],
  work: ['work', 'project', 'client', 'armstrong', 'serve'],
  admin: []
};

const IMPACT_BY_CATEGORY: Partial<Record<TaskCategory, number>> = {
  robotics: 3,
  finance: 3,
  fitness: 3,
  work: 3,
  school: 2,
  home: 2,
  content: 2,
  admin: 1
};

class TaskEngineService {
  private detectDueDate(text?: string | null): string | null {
    if (!text) return null;
    const normalized = text.toLowerCase();
    const now = new Date();

    if (normalized.includes('today')) return now.toISOString();
    if (normalized.includes('tomorrow')) return addDays(now, 1).toISOString();
    if (normalized.includes('next week')) return addDays(now, 7).toISOString();
    if (normalized.includes('next month')) return addDays(now, 30).toISOString();

    const dateMatch = normalized.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      try {
        return parseISO(dateMatch[1]).toISOString();
      } catch (error) {
        logger.warn({ error }, 'Unable to parse inline date');
      }
    }
    return null;
  }

  private detectCategory(text: string): TaskCategory {
    const normalized = text.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [TaskCategory, string[]][]) {
      if (keywords.some((keyword) => normalized.includes(keyword))) {
        return category;
      }
    }
    return 'admin';
  }

  private detectIntent(text: string): TaskIntent | null {
    const normalized = text.toLowerCase();
    if (/(learn|study|research|review)/.test(normalized)) return 'learn';
    if (/(build|ship|launch|create)/.test(normalized)) return 'build';
    if (/(fix|patch|repair)/.test(normalized)) return 'fix';
    if (/(buy|order|purchase)/.test(normalized)) return 'buy';
    if (/(plan|schedule|organize|prep)/.test(normalized)) return 'plan';
    if (/(call|email|text|reach out|ping|contact)/.test(normalized)) return 'contact';
    return null;
  }

  private detectEffort(text?: string): number {
    if (!text) return 0;
    const normalized = text.toLowerCase();
    if (/(write|draft|implement|deploy|rebuild|debug|refactor)/.test(normalized)) return 2;
    if (/(set up|configure|email|call|review|prep)/.test(normalized)) return 1;
    return 0;
  }

  private scorePriority(
    category: TaskCategory,
    dueDate?: string | null,
    intent?: TaskIntent | null,
    effort = 0,
    priorityOverride?: number | null
  ) {
    const impact = IMPACT_BY_CATEGORY[category] ?? 1;
    let urgency = 1;
    if (dueDate) {
      const now = new Date();
      const due = parseISO(dueDate);
      const diff = differenceInCalendarDays(due, now);
      if (diff <= 1) urgency = 3;
      else if (diff <= 7) urgency = 2;
      else if (diff > 30) urgency = 0;
    }

    const intentBoost = intent === 'contact' || intent === 'plan' ? 1 : 0;
    const computed = Math.min(8, Math.max(1, urgency + impact + effort + intentBoost));
    const priority = priorityOverride ? Math.min(8, Math.max(1, priorityOverride)) : computed;

    return { priority, urgency, impact, effort };
  }

  private async recordEvent(userId: string, taskId: string, event_type: string, description: string, metadata?: object) {
    const payload: TaskEvent = {
      id: uuid(),
      user_id: userId,
      task_id: taskId,
      event_type,
      description,
      created_at: new Date().toISOString(),
      metadata: metadata ?? {}
    };

    const { error } = await supabaseAdmin.from('task_events').insert(payload);
    if (error) {
      logger.warn({ error }, 'Failed to record task event');
    }
  }

  async listTasks(userId: string, filters: ListFilters = {}): Promise<TaskRecord[]> {
    let query = supabaseAdmin.from('tasks').select('*').eq('user_id', userId);
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    const { data, error } = await query.order('priority', { ascending: false }).order('due_date', { ascending: true }).limit(
      filters.limit ?? 50
    );
    if (error) {
      logger.error({ error }, 'Failed to list tasks');
      throw error;
    }
    return data as TaskRecord[];
  }

  async createTask(userId: string, input: TaskInput): Promise<TaskRecord> {
    const category = input.category ?? this.detectCategory(input.title + ' ' + (input.description ?? ''));
    const intent = input.intent ?? this.detectIntent(input.title + ' ' + (input.description ?? ''));
    const dueDate = input.dueDate ?? this.detectDueDate(input.title + ' ' + (input.description ?? ''));
    const effort = this.detectEffort(input.description ?? input.title);
    const scores = this.scorePriority(category, dueDate, intent, effort, input.priority ?? null);

    const task: TaskRecord = {
      id: uuid(),
      user_id: userId,
      title: input.title.trim(),
      description: input.description ?? null,
      category,
      intent: intent ?? null,
      source: input.source ?? 'manual',
      status: input.status ?? 'incomplete',
      due_date: dueDate,
      priority: scores.priority,
      urgency: scores.urgency,
      impact: scores.impact,
      effort: scores.effort,
      external_id: input.externalId ?? null,
      external_source: input.externalSource ?? null,
      metadata: input.metadata ?? {}
    };

    const { error } = await supabaseAdmin.from('tasks').insert(task);
    if (error) {
      logger.error({ error }, 'Failed to create task');
      throw error;
    }

    await this.recordEvent(userId, task.id, 'created', `Task created: ${task.title}`, { source: task.source });
    return task;
  }

  async updateTask(userId: string, taskId: string, updates: Partial<TaskInput>): Promise<TaskRecord | null> {
    const dueDate = updates.dueDate ?? this.detectDueDate(updates.description ?? updates.title ?? '');
    const category = updates.category ?? (updates.title ? this.detectCategory(updates.title) : undefined);
    const intent = updates.intent ?? (updates.title ? this.detectIntent(updates.title) : undefined);
    const scores = category
      ? this.scorePriority(
          category,
          dueDate,
          intent ?? null,
          this.detectEffort(updates.description ?? updates.title ?? ''),
          updates.priority ?? null
        )
      : null;

    const payload: Record<string, unknown> = {
      ...('title' in updates ? { title: updates.title } : {}),
      ...('description' in updates ? { description: updates.description ?? null } : {}),
      ...('status' in updates ? { status: updates.status } : {}),
      ...('category' in updates ? { category } : {}),
      ...('intent' in updates ? { intent: intent ?? null } : {}),
      ...('dueDate' in updates ? { due_date: dueDate } : {}),
      ...('priority' in updates
        ? { priority: updates.priority ? Math.min(8, Math.max(1, updates.priority)) : undefined }
        : {}),
      ...('metadata' in updates ? { metadata: updates.metadata ?? {} } : {}),
      updated_at: new Date().toISOString()
    };

    if (scores) {
      Object.assign(payload, scores);
    }

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update(payload)
      .eq('user_id', userId)
      .eq('id', taskId)
      .select('*')
      .single();

    if (error) {
      logger.error({ error }, 'Failed to update task');
      throw error;
    }

    if (data) {
      await this.recordEvent(userId, taskId, 'updated', `Task updated: ${data.title}`, payload);
    }

    return data as TaskRecord;
  }

  async completeTask(userId: string, taskId: string): Promise<TaskRecord | null> {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', taskId)
      .select('*')
      .single();

    if (error) {
      logger.error({ error }, 'Failed to complete task');
      throw error;
    }

    if (data) {
      await this.recordEvent(userId, taskId, 'completed', `Task completed: ${data.title}`);
    }

    return data as TaskRecord;
  }

  async deleteTask(userId: string, taskId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('tasks')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', taskId);
    if (error) {
      logger.error({ error }, 'Failed to delete task');
      throw error;
    }
    await this.recordEvent(userId, taskId, 'deleted', 'Task archived');
  }

  private parseCandidates(message: string): TaskInput[] {
    const statements = message
      .split(/(?:\.|\n|,|;| and )/i)
      .map((part) => part.trim())
      .filter((part) => part.length > 3);

    const candidates: TaskInput[] = statements.map((statement) => {
      const category = this.detectCategory(statement);
      const intent = this.detectIntent(statement) ?? undefined;
      const dueDate = this.detectDueDate(statement);
      return {
        title: statement.charAt(0).toUpperCase() + statement.slice(1),
        category,
        intent: intent ?? undefined,
        dueDate,
        source: 'chat',
        status: 'incomplete'
      };
    });

    return candidates;
  }

  async handleChatMessage(userId: string, message: string): Promise<ChatExtraction> {
    const candidates = this.parseCandidates(message);
    const created: TaskRecord[] = [];
    for (const candidate of candidates) {
      const task = await this.createTask(userId, candidate);
      created.push(task);
    }

    const commands = await this.applyQuickCommands(userId, message);
    return { created, commands };
  }

  private async applyQuickCommands(userId: string, message: string): Promise<string[]> {
    const normalized = message.toLowerCase();
    const commands: string[] = [];

    if (/(mark|set).*done/.test(normalized) || /complete/.test(normalized)) {
      const titleMatch = normalized.match(/(?:complete|done)\s+(.+)/);
      if (titleMatch?.[1]) {
        const title = titleMatch[1].trim();
        const task = await this.findClosestTask(userId, title);
        if (task) {
          await this.completeTask(userId, task.id);
          commands.push(`Marked ${task.title} as done`);
        }
      }
    }

    if (/push|delay|move/.test(normalized) && /tomorrow/.test(normalized)) {
      const titleMatch = normalized.match(/(?:push|move|delay)\s+(.+)\s+to/);
      if (titleMatch?.[1]) {
        const title = titleMatch[1].trim();
        const task = await this.findClosestTask(userId, title);
        if (task) {
          await this.updateTask(userId, task.id, { dueDate: addDays(new Date(), 1).toISOString() });
          commands.push(`Moved ${task.title} to tomorrow`);
        }
      }
    }

    return commands;
  }

  private async findClosestTask(userId: string, title: string): Promise<TaskRecord | null> {
    const tasks = await this.listTasks(userId, { status: 'incomplete', limit: 100 });
    const normalized = title.toLowerCase();
    const directMatch = tasks.find((task) => task.title.toLowerCase().includes(normalized));
    if (directMatch) return directMatch;
    return tasks[0] ?? null;
  }

  async getEvents(userId: string, limit = 50): Promise<TaskEvent[]> {
    const { data, error } = await supabaseAdmin
      .from('task_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error }, 'Failed to fetch task events');
      throw error;
    }

    return (data as TaskEvent[]) ?? [];
  }

  async syncMicrosoftTasks(userId: string, accessToken: string, listId?: string) {
    if (!accessToken) {
      throw new Error('Microsoft access token is required');
    }

    const baseHeaders = { Authorization: `Bearer ${accessToken}` };
    const listUrl = listId
      ? `https://graph.microsoft.com/v1.0/me/todo/lists/${listId}/tasks`
      : 'https://graph.microsoft.com/v1.0/me/todo/lists';

    const listsResponse = await fetch(listUrl, { headers: baseHeaders });
    if (!listsResponse.ok) {
      const text = await listsResponse.text();
      logger.error({ status: listsResponse.status, text }, 'Failed to fetch Microsoft To Do lists/tasks');
      throw new Error('Unable to fetch Microsoft To Do tasks');
    }

    const listPayload = await listsResponse.json();
    const rawTasks: any[] = listId ? listPayload.value ?? [] : [];
    let tasksToImport: any[] = rawTasks;

    if (!listId) {
      const lists = listPayload.value ?? [];
      tasksToImport = [];
      for (const list of lists) {
        const tasksResponse = await fetch(`https://graph.microsoft.com/v1.0/me/todo/lists/${list.id}/tasks`, {
          headers: baseHeaders
        });
        if (!tasksResponse.ok) continue;
        const tasksJson = await tasksResponse.json();
        tasksToImport.push(
          ...(tasksJson.value ?? []).map((task: any) => ({
            ...task,
            listId: list.id,
            listTitle: list.displayName
          }))
        );
      }
    }

    let imported = 0;
    for (const remoteTask of tasksToImport) {
      const title: string = remoteTask.title ?? 'Untitled task';
      const dueDate: string | null = remoteTask.dueDateTime?.dateTime ? new Date(remoteTask.dueDateTime.dateTime).toISOString() : null;
      const externalId: string | null = remoteTask.id ?? null;

      try {
        await this.createTask(userId, {
          title,
          description: remoteTask.body?.content,
          source: 'microsoft',
          dueDate,
          externalId,
          externalSource: 'microsoft',
          metadata: { listId: remoteTask.listId, listTitle: remoteTask.listTitle }
        });
        imported += 1;
      } catch (error) {
        logger.warn({ error }, 'Failed to import individual Microsoft To Do task');
      }
    }

    await supabaseAdmin
      .from('task_sync_state')
      .upsert({
        user_id: userId,
        provider: 'microsoft',
        status: 'ok',
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: { last_count: imported }
      });

    return { imported, total: tasksToImport.length };
  }

  async runScheduledSync() {
    const { data, error } = await supabaseAdmin
      .from('task_sync_state')
      .select('*')
      .eq('provider', 'microsoft')
      .neq('status', 'disabled');

    if (error) {
      logger.warn({ error }, 'Failed to load task sync state');
      return;
    }

    for (const state of data ?? []) {
      const accessToken = (state.metadata as { accessToken?: string } | null)?.accessToken;
      if (!accessToken) continue;
      try {
        await this.syncMicrosoftTasks(state.user_id, accessToken);
      } catch (syncError) {
        logger.warn({ syncError }, 'Scheduled Microsoft sync failed');
      }
    }
  }

  getMicrosoftAuthUrl() {
    if (!config.microsoftClientId || !config.microsoftRedirectUri) return null;
    const params = new URLSearchParams({
      client_id: config.microsoftClientId,
      response_type: 'code',
      redirect_uri: config.microsoftRedirectUri,
      response_mode: 'query',
      scope: 'Tasks.Read Tasks.ReadWrite User.Read',
      state: 'lorekeeper-task-engine'
    });
    const tenant = config.microsoftTenantId || 'common';
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
  }
}

export const taskEngineService = new TaskEngineService();
