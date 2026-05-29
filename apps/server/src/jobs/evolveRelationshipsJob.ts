import cron from 'node-cron';

import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';
import { trainingSignalLogger } from '../services/neural/trainingSignalLogger';
import {
  computeRelationshipStrength,
  determinePhase,
  updateTemporalEdge,
  fetchActiveTemporalEdges,
  writeRelationshipSnapshot,
  decayStaleEdges,
} from '../er/temporalEdgeService';
import type { TemporalEdgeRow } from '../er/temporalEdgeService';

/**
 * Evolve Relationships Job — Phase 3.1
 * Recomputes strength/phase for active temporal edges; when phase changes, updates edge and
 * writes snapshot. For EPISODIC + DORMANT, sets phase=ENDED, active=false, end_time=now.
 * Runs weekly (Sundays 2:00 AM), before episodicClosureJob (3:00 AM).
 */
class EvolveRelationshipsJob {
  async runForAllUsers(): Promise<void> {
    try {
      logger.info('Starting evolve relationships job');

      const { data: rows } = await supabaseAdmin
        .from('temporal_edges')
        .select('user_id')
        .eq('active', true)
        .limit(10000);

      const userIds = [...new Set((rows || []).map((r: { user_id: string }) => r.user_id))];

      if (userIds.length === 0) {
        logger.info('No users with active temporal edges');
        return;
      }

      logger.info({ userCount: userIds.length }, 'Evolving relationships for users');

      let totalUpdated = 0;
      let totalEnded = 0;
      let totalDecayed = 0;
      for (const userId of userIds) {
        const { updated, ended } = await this.evolveForUser(userId);
        totalUpdated += updated;
        totalEnded += ended;
        // Apply time-based phase decay (CORE→ACTIVE→WEAK→DORMANT→ENDED)
        totalDecayed += await decayStaleEdges(userId);
      }

      logger.info({ userCount: userIds.length, updated: totalUpdated, ended: totalEnded, decayed: totalDecayed }, 'Evolve relationships job completed');
    } catch (error) {
      logger.error({ err: error }, 'Evolve relationships job failed');
    }
  }

  async evolveForUser(userId: string): Promise<{ updated: number; ended: number }> {
    const edges = await fetchActiveTemporalEdges(userId);
    let updated = 0;
    let ended = 0;

    for (const edge of edges as (TemporalEdgeRow & { scope?: string })[]) {
      const strength = computeRelationshipStrength(edge);
      const nextPhase = determinePhase(strength);

      if (nextPhase === edge.phase) continue;

      const isEnded = edge.kind === 'EPISODIC' && nextPhase === 'DORMANT';
      const phaseToWrite = isEnded ? 'ENDED' : nextPhase;

      await updateTemporalEdge(edge.id, {
        phase: phaseToWrite,
        active: !isEnded,
        end_time: isEnded ? new Date().toISOString() : undefined,
      });

      await writeRelationshipSnapshot({ ...edge, phase: phaseToWrite }, edge.scope);

      const daysSince = edge.last_evidence_at
        ? Math.floor((Date.now() - new Date(edge.last_evidence_at).getTime()) / 86_400_000)
        : 0;
      trainingSignalLogger.logTransition({
        userId,
        edgeId: edge.id,
        fromPhase: edge.phase,
        toPhase: phaseToWrite,
        daysSinceLastEvidence: daysSince,
        confidence: edge.confidence,
        kind: edge.kind,
        trigger: 'decay',
      });

      updated++;
      if (isEnded) ended++;
    }

    return { updated, ended };
  }

  register(): void {
    cron.schedule('0 2 * * 0', async () => {
      logger.info('Running evolve relationships job');
      await this.runForAllUsers();
    });
    logger.info('Evolve relationships job registered (runs Sundays at 2:00 AM, before episodic closure)');
  }
}

export const evolveRelationshipsJob = new EvolveRelationshipsJob();
