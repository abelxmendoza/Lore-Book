import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { taskEngineService } from '../services/taskEngineService';
import type { TaskStatus } from '../types';
import { emitDelta } from '../realtime/orchestratorEmitter';

const router = Router();

const taskSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  category: z.string().optional(),
  intent: z.string().optional(),
  source: z.enum(['chat', 'manual', 'microsoft', 'system']).optional(),
  priority: z.number().int().min(1).max(8).optional(),
  metadata: z.record(z.any()).optional()
});

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const status = (req.query.status as TaskStatus | undefined) ?? undefined;
    const tasks = await taskEngineService.listTasks(req.user!.id, { status });
    res.json({ tasks });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load tasks' });
  }
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const task = await taskEngineService.createTask(req.user!.id, parsed.data);
  const timelineEvent = {
    id: task.id,
    title: task.title,
    occurred_at: parsed.data.dueDate ?? new Date().toISOString(),
    taskId: task.id,
    tags: ['task', 'new']
  };
  void emitDelta('task.create', { task, event: timelineEvent }, req.user!.id);
  res.status(201).json({ task });
});

router.post('/from-chat', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({ message: z.string().min(3) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  try {
    const data = await taskEngineService.handleChatMessage(req.user!.id, parsed.data.message);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to process message' });
  }
});

router.post('/suggest', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({ message: z.string().min(3) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  try {
    const suggestions = taskEngineService.suggestTaskMetadata(parsed.data.message);
    res.json(suggestions);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate suggestions' });
  }
});

router.get('/briefing', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const briefing = await taskEngineService.getDailyBriefing(req.user!.id);
    res.json({ briefing });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to build briefing' });
  }
});

router.get('/events', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const events = await taskEngineService.getEvents(req.user!.id, 100);
    res.json({ events });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch events' });
  }
});

router.post('/sync/microsoft', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({ accessToken: z.string().min(10), listId: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  try {
    const summary = await taskEngineService.syncMicrosoftTasks(
      req.user!.id,
      parsed.data.accessToken,
      parsed.data.listId ?? undefined
    );
    res.json({ summary });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to sync Microsoft To Do' });
  }
});

router.get('/oauth/microsoft', requireAuth, (_req: AuthenticatedRequest, res) => {
  const authUrl = taskEngineService.getMicrosoftAuthUrl();
  if (!authUrl) {
    return res.status(400).json({ error: 'Microsoft OAuth is not configured' });
  }
  res.json({ authUrl });
});

router.patch('/:taskId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = taskSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  try {
    const updated = await taskEngineService.updateTask(req.user!.id, req.params.taskId, parsed.data);
    res.json({ task: updated });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update task' });
  }
});

router.post('/:taskId/complete', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const task = await taskEngineService.completeTask(req.user!.id, req.params.taskId);
    if (task) {
      const completionEvent = {
        id: `${task.id}:completion`,
        title: `Completed: ${task.title}`,
        occurred_at: new Date().toISOString(),
        taskId: task.id,
        tags: ['task', 'completed']
      };
      void emitDelta('task.complete', { task, event: completionEvent }, req.user!.id);
    }
    res.json({ task });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to complete task' });
  }
});

router.delete('/:taskId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await taskEngineService.deleteTask(req.user!.id, req.params.taskId);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete task' });
  }
});

export const tasksRouter = router;
