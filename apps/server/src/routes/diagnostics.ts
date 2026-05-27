import { Router, type Request, type Response } from 'express';

import { config } from '../config';
import { requireAuth } from '../middleware/auth';
import { cognitionHealthService } from '../services/cognitionHealthService';
import { supabaseAdmin } from '../services/supabaseClient';
import { entityContinuityVerifier } from '../services/entityContinuityVerifier';
import { ingestionQueue } from '../services/ingestion/ingestionQueue';

const isDev = process.env.NODE_ENV === 'development' ||
  (process.env.API_ENV === 'dev' && process.env.NODE_ENV !== 'production');

const router = Router();

/**
 * GET /api/diagnostics
 * Public diagnostic endpoint to help troubleshoot deployment issues
 * Returns non-sensitive information about the server configuration
 */
router.get('/', (req: Request, res: Response) => {
  const isProduction = process.env.NODE_ENV === 'production' || 
                       process.env.API_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                        (process.env.API_ENV === 'dev' && process.env.NODE_ENV !== 'production');

  // Return diagnostic information (no sensitive data)
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV || 'not set',
      apiEnv: process.env.API_ENV || 'not set',
      isProduction,
      isDevelopment,
    },
    server: {
      port: config.port,
      hasSupabase: !!config.supabaseUrl,
      hasOpenAI: !!config.openAiKey,
      hasServiceRoleKey: !!config.supabaseServiceRoleKey,
    },
    security: {
      authRequired: !isDevelopment || process.env.DISABLE_AUTH_FOR_DEV !== 'true',
      corsConfigured: !!process.env.FRONTEND_URL,
      rateLimitEnabled: process.env.DISABLE_RATE_LIMIT !== 'true',
      csrfEnabled: isProduction && process.env.DISABLE_CSRF !== 'true',
    },
    request: {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      origin: req.headers.origin,
      referer: req.headers.referer,
    },
    message: 'Server is running. Check security settings if experiencing issues.',
  });
});

/**
 * GET /api/diagnostics/cors
 * Test CORS configuration
 */
router.get('/cors', (req: Request, res: Response) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.VITE_API_URL?.replace('/api', ''),
    'https://lorekeeper.app',
    'https://www.lorekeeper.app',
  ].filter(Boolean);

  res.json({
    origin,
    allowedOrigins,
    isAllowed: !origin || allowedOrigins.includes(origin),
    message: !origin 
      ? 'No origin header (may be same-origin request)'
      : allowedOrigins.includes(origin)
        ? 'Origin is allowed'
        : 'Origin is NOT allowed - add to FRONTEND_URL or allowed origins',
  });
});

/**
 * GET /api/diagnostics/cognition-health
 * Cognition pipeline health dashboard — requires auth (admin check via ENABLE_EXPERIMENTAL env)
 */
router.get('/cognition-health', requireAuth, async (_req: Request, res: Response) => {
  try {
    const report = await cognitionHealthService.getReport();
    const statusCode = report.overallStatus === 'critical' ? 503 : 200;
    res.status(statusCode).json(report);
  } catch (err) {
    res.status(500).json({ error: 'Cognition health check failed', detail: String(err) });
  }
});

/**
 * GET /api/diagnostics/continuity-trace/:userId?limit=10&windowHours=24
 *
 * Dev-only runtime truth endpoint. Returns:
 *   - Recent pipeline runs and their production summaries
 *   - Entity continuity verification (ingested → extracted → entityized → provenance)
 *   - Queue health snapshot
 *
 * Answers: "Did the loop close?" for recent messages.
 * Blocked in production unless ENABLE_EXPERIMENTAL=true.
 */
router.get('/continuity-trace/:userId', requireAuth, async (req: Request, res: Response) => {
  if (!isDev && process.env.ENABLE_EXPERIMENTAL !== 'true') {
    return res.status(403).json({ error: 'Dev-only endpoint — not available in production' });
  }

  const { userId } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string || '10', 10), 50);
  const windowHours = Math.min(parseInt(req.query.windowHours as string || '24', 10), 168);

  try {
    // 1. Recent pipeline runs with step results
    const { data: runs, error: runsError } = await supabaseAdmin
      .from('pipeline_runs')
      .select('id, job_id, chat_message_id, status, started_at, completed_at, duration_ms, completed_steps, failed_at_step, error, step_results')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (runsError) {
      return res.status(500).json({ error: 'Failed to query pipeline_runs', detail: runsError.message });
    }

    // 2. Entity continuity verification (ingested → extracted → entityized → provenance)
    const verification = await entityContinuityVerifier.verify(userId, windowHours, 20);

    // 3. Recent entity creation counts (window)
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const [charResult, eventResult, kuResult, candResult] = await Promise.allSettled([
      supabaseAdmin.from('characters').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', windowStart),
      supabaseAdmin.from('conversation_events').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', windowStart),
      supabaseAdmin.from('knowledge_units').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', windowStart),
      supabaseAdmin.from('event_candidates').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', windowStart),
    ]);

    // 4. Queue health
    const queueStats = ingestionQueue.stats();

    // 5. Provenance edge count
    const { count: edgeCount } = await supabaseAdmin
      .from('provenance_edges')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', windowStart)
      .then(r => r);

    return res.json({
      userId,
      windowHours,
      generatedAt: new Date().toISOString(),

      // Pipeline run records — shows if pipeline ran, status, what completed
      pipelineRuns: (runs ?? []).map(r => ({
        runId:          r.id,
        chatMessageId:  r.chat_message_id,
        status:         r.status,                    // running | completed | failed | partial
        startedAt:      r.started_at,
        durationMs:     r.duration_ms,
        completedSteps: r.completed_steps,
        failedAtStep:   r.failed_at_step,
        error:          r.error,
        // Production summary injected by ingestionQueue.captureProductionSummary
        productionSummary: (r.step_results as any[])?.find((s: any) => s.step === 'production_summary')?.metadata ?? null,
        allSteps:       r.step_results,
      })),

      // Did messages actually flow through the full pipeline?
      continuityVerification: {
        overallHealth:          verification.overallHealth,    // healthy | degraded | broken
        entriesChecked:         verification.entriesChecked,
        entriesFullyPropagated: verification.entriesFullyPropagated,
        entriesWithGaps:        verification.entriesWithGaps,
        gapBreakdown:           verification.gapBreakdown,    // where does the pipeline stall?
        summary:                verification.summary,
      },

      // What the pipeline actually produced in the window
      windowProduction: {
        windowHours,
        entitiesCreated:        charResult.status  === 'fulfilled' ? (charResult.value.count  ?? 0) : -1,
        eventsAssembled:        eventResult.status === 'fulfilled' ? (eventResult.value.count ?? 0) : -1,
        knowledgeUnitsCreated:  kuResult.status    === 'fulfilled' ? (kuResult.value.count    ?? 0) : -1,
        eventCandidatesCreated: candResult.status  === 'fulfilled' ? (candResult.value.count  ?? 0) : -1,
        provenanceEdgesWritten: edgeCount ?? 0,
      },

      // Ingestion queue health — running, depth, failed jobs
      queueHealth: queueStats,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Continuity trace failed', detail: String(err) });
  }
});

export default router;
