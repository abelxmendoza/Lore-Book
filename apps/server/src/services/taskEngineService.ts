import { addDays, differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';
import { v4 as uuid } from 'uuid';

import { config } from '../config';
import { logger } from '../logger';
import type {
  TaskCategory,
  TaskEvent,
  TaskIntent,
  TaskRecord,
  TaskSource,
  TaskStatus,
  TaskSuggestion
} from '../types';
import { supabaseAdmin } from './supabaseClient';
import { taskTimelineService } from './taskTimelineService';

class TagTrieNode {
  children: Map<string, TagTrieNode> = new Map();
  isWord = false;
  word: string | null = null;
}

class TagTrie {
  private root = new TagTrieNode();

  insert(word: string) {
    let node = this.root;
    for (const char of word.toLowerCase()) {
      if (!node.children.has(char)) {
        node.children.set(char, new TagTrieNode());
      }
      node = node.children.get(char)!;
    }
    node.isWord = true;
    node.word = word.toLowerCase();
  }

  suggest(prefix: string, limit = 10): string[] {
    let node = this.root;
    for (const char of prefix.toLowerCase()) {
      const next = node.children.get(char);
      if (!next) return [];
      node = next;
    }

    const results: string[] = [];
    const stack: TagTrieNode[] = [node];
    while (stack.length && results.length < limit) {
      const current = stack.pop()!;
      if (current.isWord && current.word) {
        results.push(current.word);
      }
      for (const child of current.children.values()) {
        stack.push(child);
      }
    }
    return results;
  }
}

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

const TAG_KEYWORDS: Record<string, string[]> = {
  robotics: ['robot', 'jetson', 'ros', 'imu', 'lidar', 'servo', 'sensor'],
  personal: ['weekend', 'personal', 'errand', 'family', 'birthday', 'friends'],
  japanese: ['japanese', 'kanji', 'nihongo', 'grammar'],
  bjj: ['bjj', 'jiujitsu', 'jiu-jitsu', 'roll', 'grapple'],
  fitness: ['gym', 'train', 'cardio', 'lift', 'run'],
  finance: ['budget', 'invoice', 'tax', 'bill', 'payment'],
  work: ['client', 'deliverable', 'deploy', 'review'],
  school: ['assignment', 'homework', 'class', 'lesson'],
  content: ['video', 'edit', 'youtube', 'post']
};

class TaskEngineService {
  private tagTrie: TagTrie;

  constructor() {
    this.tagTrie = new TagTrie();
    this.bootstrapTagTrie();
  }

  private bootstrapTagTrie() {
    Object.keys(TAG_KEYWORDS).forEach((tag) => this.tagTrie.insert(tag));
    Object.values(TAG_KEYWORDS).forEach((keywords) => keywords.forEach((keyword) => this.tagTrie.insert(keyword)));
  }

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

  private suggestTags(text: string): string[] {
    const normalized = text.toLowerCase();
    const tags = new Set<string>();
    Object.entries(TAG_KEYWORDS).forEach(([tag, keywords]) => {
      if (keywords.some((keyword) => normalized.includes(keyword))) {
        tags.add(tag);
      }
    });

    if (/deadline|due|tomorrow|today|weekend/.test(normalized)) tags.add('time-sensitive');
    if (/robot|jetson/.test(normalized)) tags.add('robotics');
    if (/kanji|japanese/.test(normalized)) tags.add('japanese');
    if (/bjj|jiu/.test(normalized)) tags.add('bjj');
    if (/finance|budget|tax|invoice/.test(normalized)) tags.add('finance');
    if (/omega|season/.test(normalized)) tags.add('seasonal');

    const tokens = normalized.split(/\s+/);
    for (const token of tokens) {
      for (const suggestion of this.tagTrie.suggest(token, 5)) {
        if (suggestion.length >= 3) {
          tags.add(suggestion);
        }
      }
    }

    return Array.from(tags);
  }

  getTagSuggestions(prefix: string): string[] {
    return this.tagTrie.suggest(prefix, 10);
  }

  private computeConfidenceFromSignals(signals: Array<boolean | number>): number {
    const score = signals.reduce((acc, signal) => acc + (signal ? 1 : 0), 0);
    const max = signals.length || 1;
    return Math.min(1, Math.max(0.3, score / max));
  }

  private explainPriority(priority: number, components: Record<string, number>): string {
    const priorityLabel = priority >= 6 ? 'critical' : priority >= 4 ? 'important' : 'nice-to-have';
    const urgencyLabel = components.due_date_urgency >= 0.75 ? 'time-sensitive' : 'flexible';
    const impactLabel = components.category_weight >= 0.66 ? 'high-impact' : components.category_weight >= 0.33 ? 'moderate-impact' : 'low-impact';
    const effortLabel = components.task_complexity >= 0.66 ? 'heavy' : components.task_complexity >= 0.33 ? 'medium' : 'light';
    const recurrenceLabel = components.recurrence_factor > 0 ? 'recurring' : 'single-run';
    return `${priorityLabel}; ${urgencyLabel}; ${impactLabel}; effort=${effortLabel}; ${recurrenceLabel}`;
  }

  private scorePriority(
    category: TaskCategory,
    dueDate?: string | null,
    intent?: TaskIntent | null,
    effort = 0,
    priorityOverride?: number | null,
    metadata?: Record<string, unknown>
  ) {
    const weights = {
      due: 0.35,
      category: 0.25,
      streak: 0.15,
      complexity: 0.15,
      recurrence: 0.1
    } as const;

    const impact = IMPACT_BY_CATEGORY[category] ?? 1;
    let due_date_urgency = 0.2;
    if (dueDate) {
      const now = startOfDay(new Date());
      const due = startOfDay(parseISO(dueDate));
      const diff = differenceInCalendarDays(due, now);
      if (diff <= 1) due_date_urgency = 1;
      else if (diff <= 7) due_date_urgency = 0.75;
      else if (diff <= 30) due_date_urgency = 0.5;
      else due_date_urgency = 0.25;
    }

    const category_weight = Math.min(1, (impact || 1) / 3);
    const streak_factor = intent === 'build' || intent === 'learn' ? 0.8 : intent ? 0.6 : 0.4;
    const task_complexity = Math.min(1, effort / 3 + (intent === 'build' ? 0.2 : 0));
    const recurrence_factor = metadata && 'recurrence' in metadata ? 0.6 : 0.0;

    const weighted_score =
      weights.due * due_date_urgency +
      weights.category * category_weight +
      weights.streak * streak_factor +
      weights.complexity * task_complexity +
      weights.recurrence * recurrence_factor;

    const scaled = Math.round(weighted_score * 10);
    const priority = priorityOverride ? Math.min(8, Math.max(1, priorityOverride)) : Math.min(8, Math.max(1, scaled));

    const explanation = this.explainPriority(priority, {
      due_date_urgency,
      category_weight,
      streak_factor,
      task_complexity,
      recurrence_factor
    });

    return {
      priority,
      urgency: Math.round(due_date_urgency * 3),
      impact,
      effort,
      explanation,
      streak: streak_factor,
      recurrence: recurrence_factor,
      task_complexity
    };
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
    const scores = this.scorePriority(category, dueDate, intent, effort, input.priority ?? null, input.metadata ?? {});
    const suggestedTags = this.suggestTags(input.title + ' ' + (input.description ?? ''));
    const metadata = {
      ...(input.metadata ?? {}),
      suggested_tags: suggestedTags,
      priority_explanation: scores.explanation
    } as Record<string, unknown>;

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
      metadata
    };

    const { error } = await supabaseAdmin.from('tasks').insert(task);
    if (error) {
      logger.error({ error }, 'Failed to create task');
      throw error;
    }

    await this.recordEvent(userId, task.id, 'created', `Task created: ${task.title}`, { source: task.source });
    void taskTimelineService.linkTaskCreation(userId, task);
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
          updates.priority ?? null,
          updates.metadata ?? {}
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
      void taskTimelineService
        .linkTaskCompletion(userId, data as TaskRecord)
        .then((result) => {
          if (result?.reflection) {
            void this.recordEvent(userId, taskId, 'reflection', 'Task reflection logged', {
              reflection: result.reflection
            });
          }
        })
        .catch((linkError) => logger.warn({ linkError }, 'Task completion bridge failed'));
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

  private buildSuggestions(message: string): TaskSuggestion[] {
    const candidates = this.parseCandidates(message);
    return candidates.map((candidate) => {
      const intent = candidate.intent ?? this.detectIntent(candidate.title);
      const dueDate = candidate.dueDate ?? this.detectDueDate(candidate.title);
      const effort = this.detectEffort(candidate.description ?? candidate.title);
      const scores = this.scorePriority(candidate.category ?? 'admin', dueDate, intent, effort, candidate.priority ?? null);
      const tags = this.suggestTags(candidate.title + ' ' + (candidate.description ?? ''));
      const confidence = this.computeConfidenceFromSignals([
        Boolean(intent),
        Boolean(dueDate),
        scores.priority >= 4,
        tags.length > 0
      ]);

      return {
        title: candidate.title,
        description: candidate.description,
        category: candidate.category ?? 'admin',
        intent: intent ?? null,
        dueDate,
        tags,
        priority: scores.priority,
        urgency: scores.urgency,
        impact: scores.impact,
        effort: scores.effort,
        confidence
      } satisfies TaskSuggestion;
    });
  }

  suggestTaskMetadata(message: string): { suggestions: TaskSuggestion[]; commands: string[] } {
    const suggestions = this.buildSuggestions(message);
    const commands = suggestions
      .filter((suggestion) => suggestion.dueDate)
      .map((suggestion) => `Auto-detected due date for ${suggestion.title}`);
    return { suggestions, commands };
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

  async getDailyBriefing(userId: string) {
    const tasks = await this.listTasks(userId, { limit: 200 });
    const today = startOfDay(new Date());

    const dueToday = tasks.filter(
      (task) => task.status === 'incomplete' && task.due_date && startOfDay(parseISO(task.due_date)).getTime() === today.getTime()
    );
    const overdue = tasks.filter(
      (task) => task.status === 'incomplete' && task.due_date && startOfDay(parseISO(task.due_date)) < today
    );
    const upcomingWeek = tasks.filter((task) => {
      if (!task.due_date || task.status !== 'incomplete') return false;
      const due = startOfDay(parseISO(task.due_date));
      const diff = differenceInCalendarDays(due, today);
      return diff > 0 && diff <= 7;
    });

    const predictedImportant = tasks
      .filter((task) => task.status === 'incomplete')
      .sort((a, b) => b.priority - a.priority || (b.urgency ?? 0) - (a.urgency ?? 0))
      .slice(0, 5);

    const timelineEvents = await taskTimelineService.getRecentEvents(userId, 20);

    return {
      dueToday,
      overdue,
      upcomingWeek,
      predictedImportant,
      timelineEvents,
      stats: {
        totalOpen: tasks.filter((task) => task.status === 'incomplete').length,
        dueThisWeek: upcomingWeek.length + dueToday.length,
        overdue: overdue.length
      }
    };
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
