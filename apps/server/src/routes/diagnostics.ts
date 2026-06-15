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
    'https://lorebook.app',
    'https://www.lorebook.app',
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

/**
 * GET /api/diagnostics/intelligence-health
 *
 * Phase 4 — Observe Reality.
 * Returns real production metrics for the full event intelligence pipeline.
 * Admin/builder facing. Requires auth. Used to detect where intelligence dies.
 *
 * Response: event pipeline funnel, meaning layer depth, story layer,
 * knowledge layer, bottleneck warnings, and observation timestamp.
 */
router.get('/intelligence-health', requireAuth, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const d7  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString();

    // Helper: count with optional time window
    const count = async (table: string, extra = '') => {
      const { count: c } = await supabaseAdmin
        .from(table).select('*', { count: 'exact', head: true })
        .gte('created_at', extra || '2020-01-01');
      return c ?? 0;
    };
    const countWhere = async (table: string, col: string, val: string | boolean, since?: string) => {
      let q = supabaseAdmin.from(table).select('*', { count: 'exact', head: true })
        .eq(col, val);
      if (since) q = q.gte('created_at', since);
      const { count: c } = await q;
      return c ?? 0;
    };

    // ── Event Pipeline ───────────────────────────────────────────────────────
    const [
      msgTotal, msgUser24h, msgUser7d, msgUserTotal,
      expUnitsTotal, expUnits24h, expUnits7d,
      resolvedTotal, resolved24h, resolved7d,
      recordsTotal, records24h, records7d,
      recordsLinked,
    ] = await Promise.all([
      count('conversation_messages'),
      countWhere('conversation_messages', 'role', 'user', h24),
      countWhere('conversation_messages', 'role', 'user', d7),
      countWhere('conversation_messages', 'role', 'user'),
      count('extracted_units'),
      countWhere('extracted_units', 'type', 'EXPERIENCE', h24),
      countWhere('extracted_units', 'type', 'EXPERIENCE', d7),
      count('resolved_events'),
      count('resolved_events', h24),
      count('resolved_events', d7),
      count('event_records'),
      count('event_records', h24),
      count('event_records', d7),
      (async () => {
        const { count: c } = await supabaseAdmin
          .from('event_records').select('*', { count: 'exact', head: true })
          .not('resolved_event_id', 'is', null);
        return c ?? 0;
      })(),
    ]);

    const expUnitsTotal_ = await countWhere('extracted_units', 'type', 'EXPERIENCE');
    const ingestionCoveragePct = msgUserTotal > 0
      ? Math.round((expUnitsTotal_ / msgUserTotal) * 100 * 10) / 10
      : 0;
    const linkagePct = recordsTotal > 0
      ? Math.round((recordsLinked / recordsTotal) * 100 * 10) / 10
      : 0;

    // ── Meaning Layer ─────────────────────────────────────────────────────────
    const [
      emotionsTotal, emotions24h, emotions7d,
      cognitionsTotal, cognitions24h, cognitions7d,
      identityTotal, identity24h, identity7d,
      narrativesTotal, narratives24h, narratives7d,
      atTheTime, laterInterp,
      recordsWithEmotions,
    ] = await Promise.all([
      count('event_emotions'), count('event_emotions', h24), count('event_emotions', d7),
      count('event_cognitions'), count('event_cognitions', h24), count('event_cognitions', d7),
      count('event_identity_impacts'), count('event_identity_impacts', h24), count('event_identity_impacts', d7),
      count('narrative_accounts'), count('narrative_accounts', h24), count('narrative_accounts', d7),
      countWhere('narrative_accounts', 'account_type', 'at_the_time'),
      countWhere('narrative_accounts', 'account_type', 'later_interpretation'),
      (async () => {
        const { data } = await supabaseAdmin
          .from('event_emotions')
          .select('event_record_id');
        return new Set((data || []).map((r: any) => r.event_record_id)).size;
      })(),
    ]);

    const meaningDensityPct = recordsTotal > 0
      ? Math.round((recordsWithEmotions / recordsTotal) * 100 * 10) / 10
      : 0;

    // ── Story Layer ───────────────────────────────────────────────────────────
    const [
      causalTotal, causal24h, causal7d,
      continuityTotal, continuity24h, continuity7d,
      candidatesTotal, candidatesSurfaceable,
      confidenceTotal, confidence24h, confidence7d,
      impactsTotal, impacts24h,
    ] = await Promise.all([
      count('event_causal_links'), count('event_causal_links', h24), count('event_causal_links', d7),
      count('event_continuity_links'), count('event_continuity_links', h24), count('event_continuity_links', d7),
      count('event_candidates'),
      (async () => {
        const { count: c } = await supabaseAdmin
          .from('event_candidates').select('*', { count: 'exact', head: true })
          .gte('occurrence_count', 2);
        return c ?? 0;
      })(),
      count('event_confidence_snapshots'), count('event_confidence_snapshots', h24), count('event_confidence_snapshots', d7),
      count('event_impacts'), count('event_impacts', h24),
    ]);

    const continuityExpected = resolvedTotal >= 3 ? Math.max(1, Math.floor(resolvedTotal / 3)) : 0;
    const continuityHealthPct = continuityExpected > 0
      ? Math.min(100, Math.round((continuityTotal / continuityExpected) * 100))
      : 0;

    // ── Knowledge Layer ───────────────────────────────────────────────────────
    const [claimsTotal, claimsActive, claimsInactive, omegaEntities] = await Promise.all([
      count('omega_claims'),
      countWhere('omega_claims', 'is_active', true),
      countWhere('omega_claims', 'is_active', false),
      count('omega_entities'),
    ]);

    // crystallized_knowledge may not exist yet
    let crystallizedTotal = 0;
    try {
      const { count: c } = await supabaseAdmin
        .from('crystallized_knowledge').select('*', { count: 'exact', head: true });
      crystallizedTotal = c ?? 0;
    } catch { /* table may not exist */ }

    // ── Pipeline Funnel ───────────────────────────────────────────────────────
    const funnel = [
      { stage: 'Messages (user)',       count: msgUserTotal,    pct: 100 },
      { stage: 'EXPERIENCE_INGESTION',  count: expUnitsTotal_,  pct: ingestionCoveragePct },
      { stage: 'Resolved Events',       count: resolvedTotal,   pct: msgUserTotal > 0 ? Math.round(resolvedTotal / msgUserTotal * 100 * 10) / 10 : 0 },
      { stage: 'Event Records',         count: recordsTotal,    pct: msgUserTotal > 0 ? Math.round(recordsTotal / msgUserTotal * 100 * 10) / 10 : 0 },
      { stage: 'Linked Records',        count: recordsLinked,   pct: linkagePct > 0 ? Math.round(recordsLinked / (msgUserTotal || 1) * 100 * 10) / 10 : 0 },
      { stage: 'Meaning Extraction',    count: emotionsTotal,   pct: recordsTotal > 0 ? meaningDensityPct : 0 },
      { stage: 'Continuity Detection',  count: continuityTotal, pct: resolvedTotal > 0 ? continuityHealthPct : 0 },
      { stage: 'Knowledge Claims',      count: claimsTotal,     pct: msgUserTotal > 0 ? Math.round(claimsTotal / msgUserTotal * 100 * 10) / 10 : 0 },
    ];

    // ── Bottleneck Detection ──────────────────────────────────────────────────
    const THRESHOLDS = {
      ingestionCoverage: 30,
      linkageCoverage: 60,
      meaningDensity: 40,
      continuityHealth: 50,
    };
    const warnings: Array<{ level: 'critical' | 'warning' | 'info'; system: string; message: string; actual: number; threshold: number }> = [];

    if (msgUserTotal === 0) {
      warnings.push({ level: 'info', system: 'Event Pipeline', message: 'No user messages yet. Intelligence pipeline has not been exercised.', actual: 0, threshold: 1 });
    } else {
      if (ingestionCoveragePct < THRESHOLDS.ingestionCoverage) {
        warnings.push({ level: 'critical', system: 'EXPERIENCE_INGESTION', message: `Only ${ingestionCoveragePct}% of user messages triggered event extraction. Mode Router thresholds may be too strict for real conversational patterns.`, actual: ingestionCoveragePct, threshold: THRESHOLDS.ingestionCoverage });
      }
      if (recordsTotal > 0 && linkagePct < THRESHOLDS.linkageCoverage) {
        warnings.push({ level: 'warning', system: 'Event Linkage', message: `${linkagePct}% linkage — ${recordsTotal - recordsLinked} event_records are unlinked to resolved_events. Phase C1 assembly linking may not be firing.`, actual: linkagePct, threshold: THRESHOLDS.linkageCoverage });
      }
      if (recordsTotal > 0 && meaningDensityPct < THRESHOLDS.meaningDensity) {
        warnings.push({ level: 'warning', system: 'Meaning Layer', message: `Only ${meaningDensityPct}% of event_records have emotion data. Event records are being created but feelings rarely extracted.`, actual: meaningDensityPct, threshold: THRESHOLDS.meaningDensity });
      }
      if (resolvedTotal >= 5 && continuityHealthPct < THRESHOLDS.continuityHealth) {
        warnings.push({ level: 'warning', system: 'Continuity Engine', message: `${continuityTotal} continuity links against ${continuityExpected} expected (${continuityHealthPct}%). Shared-entity overlap may be low or events lack people/location data.`, actual: continuityHealthPct, threshold: THRESHOLDS.continuityHealth });
      }
    }

    if (warnings.length === 0 && msgUserTotal > 0) {
      warnings.push({ level: 'info', system: 'All Systems', message: 'All pipeline metrics are within healthy thresholds.', actual: 100, threshold: 100 });
    }

    const userId = req.user!.id;
    const { buildIntelligenceCoverageReport } = await import('../services/diagnostics/intelligenceHealthCoverage');
    const al_coverage = await buildIntelligenceCoverageReport(userId);

    res.json({
      success: true,
      observed_at: now.toISOString(),
      summary: {
        total_messages: msgTotal,
        total_resolved_events: resolvedTotal,
        linkage_pct: linkagePct,
        ingestion_coverage_pct: ingestionCoveragePct,
        meaning_density_pct: meaningDensityPct,
        overall_health: warnings.some(w => w.level === 'critical') ? 'critical'
          : warnings.some(w => w.level === 'warning') ? 'degraded' : 'healthy',
      },
      event_pipeline: {
        conversation_messages: { total: msgTotal, last_24h: msgUser24h, last_7d: msgUser7d, user_only_total: msgUserTotal },
        experience_ingestion:  { total: expUnitsTotal_, last_24h: expUnits24h, last_7d: expUnits7d, coverage_pct: ingestionCoveragePct },
        resolved_events:       { total: resolvedTotal, last_24h: resolved24h, last_7d: resolved7d },
        event_records:         { total: recordsTotal, last_24h: records24h, last_7d: records7d, linked: recordsLinked, linkage_pct: linkagePct },
      },
      meaning_layer: {
        event_emotions:        { total: emotionsTotal, last_24h: emotions24h, last_7d: emotions7d },
        event_cognitions:      { total: cognitionsTotal, last_24h: cognitions24h, last_7d: cognitions7d },
        event_identity_impacts:{ total: identityTotal, last_24h: identity24h, last_7d: identity7d },
        narrative_accounts:    { total: narrativesTotal, last_24h: narratives24h, last_7d: narratives7d, at_the_time: atTheTime, looking_back: laterInterp },
        records_with_meaning:  recordsWithEmotions,
        meaning_density_pct:   meaningDensityPct,
      },
      story_layer: {
        causal_links:     { total: causalTotal, last_24h: causal24h, last_7d: causal7d },
        continuity_links: { total: continuityTotal, last_24h: continuity24h, last_7d: continuity7d, expected: continuityExpected, health_pct: continuityHealthPct },
        recurring_scenes: { total: candidatesTotal, surfaceable_at_2plus: candidatesSurfaceable },
        confidence_snaps: { total: confidenceTotal, last_24h: confidence24h, last_7d: confidence7d },
        event_impacts:    { total: impactsTotal, last_24h: impacts24h },
      },
      knowledge_layer: {
        omega_claims:      { total: claimsTotal, active: claimsActive, inactive: claimsInactive },
        omega_entities:    { total: omegaEntities },
        crystallized:      { total: crystallizedTotal },
      },
      funnel,
      warnings,
      thresholds: THRESHOLDS,
      al_coverage: {
        character_importance_coverage_pct: al_coverage.character_importance_coverage.coverage_pct,
        event_significance_coverage_pct: al_coverage.event_significance_coverage.coverage_pct,
        relationship_scoring_coverage_pct: al_coverage.relationship_scoring_coverage.coverage_pct,
        meaning_generation_coverage_pct: al_coverage.meaning_generation_coverage.coverage_pct,
        character_biography_coverage_pct: al_coverage.character_biography_coverage.coverage_pct,
        details: al_coverage,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Intelligence health check failed', detail: String(err) });
  }
});

/**
 * GET /api/diagnostics/story-coverage
 *
 * Sprint AM-7 — Per-user story utilization coverage.
 * Reveals where memory exists but cannot yet tell stories.
 */
router.get('/story-coverage', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { buildStoryCoverageReport } = await import('../services/diagnostics/storyCoverageDiagnostics');
    const report = await buildStoryCoverageReport(userId);
    return res.json(report);
  } catch (err) {
    return res.status(500).json({ error: 'Story coverage check failed', detail: String(err) });
  }
});

export default router;
