import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { chatService } from '../services/chatService';
import { memoryService } from '../services/memoryService';

const router = Router();

const summarySchema = z.object({
  from: z.string(),
  to: z.string(),
  tags: z.array(z.string()).optional()
});

const reflectSchema = z.object({
  mode: z.enum(['entry', 'month', 'advice']),
  entryId: z.string().optional(),
  month: z.string().optional(),
  persona: z.string().optional(),
  prompt: z.string().optional()
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = summarySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const entries = await memoryService.searchEntriesWithCorrections(req.user!.id, {
    from: parsed.data.from,
    to: parsed.data.to,
    tag: parsed.data.tags?.[0]
  });

  const summary = await chatService.summarizeEntries(req.user!.id, entries);
  res.json({ summary, entryCount: entries.length });
});

router.post('/reflect', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = reflectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const { mode, entryId, month, persona, prompt } = parsed.data;
  let entries = [] as Awaited<ReturnType<typeof memoryService.searchEntries>>;

  if (mode === 'entry' && entryId) {
    const entry = await memoryService.getEntry(req.user!.id, entryId);
  let entries = [] as Awaited<ReturnType<typeof memoryService.searchEntriesWithCorrections>>;

  if (mode === 'entry' && entryId) {
    const entry = await memoryService.getResolvedEntry(req.user!.id, entryId);
    entries = entry ? [entry] : [];
  } else if (mode === 'month' && month) {
    const start = new Date(`${month}-01T00:00:00Z`);
    const end = new Date(start);
    end.setMonth(start.getMonth() + 1);
    entries = await memoryService.searchEntries(req.user!.id, {
    entries = await memoryService.searchEntriesWithCorrections(req.user!.id, {
      from: start.toISOString(),
      to: end.toISOString(),
      limit: 120
    });
  } else {
    entries = await memoryService.searchEntries(req.user!.id, { limit: 50 });
    entries = await memoryService.searchEntriesWithCorrections(req.user!.id, { limit: 50 });
  }

  const defaultPrompt =
    prompt ||
    (mode === 'advice'
      ? 'What advice would you give me based on these entries? Focus on actionable steps.'
      : mode === 'month'
        ? 'What patterns or themes emerge in this period? Mention recurring tags, moods, and arcs.'
        : 'Reflect on this entry and its emotional undercurrents.');

  const reflection = await chatService.reflectOnEntries(entries, defaultPrompt, persona);
  res.json({ reflection, entryCount: entries.length });
});

export const summaryRouter = router;
