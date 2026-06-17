import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { projectService } from '../services/projectService';
import { projectMergeService } from '../services/projectMergeService';
import { logger } from '../logger';
import { asyncHandler } from '../utils/asyncHandler';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();

// GET /api/projects — the Projects Book (emits canonical projects.id)
router.get('/', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const projects = await projectService.listProjects(req.user!.id);
  res.json({ projects });
}));

// GET /api/projects/duplicates
router.get('/duplicates', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const duplicate_groups = await projectService.listDuplicates(req.user!.id);
  res.json({ duplicate_groups });
}));

// POST /api/projects/merge
router.post('/merge', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    source_id: z.string().uuid(),
    target_id: z.string().uuid(),
    reason: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid merge request', details: parsed.error.flatten() });
    return;
  }
  const report = await projectMergeService.merge(req.user!.id, parsed.data.source_id, parsed.data.target_id);
  const project = await projectService.getProject(req.user!.id, parsed.data.target_id);
  res.json({ merged: true, report, project });
}));

// POST /api/projects — create a project (manual add from the Book)
router.post('/', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    status: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid project', details: parsed.error.flatten() });
    return;
  }
  const userId = req.user!.id;
  const normalized = parsed.data.name.trim().toLowerCase().replace(/\s+/g, ' ');
  const { data, error } = await supabaseAdmin
    .from('projects')
    .upsert(
      { user_id: userId, name: parsed.data.name.trim(), normalized_name: normalized,
        description: parsed.data.description ?? null, status: parsed.data.status ?? 'active', type: 'project' },
      { onConflict: 'user_id,normalized_name' }
    )
    .select('*')
    .single();
  if (error) {
    logger.warn({ error, userId }, 'create project failed');
    res.status(400).json({ error: 'Could not create project' });
    return;
  }
  res.json({ project: data });
}));

// PATCH /api/projects/:id — id-source-agnostic (resolves people_places ids too)
router.patch('/:id', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const schema = z.object({
    status: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    summary: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    importance_score: z.number().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues });
    return;
  }
  const canonicalId = (await projectMergeService.resolveCanonicalProjectId(userId, String(req.params.id))) ?? String(req.params.id);
  const project = await projectService.updateProject(userId, canonicalId, parsed.data);
  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found' });
    return;
  }
  res.json({ success: true, project });
}));

export const projectsRouter = router;
