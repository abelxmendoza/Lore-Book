import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../logger';
import { emitDelta } from '../realtime/orchestratorEmitter';
import {
  identityPulseModule,
} from '../services/analytics';
import { buildAnalyticsContext, runLegacyAnalytics } from '../services/analytics/orchestrator';
import { personaService } from '../services/personaService';
import { correctionAuthority } from '../services/provenance';
import { supabaseAdmin } from '../services/supabaseClient';
import type { ArtifactType, TruthState } from '../services/provenance';

const router = Router();

const recomputeSchema = z.object({
  description: z.string().optional(),
  motifs: z.array(z.string()).optional(),
  toneProfile: z.record(z.any()).optional(),
  behavioralBiases: z.record(z.any()).optional(),
  emotionalVector: z.record(z.any()).optional(),
  version: z.string().optional()
});

router.get('/pulse', requireAuth, async (req: AuthenticatedRequest, res) => {
  const timeRange = (req.query.timeRange as string) || '30';
  const context = await buildAnalyticsContext({ userId: req.user!.id, timeRange });
  const result = await runLegacyAnalytics('identity', context, (ctx) =>
    identityPulseModule.runEnhanced(ctx.userId, ctx.timeRange ?? '30')
  );

  if (result.value === null) {
    logger.error({ userId: req.user!.id, diagnostics: result.diagnostics }, 'Identity pulse failed');
    return res.status(200).json({ error: 'ANALYTICS_DEGRADED', diagnostics: result.diagnostics });
  }

  res.json(result.value);
});

router.post('/recompute', requireAuth, (req: AuthenticatedRequest, res) => {
  const parsed = recomputeSchema.partial().safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const snapshot = personaService.updatePersona(req.user!.id, parsed.data);
  void emitDelta('identity.update', { snapshot }, req.user!.id);
  res.json({ snapshot });
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

const reviseSchema = z.object({
  fromState: z.enum(['CANONICAL', 'CONTEXTUAL', 'REVISED', 'DISPUTED', 'INFERRED', 'PENDING_VERIFICATION']),
  toState:   z.enum(['CANONICAL', 'CONTEXTUAL', 'REVISED', 'DISPUTED', 'INFERRED', 'PENDING_VERIFICATION']),
  artifactType: z.enum(['journal_entry', 'entry_ir', 'knowledge_unit', 'utterance', 'entity', 'insight', 'conversation_message', 'extracted_unit']),
  rationale: z.string().optional(),
});

// ─── POST /api/identity/revise/:artifactId ────────────────────────────────────

router.post('/revise/:artifactId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = reviseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid revision payload', details: parsed.error.flatten() });
  }

  const userId = req.user!.id;
  const { artifactId } = req.params;
  const { fromState, toState, artifactType, rationale } = parsed.data;

  try {
    const result = await correctionAuthority.applyRevision(
      {
        actorId:      userId,
        artifactType: artifactType as ArtifactType,
        artifactId,
        fromState:    fromState as TruthState,
        toState:      toState as TruthState,
        rationale,
      },
      userId
    );
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, userId, artifactId }, 'identity/revise: revision rejected');
    res.status(422).json({ error: message });
  }
});

// ─── GET /api/identity/permitted-transitions ──────────────────────────────────

router.get('/permitted-transitions', requireAuth, (req: AuthenticatedRequest, res) => {
  const { currentState } = req.query;
  if (!currentState || typeof currentState !== 'string') {
    return res.status(400).json({ error: 'currentState query param required' });
  }
  const permitted = correctionAuthority.permittedTransitions(currentState as TruthState);
  res.json({ currentState, permitted });
});

// ─── GET /api/identity/audit-log ─────────────────────────────────────────────

router.get('/audit-log', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId       = req.user!.id;
  const limit        = Math.min(Number(req.query.limit ?? 50), 200);
  const before       = req.query.before as string | undefined; // cursor: ISO timestamp
  const artifactId   = req.query.artifactId as string | undefined;
  const mutationType = req.query.mutationType as string | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabaseAdmin
    .from('cognition_mutations')
    .select('id, artifact_type, artifact_id, mutation_type, before_state, after_state, rationale, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (artifactId)   q = q.eq('artifact_id', artifactId);
  if (mutationType) q = q.eq('mutation_type', mutationType);
  if (before)       q = q.lt('created_at', before);

  const { data, error } = await q;
  if (error) {
    logger.warn({ err: error, userId }, 'identity/audit-log: query failed');
    return res.status(500).json({ error: 'Failed to fetch audit log' });
  }

  res.json({ mutations: data ?? [], limit, next_cursor: data?.at(-1)?.created_at ?? null });
});

// ─── GET /api/identity/provenance/:artifactId ─────────────────────────────────

router.get('/provenance/:artifactId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId     = req.user!.id;
  const { artifactId } = req.params;

  const history = await correctionAuthority.getMutationHistory(artifactId, userId);
  res.json({ artifactId, history });
});

// ─── GET /api/identity/what-ai-knows ─────────────────────────────────────────

router.get('/what-ai-knows', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const limit  = Math.min(Number(req.query.limit ?? 100), 500);

  const [journalRes, insightRes, entityRes, irRes] = await Promise.all([
    supabaseAdmin
      .from('journal_entries')
      .select('id, title, content, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from('insights')
      .select('id, content, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('entities')
      .select('id, canonical_name, type, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabaseAdmin
      .from('entry_ir')
      .select('id, summary, confidence, metadata, created_at')
      .eq('user_id', userId)
      .in('status', ['PENDING', 'PROMOTED'])
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  res.json({
    journal_entries:  journalRes.data  ?? [],
    insights:         insightRes.data  ?? [],
    entities:         entityRes.data   ?? [],
    entry_ir:         irRes.data       ?? [],
  });
});

// ─── GET /api/identity/export ─────────────────────────────────────────────────
// Streams NDJSON: one JSON object per line, flushed as each query completes.

router.get('/export', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Content-Disposition', 'attachment; filename="lorebook-identity-export.ndjson"');

  const write = (type: string, data: object[]) => {
    for (const row of data) {
      res.write(JSON.stringify({ type, ...row }) + '\n');
    }
  };

  try {
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }) as { data: object[] | null };
    write('journal_entry', entries ?? []);

    const { data: mutations } = await supabaseAdmin
      .from('cognition_mutations')
      .select('id, artifact_type, artifact_id, mutation_type, before_state, after_state, rationale, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }) as { data: object[] | null };
    write('cognition_mutation', mutations ?? []);

    const { data: entities } = await supabaseAdmin
      .from('entities')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }) as { data: object[] | null };
    write('entity', entities ?? []);

    res.end();
  } catch (err) {
    logger.error({ err, userId }, 'identity/export: stream failed');
    res.end();
  }
});

export const identityRouter = router;
