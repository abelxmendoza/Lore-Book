// =====================================================
// COGNITION RUNTIME HEALTH SERVICE
//
// Aggregates operational health metrics for the cognition pipeline.
// Called by GET /api/diagnostics/cognition-health (admin-only).
//
// Reads from DB only — no side effects.
// Designed to surface degradation before users notice.
// =====================================================

import { logger } from '../logger';
import { config } from '../config';
import { supabaseAdmin } from './supabaseClient';
import { entityContinuityVerifier } from './entityContinuityVerifier';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ServiceHealthItem {
  name: string;
  status: 'ok' | 'degraded' | 'unavailable' | 'unknown';
  detail: string | null;
  checkedAt: string;
}

export interface CognitionHealthReport {
  generatedAt: string;
  runtimeMode: 'experimental' | 'core-only';
  services: {
    database:        ServiceHealthItem;
    openai:          ServiceHealthItem;
    ingestion:       ServiceHealthItem;
    entityPipeline:  ServiceHealthItem;
    continuity:      ServiceHealthItem;
    provenance:      ServiceHealthItem;
  };
  metrics: {
    activeUsersLast24h:     number | null;
    entriesLast24h:         number | null;
    entitiesLast24h:        number | null;
    contradictionsOpen:     number | null;
    provenanceWriteSuccess: number | null; // % of entries with at least one edge
    entityMergeFailures:    number | null;
    migrationVersion:       string | null;
  };
  pipeline: {
    overallHealth: 'healthy' | 'degraded' | 'broken' | 'unknown';
    entriesChecked: number;
    entriesWithGaps: number;
    gapBreakdown: {
      stuckAtExtraction:    number;
      stuckAtEntityization: number;
      stuckAtProvenance:    number;
    };
  };
  overallStatus: 'healthy' | 'degraded' | 'critical';
  degradedReasons: string[];
}

// ─── Service ───────────────────────────────────────────────────────────────

class CognitionHealthService {

  async getReport(): Promise<CognitionHealthReport> {
    const now = new Date().toISOString();

    const [
      dbHealth,
      openaiHealth,
      metrics,
      pipelineVerification,
    ] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkOpenAI(),
      this.gatherMetrics(),
      entityContinuityVerifier.verify('_system_sample', 24, 10).catch(() => null),
    ]);

    const db      = dbHealth.status      === 'fulfilled' ? dbHealth.value      : this.unavailable('database', 'Check threw');
    const openai  = openaiHealth.status  === 'fulfilled' ? openaiHealth.value  : this.unavailable('openai', 'Check threw');
    const m       = metrics.status       === 'fulfilled' ? metrics.value       : null;
    const pipeline = pipelineVerification.status === 'fulfilled' ? pipelineVerification.value : null;

    const degradedReasons: string[] = [];

    if (db.status !== 'ok')     degradedReasons.push(`Database: ${db.detail}`);
    if (openai.status !== 'ok') degradedReasons.push(`OpenAI: ${openai.detail}`);
    if (pipeline?.overallHealth === 'broken')   degradedReasons.push('Entity pipeline: broken — entries not propagating');
    if (pipeline?.overallHealth === 'degraded') degradedReasons.push(`Entity pipeline: degraded — ${pipeline.entriesWithGaps} entries with gaps`);
    if ((m?.contradictionsOpen ?? 0) > 50)      degradedReasons.push(`High open contradictions: ${m?.contradictionsOpen}`);

    const overallStatus: CognitionHealthReport['overallStatus'] =
      db.status === 'unavailable' ? 'critical' :
      degradedReasons.length === 0 ? 'healthy' : 'degraded';

    const ingestionHealth: ServiceHealthItem = {
      name: 'ingestion',
      status: m?.entriesLast24h != null
        ? (m.entriesLast24h > 0 ? 'ok' : 'degraded')
        : 'unknown',
      detail: m?.entriesLast24h != null
        ? `${m.entriesLast24h} entries ingested in last 24h`
        : 'Metrics unavailable',
      checkedAt: now,
    };

    const entityPipelineHealth: ServiceHealthItem = {
      name: 'entityPipeline',
      status: pipeline == null         ? 'unknown'    :
              pipeline.overallHealth === 'healthy'  ? 'ok'         :
              pipeline.overallHealth === 'degraded' ? 'degraded'   : 'degraded',
      detail: pipeline?.summary ?? 'Pipeline verification unavailable',
      checkedAt: now,
    };

    const continuityHealth: ServiceHealthItem = {
      name: 'continuity',
      status: m?.contradictionsOpen != null
        ? (m.contradictionsOpen < 10 ? 'ok' : m.contradictionsOpen < 50 ? 'degraded' : 'degraded')
        : 'unknown',
      detail: m?.contradictionsOpen != null
        ? `${m.contradictionsOpen} open contradictions`
        : 'Metrics unavailable',
      checkedAt: now,
    };

    const provenanceHealth: ServiceHealthItem = {
      name: 'provenance',
      status: m?.provenanceWriteSuccess != null
        ? (m.provenanceWriteSuccess >= 80 ? 'ok' : m.provenanceWriteSuccess >= 50 ? 'degraded' : 'degraded')
        : 'unknown',
      detail: m?.provenanceWriteSuccess != null
        ? `${m.provenanceWriteSuccess}% of recent entries have provenance edges`
        : 'Metrics unavailable',
      checkedAt: now,
    };

    return {
      generatedAt: now,
      runtimeMode: config.enableExperimental ? 'experimental' : 'core-only',
      services: {
        database:       db,
        openai,
        ingestion:      ingestionHealth,
        entityPipeline: entityPipelineHealth,
        continuity:     continuityHealth,
        provenance:     provenanceHealth,
      },
      metrics: {
        activeUsersLast24h:     m?.activeUsersLast24h     ?? null,
        entriesLast24h:         m?.entriesLast24h         ?? null,
        entitiesLast24h:        m?.entitiesLast24h        ?? null,
        contradictionsOpen:     m?.contradictionsOpen     ?? null,
        provenanceWriteSuccess: m?.provenanceWriteSuccess ?? null,
        entityMergeFailures:    m?.entityMergeFailures    ?? null,
        migrationVersion:       m?.migrationVersion       ?? null,
      },
      pipeline: pipeline
        ? {
            overallHealth: pipeline.overallHealth,
            entriesChecked: pipeline.entriesChecked,
            entriesWithGaps: pipeline.entriesWithGaps,
            gapBreakdown: pipeline.gapBreakdown,
          }
        : {
            overallHealth: 'unknown',
            entriesChecked: 0,
            entriesWithGaps: 0,
            gapBreakdown: { stuckAtExtraction: 0, stuckAtEntityization: 0, stuckAtProvenance: 0 },
          },
      overallStatus,
      degradedReasons,
    };
  }

  private async checkDatabase(): Promise<ServiceHealthItem> {
    const now = new Date().toISOString();
    try {
      const { error } = await supabaseAdmin
        .from('journal_entries')
        .select('id')
        .limit(1);

      if (error) {
        return { name: 'database', status: 'degraded', detail: error.message, checkedAt: now };
      }
      return { name: 'database', status: 'ok', detail: 'Supabase reachable', checkedAt: now };
    } catch (err) {
      return { name: 'database', status: 'unavailable', detail: String(err), checkedAt: now };
    }
  }

  private async checkOpenAI(): Promise<ServiceHealthItem> {
    const now = new Date().toISOString();
    if (!config.openAiKey) {
      return { name: 'openai', status: 'unavailable', detail: 'OPENAI_API_KEY not set', checkedAt: now };
    }
    // Don't actually call OpenAI — just verify the key is non-empty and looks valid
    const keyLooksValid = config.openAiKey.startsWith('sk-') && config.openAiKey.length > 20;
    return {
      name: 'openai',
      status: keyLooksValid ? 'ok' : 'degraded',
      detail: keyLooksValid ? 'API key present and well-formed' : 'API key present but malformed',
      checkedAt: now,
    };
  }

  private async gatherMetrics(): Promise<{
    activeUsersLast24h:     number;
    entriesLast24h:         number;
    entitiesLast24h:        number;
    contradictionsOpen:     number;
    provenanceWriteSuccess: number;
    entityMergeFailures:    number;
    migrationVersion:       string;
  }> {
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      entriesResult,
      entitiesResult,
      contradictionsResult,
      provenanceResult,
      mergeFailuresResult,
      migrationResult,
    ] = await Promise.allSettled([
      supabaseAdmin
        .from('journal_entries')
        .select('id, user_id', { count: 'exact', head: true })
        .gte('created_at', windowStart),
      supabaseAdmin
        .from('omega_entities')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', windowStart),
      supabaseAdmin
        .from('continuity_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'CONTRADICTION_FOUND')
        .eq('resolved', false),
      supabaseAdmin
        .from('provenance_edges')
        .select('source_id', { count: 'exact', head: true })
        .gte('created_at', windowStart),
      supabaseAdmin
        .from('continuity_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'ENTITY_MERGE_FAILED')
        .gte('created_at', windowStart),
      supabaseAdmin
        .from('schema_migrations')
        .select('version')
        .order('version', { ascending: false })
        .limit(1),
    ]);

    const entriesCount      = entriesResult.status      === 'fulfilled' ? (entriesResult.value.count      ?? 0) : 0;
    const entitiesCount     = entitiesResult.status     === 'fulfilled' ? (entitiesResult.value.count     ?? 0) : 0;
    const contradictions    = contradictionsResult.status === 'fulfilled' ? (contradictionsResult.value.count ?? 0) : 0;
    const provenanceCount   = provenanceResult.status   === 'fulfilled' ? (provenanceResult.value.count   ?? 0) : 0;
    const mergeFailures     = mergeFailuresResult.status === 'fulfilled' ? (mergeFailuresResult.value.count ?? 0) : 0;
    const migrationRow      = migrationResult.status    === 'fulfilled' ? migrationResult.value.data?.[0]  : null;

    const provenanceWriteSuccess = entriesCount > 0
      ? Math.round((provenanceCount / entriesCount) * 100)
      : 100;

    // Approximate active users: distinct user_ids from entries (heuristic)
    let activeUsers = 0;
    if (entriesResult.status === 'fulfilled' && entriesResult.value.data) {
      activeUsers = new Set(
        (entriesResult.value.data as Array<{ user_id: string }>).map(r => r.user_id)
      ).size;
    }

    return {
      activeUsersLast24h:     activeUsers,
      entriesLast24h:         entriesCount,
      entitiesLast24h:        entitiesCount,
      contradictionsOpen:     contradictions,
      provenanceWriteSuccess,
      entityMergeFailures:    mergeFailures,
      migrationVersion:       migrationRow?.version ?? 'unknown',
    };
  }

  private unavailable(name: string, reason: string): ServiceHealthItem {
    return { name, status: 'unavailable', detail: reason, checkedAt: new Date().toISOString() };
  }
}

export const cognitionHealthService = new CognitionHealthService();
