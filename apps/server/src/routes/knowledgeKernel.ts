import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabaseClient';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const assertionStatus = z.enum([
  'proposed',
  'active',
  'challenged',
  'superseded',
  'retracted',
  'rejected',
]);

const epistemicStance = z.enum([
  'direct_observation',
  'reported_statement',
  'user_belief',
  'system_hypothesis',
  'established_knowledge',
]);

const listQuerySchema = z.object({
  status: assertionStatus.optional(),
  stance: epistemicStance.optional(),
  domain: z.string().trim().min(1).optional(),
  subject_kind: z.string().trim().min(1).optional(),
  subject_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function kernelReadsEnabled(): boolean {
  return process.env.ENABLE_KNOWLEDGE_KERNEL_READS === 'true' || process.env.NODE_ENV === 'test';
}

function isKernelUnavailable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'PGRST205' || code === '42501' || code === '42P01';
}

router.use(requireAuth);

router.use((_req, res, next) => {
  if (!kernelReadsEnabled()) {
    return res.status(503).json({
      success: false,
      code: 'KNOWLEDGE_KERNEL_DISABLED',
      error: 'Knowledge Kernel reads are not enabled in this environment.',
    });
  }
  return next();
});

router.get(
  '/summary',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { data, error } = await supabaseAdmin
      .from('knowledge_assertions')
      .select('status, epistemic_stance, domain, sensitivity, recorded_at')
      .eq('user_id', userId);

    if (error) {
      const status = isKernelUnavailable(error) ? 503 : 500;
      return res.status(status).json({
        success: false,
        code: status === 503 ? 'KNOWLEDGE_KERNEL_UNAVAILABLE' : 'KNOWLEDGE_KERNEL_READ_FAILED',
        error: status === 503
          ? 'Knowledge Kernel schema is not available yet.'
          : 'Failed to load Knowledge Kernel summary.',
      });
    }

    const byStatus: Record<string, number> = {};
    const byStance: Record<string, number> = {};
    const byDomain: Record<string, number> = {};
    let needsReview = 0;
    let challenged = 0;
    let recentlyChanged = 0;
    const recentBoundary = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for (const assertion of data ?? []) {
      byStatus[assertion.status] = (byStatus[assertion.status] ?? 0) + 1;
      byStance[assertion.epistemic_stance] = (byStance[assertion.epistemic_stance] ?? 0) + 1;
      byDomain[assertion.domain] = (byDomain[assertion.domain] ?? 0) + 1;
      if (assertion.status === 'proposed') needsReview += 1;
      if (assertion.status === 'challenged') challenged += 1;
      if (new Date(assertion.recorded_at).getTime() >= recentBoundary) recentlyChanged += 1;
    }

    return res.json({
      success: true,
      summary: {
        total: data?.length ?? 0,
        needs_review: needsReview,
        challenged,
        recently_changed: recentlyChanged,
        by_status: byStatus,
        by_stance: byStance,
        by_domain: byDomain,
      },
    });
  }),
);

router.get(
  '/assertions',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const query = listQuerySchema.parse(req.query);

    let assertionQuery = supabaseAdmin
      .from('knowledge_assertions')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);

    if (query.status) assertionQuery = assertionQuery.eq('status', query.status);
    if (query.stance) assertionQuery = assertionQuery.eq('epistemic_stance', query.stance);
    if (query.domain) assertionQuery = assertionQuery.eq('domain', query.domain);
    if (query.subject_kind) assertionQuery = assertionQuery.eq('subject_kind', query.subject_kind);
    if (query.subject_id) assertionQuery = assertionQuery.eq('subject_id', query.subject_id);

    const { data, error, count } = await assertionQuery;
    if (error) {
      const status = isKernelUnavailable(error) ? 503 : 500;
      return res.status(status).json({
        success: false,
        code: status === 503 ? 'KNOWLEDGE_KERNEL_UNAVAILABLE' : 'KNOWLEDGE_KERNEL_READ_FAILED',
        error: status === 503
          ? 'Knowledge Kernel schema is not available yet.'
          : 'Failed to load assertions.',
      });
    }

    return res.json({
      success: true,
      assertions: data ?? [],
      total: count ?? data?.length ?? 0,
      limit: query.limit,
      offset: query.offset,
    });
  }),
);

router.get(
  '/subjects/:kind/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const params = z.object({
      kind: z.string().trim().min(1),
      id: z.string().uuid(),
    }).parse(req.params);

    const { data, error } = await supabaseAdmin
      .from('knowledge_assertions')
      .select('*')
      .eq('user_id', userId)
      .eq('subject_kind', params.kind)
      .eq('subject_id', params.id)
      .order('recorded_at', { ascending: false });

    if (error) {
      const status = isKernelUnavailable(error) ? 503 : 500;
      return res.status(status).json({
        success: false,
        code: status === 503 ? 'KNOWLEDGE_KERNEL_UNAVAILABLE' : 'KNOWLEDGE_KERNEL_READ_FAILED',
        error: 'Failed to load subject assertions.',
      });
    }

    return res.json({ success: true, assertions: data ?? [], total: data?.length ?? 0 });
  }),
);

router.get(
  '/assertions/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const { data: assertion, error } = await supabaseAdmin
      .from('knowledge_assertions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      const status = isKernelUnavailable(error) ? 503 : 500;
      return res.status(status).json({
        success: false,
        code: status === 503 ? 'KNOWLEDGE_KERNEL_UNAVAILABLE' : 'KNOWLEDGE_KERNEL_READ_FAILED',
        error: 'Failed to load assertion.',
      });
    }
    if (!assertion) {
      return res.status(404).json({ success: false, error: 'Assertion not found.' });
    }

    const [evidenceResult, revisionsResult, derivationsResult] = await Promise.all([
      supabaseAdmin
        .from('assertion_evidence')
        .select('*')
        .eq('user_id', userId)
        .eq('target_kind', 'knowledge_assertion')
        .eq('target_id', id)
        .order('weight', { ascending: false }),
      supabaseAdmin
        .from('assertion_revision_links')
        .select('*')
        .eq('user_id', userId)
        .or(`from_assertion_id.eq.${id},to_assertion_id.eq.${id}`)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('knowledge_derivation_io')
        .select('*, knowledge_derivation_runs(*)')
        .eq('user_id', userId)
        .eq('artifact_type', 'knowledge_assertion')
        .eq('artifact_id', id)
        .order('created_at', { ascending: false }),
    ]);

    return res.json({
      success: true,
      assertion,
      evidence: evidenceResult.data ?? [],
      revisions: revisionsResult.data ?? [],
      derivations: derivationsResult.data ?? [],
      warnings: [
        evidenceResult.error ? 'Evidence links could not be loaded.' : null,
        revisionsResult.error ? 'Revision history could not be loaded.' : null,
        derivationsResult.error ? 'Derivation history could not be loaded.' : null,
      ].filter(Boolean),
    });
  }),
);

export default router;
