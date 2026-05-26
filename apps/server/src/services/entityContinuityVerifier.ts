// =====================================================
// ENTITY CONTINUITY VERIFIER
//
// Pipeline coherence check: ingestion → extraction → entity → provenance
//
// Distinct from entityLifecycleDiagnostics (per-entity history).
// This answers: "Did recent ingestion actually flow through?"
//
// Returns per-entry pipeline status so callers can detect silent drops.
// Read-only — no side effects.
// =====================================================

import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';

// ─── Types ─────────────────────────────────────────────────────────────────

export type PipelineStageStatus = 'ok' | 'missing' | 'error';

export interface EntryPipelineStatus {
  entryId: string;
  createdAt: string;
  stages: {
    ingested:   PipelineStageStatus; // entry exists in journal_entries
    extracted:  PipelineStageStatus; // omega_claims or entity_mentions exist for this entry
    entityized: PipelineStageStatus; // at least one omega_entity or entity linked
    provenance: PipelineStageStatus; // provenance_edges written for this entry's artifacts
  };
  entityCount: number;
  claimCount:  number;
  edgeCount:   number;
  gapAt: 'extracted' | 'entityized' | 'provenance' | null;
}

export interface PipelineVerificationResult {
  userId: string;
  windowHours: number;
  checkedAt: string;
  entriesChecked: number;
  entriesFullyPropagated: number;
  entriesWithGaps: number;
  gapBreakdown: {
    stuckAtExtraction: number;
    stuckAtEntityization: number;
    stuckAtProvenance: number;
  };
  overallHealth: 'healthy' | 'degraded' | 'broken';
  entries: EntryPipelineStatus[];
  summary: string;
}

// ─── Service ───────────────────────────────────────────────────────────────

class EntityContinuityVerifier {

  async verify(
    userId: string,
    windowHours = 24,
    maxEntries = 20,
  ): Promise<PipelineVerificationResult> {
    const checkedAt = new Date().toISOString();
    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

    // Fetch recent entries in window
    const { data: entries, error: entriesError } = await supabaseAdmin
      .from('journal_entries')
      .select('id, created_at')
      .eq('user_id', userId)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false })
      .limit(maxEntries);

    if (entriesError) {
      logger.error({ err: entriesError, userId }, 'EntityContinuityVerifier: failed to fetch entries');
      return this.errorResult(userId, windowHours, checkedAt, 'Failed to fetch entries');
    }

    if (!entries || entries.length === 0) {
      return {
        userId,
        windowHours,
        checkedAt,
        entriesChecked: 0,
        entriesFullyPropagated: 0,
        entriesWithGaps: 0,
        gapBreakdown: { stuckAtExtraction: 0, stuckAtEntityization: 0, stuckAtProvenance: 0 },
        overallHealth: 'healthy',
        entries: [],
        summary: `No entries in the last ${windowHours}h window.`,
      };
    }

    const entryIds = entries.map(e => e.id);

    // Batch-fetch pipeline artifacts for all entries at once
    const [claimsResult, mentionsResult, edgesResult] = await Promise.allSettled([
      supabaseAdmin
        .from('omega_claims')
        .select('id, source_entry_id, entity_id')
        .eq('user_id', userId)
        .in('source_entry_id', entryIds),
      supabaseAdmin
        .from('entity_mentions')
        .select('id, memory_id, entity_id')
        .eq('user_id', userId)
        .in('memory_id', entryIds),
      supabaseAdmin
        .from('provenance_edges')
        .select('id, source_id, target_id, relation')
        .eq('user_id', userId)
        .in('source_id', entryIds),
    ]);

    const claims   = claimsResult.status   === 'fulfilled' ? (claimsResult.value.data   || []) : [];
    const mentions = mentionsResult.status === 'fulfilled' ? (mentionsResult.value.data || []) : [];
    const edges    = edgesResult.status    === 'fulfilled' ? (edgesResult.value.data    || []) : [];

    // Build per-entry lookup maps
    const claimsByEntry   = this.groupBy(claims,   'source_entry_id');
    const mentionsByEntry = this.groupBy(mentions, 'memory_id');
    const edgesByEntry    = this.groupBy(edges,    'source_id');

    const entryStatuses: EntryPipelineStatus[] = entries.map(entry => {
      const entryClaims   = claimsByEntry[entry.id]   || [];
      const entryMentions = mentionsByEntry[entry.id] || [];
      const entryEdges    = edgesByEntry[entry.id]    || [];

      const claimCount  = entryClaims.length;
      const mentionCount = entryMentions.length;
      const entityCount = new Set([
        ...entryClaims.filter(c => c.entity_id).map(c => c.entity_id),
        ...entryMentions.filter(m => m.entity_id).map(m => m.entity_id),
      ]).size;
      const edgeCount = entryEdges.length;

      const hasExtraction  = claimCount > 0 || mentionCount > 0;
      const hasEntityized  = entityCount > 0;
      const hasProvenance  = edgeCount > 0;

      const stages = {
        ingested:   'ok' as PipelineStageStatus,
        extracted:  hasExtraction ? 'ok'  : 'missing',
        entityized: hasEntityized ? 'ok'  : (hasExtraction ? 'missing' : 'missing'),
        provenance: hasProvenance ? 'ok'  : (hasEntityized ? 'missing' : 'missing'),
      } as EntryPipelineStatus['stages'];

      let gapAt: EntryPipelineStatus['gapAt'] = null;
      if (!hasExtraction)      gapAt = 'extracted';
      else if (!hasEntityized) gapAt = 'entityized';
      else if (!hasProvenance) gapAt = 'provenance';

      return {
        entryId:    entry.id,
        createdAt:  entry.created_at,
        stages,
        entityCount,
        claimCount,
        edgeCount,
        gapAt,
      };
    });

    // Aggregate
    const fullyPropagated = entryStatuses.filter(e => e.gapAt === null).length;
    const withGaps        = entryStatuses.filter(e => e.gapAt !== null).length;
    const gapBreakdown = {
      stuckAtExtraction:  entryStatuses.filter(e => e.gapAt === 'extracted').length,
      stuckAtEntityization: entryStatuses.filter(e => e.gapAt === 'entityized').length,
      stuckAtProvenance:  entryStatuses.filter(e => e.gapAt === 'provenance').length,
    };

    const gapRatio = entries.length > 0 ? withGaps / entries.length : 0;
    const overallHealth: PipelineVerificationResult['overallHealth'] =
      gapRatio === 0   ? 'healthy'  :
      gapRatio < 0.5   ? 'degraded' : 'broken';

    const summary = [
      `${entries.length} entries in ${windowHours}h window.`,
      `${fullyPropagated} fully propagated, ${withGaps} with gaps.`,
      withGaps > 0 ? `Gaps: ${gapBreakdown.stuckAtExtraction} at extraction, ${gapBreakdown.stuckAtEntityization} at entityization, ${gapBreakdown.stuckAtProvenance} at provenance.` : '',
    ].filter(Boolean).join(' ');

    logger.debug({ userId, overallHealth, entriesChecked: entries.length, withGaps }, 'EntityContinuityVerifier complete');

    return {
      userId,
      windowHours,
      checkedAt,
      entriesChecked: entries.length,
      entriesFullyPropagated: fullyPropagated,
      entriesWithGaps: withGaps,
      gapBreakdown,
      overallHealth,
      entries: entryStatuses,
      summary,
    };
  }

  private groupBy<T extends Record<string, unknown>>(
    items: T[],
    key: string,
  ): Record<string, T[]> {
    return items.reduce<Record<string, T[]>>((acc, item) => {
      const k = String(item[key] ?? '');
      if (!acc[k]) acc[k] = [];
      acc[k].push(item);
      return acc;
    }, {});
  }

  private errorResult(
    userId: string,
    windowHours: number,
    checkedAt: string,
    reason: string,
  ): PipelineVerificationResult {
    return {
      userId,
      windowHours,
      checkedAt,
      entriesChecked: 0,
      entriesFullyPropagated: 0,
      entriesWithGaps: 0,
      gapBreakdown: { stuckAtExtraction: 0, stuckAtEntityization: 0, stuckAtProvenance: 0 },
      overallHealth: 'broken',
      entries: [],
      summary: `Verification failed: ${reason}`,
    };
  }
}

export const entityContinuityVerifier = new EntityContinuityVerifier();
