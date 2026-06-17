import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { supabaseAdmin } from '../services/supabaseClient';
import { decideAuthority, resolveEntityKind, type AuthorityEntity } from '../services/entityAuthorityService';
import { entityAuthorityApplyService } from '../services/entityAuthorityApply';

const router = Router();

const entitySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  kind: z.string().optional(),
  context: z.string().optional(),
  residents: z.array(z.string()).optional(),
  city: z.string().optional(),
  aliases: z.array(z.string()).optional(),
});

const pairSchema = z.object({
  a: entitySchema,
  b: entitySchema,
  decision: z.enum(['MERGE', 'ALIAS', 'PARENT_CHILD', 'LINK', 'IGNORE']).optional(), // user override
});

function toEntity(e: z.infer<typeof entitySchema>): AuthorityEntity {
  return { ...e, kind: e.kind as AuthorityEntity['kind'] };
}

// POST /api/entity-authority/decide — preview the verdict (no side effects)
router.post('/decide', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = pairSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid pair', details: parsed.error.flatten() });
  const verdict = decideAuthority(toEntity(parsed.data.a), toEntity(parsed.data.b));
  res.json({ verdict });
}));

// POST /api/entity-authority/confirm — apply a verdict (user-ratified)
router.post('/confirm', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = pairSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid pair', details: parsed.error.flatten() });
  const a = toEntity(parsed.data.a);
  const b = toEntity(parsed.data.b);
  const verdict = decideAuthority(a, b);
  const decision = parsed.data.decision ?? verdict.decision;
  if (decision === 'IGNORE') return res.status(400).json({ error: 'Nothing to apply (IGNORE)' });

  // canonical side = target (survivor / parent). Default to b when unknown.
  const canonicalIsA = verdict.canonical === 'a';
  const target = canonicalIsA ? a : b;
  const source = canonicalIsA ? b : a;
  const kind = resolveEntityKind(target);

  const result = await entityAuthorityApplyService.applyDecision(req.user!.id, {
    kind,
    decision,
    relationship: verdict.relationship,
    sourceId: source.id,
    sourceName: source.name,
    targetId: target.id,
    targetName: target.name,
    confidence: verdict.confidence,
    reason: verdict.reason,
    evidence: verdict.evidence,
  });
  if (!result.ok) return res.status(500).json({ error: result.error ?? 'apply failed', verdict });
  res.json({ ...result, verdict });
}));

// POST /api/entity-authority/dismiss — never suggest this pair again
router.post('/dismiss', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = pairSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid pair' });
  const a = toEntity(parsed.data.a);
  const b = toEntity(parsed.data.b);
  const verdict = decideAuthority(a, b);
  const result = await entityAuthorityApplyService.dismiss(req.user!.id, {
    kind: resolveEntityKind(a), decision: verdict.decision, relationship: verdict.relationship,
    sourceId: a.id, sourceName: a.name, targetId: b.id, targetName: b.name,
    confidence: verdict.confidence, reason: verdict.reason,
  });
  res.json(result);
}));

// GET /api/entity-authority/decisions — the authority graph / audit trail
router.get('/decisions', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from('entity_authority_decisions')
    .select('*')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return res.status(500).json({ error: 'Failed to load decisions' });
  res.json({ decisions: data ?? [] });
}));

export const entityAuthorityRouter = router;
