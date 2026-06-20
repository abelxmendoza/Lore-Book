import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { projectService } from '../services/projectService';
import { projectMergeService } from '../services/projectMergeService';
import { projectExtractor } from '../services/projects/projectExtractor';
import { projectSuggestionService } from '../services/projects/projectSuggestionService';
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

/**
 * GET /api/projects/suggestions
 * Pending project suggestions. Lexical + story scan on first visit or ?rescan=true.
 */
router.get('/suggestions', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const rescan = req.query.rescan === 'true';

  const [existing, pending, everScanned] = await Promise.all([
    projectService.listProjects(userId),
    projectSuggestionService.getPendingSuggestions(userId),
    projectSuggestionService.hasAnySuggestions(userId),
  ]);

  const haveNames = new Set(existing.map((p) => p.normalized_name ?? p.name.trim().toLowerCase()));
  const shouldScan = rescan || (!everScanned && pending.length === 0);

  if (shouldScan) {
    const [entriesRes, messagesRes] = await Promise.all([
      supabaseAdmin
        .from('journal_entries')
        .select('content, date')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(40),
      supabaseAdmin
        .from('chat_messages')
        .select('content, created_at')
        .eq('user_id', userId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(60),
    ]);

    const combined = [
      ...((messagesRes.data as Array<{ content: string; created_at: string }> | null) ?? []).map((m) => ({
        content: m.content,
        date: m.created_at,
      })),
      ...((entriesRes.data as Array<{ content: string; date: string }> | null) ?? []).map((e) => ({
        content: e.content,
        date: e.date,
      })),
    ]
      .filter((e) => e.content?.trim())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const extracted = await projectExtractor.extractProjects(userId, combined);
    const unseen = extracted
      .filter((p) => !haveNames.has(p.name.trim().toLowerCase().replace(/\s+/g, ' ')))
      .map((p) => ({ ...p, reasoning: p.reasoning ?? 'Detected from your recent journals and chats' }));
    await projectSuggestionService.upsertManyFromExtraction(userId, unseen, { source: 'llm_scan' });
  }

  const freshPending = shouldScan
    ? await projectSuggestionService.getPendingSuggestions(userId)
    : pending;

  const suggestions = freshPending
    .filter((row) => row.match_status !== 'existing')
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      project_type: row.project_type,
      status: row.status,
      confidence: row.confidence,
      reasoning: row.reasoning ?? 'Detected from your story',
      evidence: row.evidence ?? [],
      match_status: row.match_status,
      matched_project_id: row.matched_project_id,
      matched_project_name: row.matched_project_name,
    }))
    .sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0))
    .slice(0, 12);

  const { enrichSuggestionsWithParserAlternatives } = await import(
    '../services/lorebook/parser/loreBookSuggestionEnricher'
  );
  const enriched = await enrichSuggestionsWithParserAlternatives(
    userId,
    'projects',
    suggestions,
    (row) => row.name,
    (row) => row.description ?? row.reasoning
  );

  res.json({ suggestions: enriched, count: enriched.length, scanned: shouldScan });
}));

router.post('/suggestions/materialize', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const schema = z.object({
    name: z.string().trim().min(1),
    description: z.string().optional(),
    type: z.string().optional(),
    status: z.string().optional(),
    suggestion_id: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid project suggestion' });
    return;
  }
  const project = await projectSuggestionService.materializeProject(userId, {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    type: parsed.data.type,
    status: parsed.data.status,
    suggestionId: parsed.data.suggestion_id,
  });
  res.json({ project });
}));

router.post('/suggestions/reject-by-name', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const schema = z.object({ name: z.string().trim().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid name' });
    return;
  }
  await projectSuggestionService.rejectByName(req.user!.id, parsed.data.name);
  res.json({ success: true });
}));

router.post('/suggestions/:id/confirm', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const project = await projectSuggestionService.confirmSuggestion(req.user!.id, String(req.params.id));
  res.json({ project });
}));

router.post('/suggestions/:id/reject', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  await projectSuggestionService.rejectSuggestion(req.user!.id, String(req.params.id));
  res.json({ success: true });
}));

export const projectsRouter = router;
