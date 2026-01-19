import { Router } from 'express';
import { z } from 'zod';

import { config } from '../config';
import { openai } from '../lib/openai.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { chapterInsightsService } from '../services/chapterInsightsService';
import { chapterService } from '../services/chapterService';

const router = Router();

const createSchema = z.object({
  title: z.string().min(1),
  startDate: z.string(),
  endDate: z.string().nullable().optional(),
  description: z.string().nullable().optional()
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const chapter = await chapterService.createChapter(req.user!.id, {
    title: parsed.data.title,
    start_date: parsed.data.startDate,
    end_date: parsed.data.endDate || null,
    description: parsed.data.description || null
  });

  res.status(201).json({ chapter });
});

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const chapters = await chapterService.listChapters(req.user!.id);
  const candidates = await chapterInsightsService.detectCandidates(req.user!.id);
  res.json({ chapters, candidates });
});

router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const chapter = await chapterService.getChapter(req.user!.id, req.params.id);
  if (!chapter) {
    return res.status(404).json({ error: 'Chapter not found' });
  }
  res.json({ chapter });
});

router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const updateSchema = z.object({
    title: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().nullable().optional(),
    description: z.string().nullable().optional()
  });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.title) updates.title = parsed.data.title;
  if (parsed.data.startDate) updates.start_date = parsed.data.startDate;
  if (parsed.data.endDate !== undefined) updates.end_date = parsed.data.endDate;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;

  const chapter = await chapterService.updateChapter(req.user!.id, req.params.id, updates);
  if (!chapter) {
    return res.status(404).json({ error: 'Chapter not found' });
  }
  res.json({ chapter });
});

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  await chapterService.deleteChapter(req.user!.id, req.params.id);
  res.status(204).send();
});

// Extract chapter info from conversation
router.post('/extract-info', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { conversation } = req.body;
  
  if (!conversation || typeof conversation !== 'string') {
    return res.status(400).json({ error: 'Conversation text is required' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Extract chapter information from a conversation. Return JSON with:
- title: A concise, meaningful chapter title (required)
- startDate: Start date in YYYY-MM-DD format (required)
- endDate: End date in YYYY-MM-DD format (optional, null if not mentioned)
- description: A brief description of what the chapter is about (optional)

If dates are mentioned relatively (e.g., "last month", "in January"), use today's date as reference: ${new Date().toISOString().split('T')[0]}
If no clear date is mentioned, use today's date as startDate.
If the conversation doesn't have enough information, return null for optional fields.`
        },
        {
          role: 'user',
          content: conversation
        }
      ]
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    const extracted = JSON.parse(content);
    
    // Validate and format dates
    if (extracted.startDate) {
      const startDate = new Date(extracted.startDate);
      if (isNaN(startDate.getTime())) {
        extracted.startDate = new Date().toISOString().split('T')[0];
      } else {
        extracted.startDate = startDate.toISOString().split('T')[0];
      }
    } else {
      extracted.startDate = new Date().toISOString().split('T')[0];
    }

    if (extracted.endDate) {
      const endDate = new Date(extracted.endDate);
      if (isNaN(endDate.getTime())) {
        extracted.endDate = null;
      } else {
        extracted.endDate = endDate.toISOString().split('T')[0];
      }
    }

    res.json(extracted);
  } catch (error) {
    console.error('Failed to extract chapter info:', error);
    // Return fallback with today's date
    res.json({
      title: 'New Chapter',
      startDate: new Date().toISOString().split('T')[0],
      endDate: null,
      description: null
    });
  }
});

export const chaptersRouter = router;
