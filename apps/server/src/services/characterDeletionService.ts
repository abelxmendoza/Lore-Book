/**
 * CharacterDeletionService — removes a character and the derived data the
 * FK cascades can't reach.
 *
 * Before destructive deletes, entityDeletionRecoveryService preserves carried
 * lore (facts → claims), records a learning signal, and requeues source
 * messages for reprocessing so conversation evidence is not lost.
 */

import { logger } from '../logger';

import { entityDeletionRecoveryService } from './entityDeletionRecoveryService';
import { supabaseAdmin } from './supabaseClient';

export interface DeletionReport {
  characterId: string;
  name: string;
  entityFactsDeleted: number;
  eventsDeleted: number;
  eventsDetached: number;
  omegaEntityDeleted: boolean;
  recovery?: {
    eventId: string;
    preserveOmega: boolean;
    omegaEntityId: string | null;
    factsPreserved: number;
    claimsCreated: number;
    reprocessJobsQueued: number;
    deletionCount: number;
    sourceMessagesFound: number;
  };
  redistribution?: {
    redistributed: boolean;
    kind: string;
    omegaEntityId: string | null;
    factsMigrated: number;
    claimsCreated: number;
  };
}

class CharacterDeletionService {
  async deleteCharacter(
    userId: string,
    characterId: string,
    opts: { deleteEvents?: boolean; redistribute?: boolean; reason?: string } = {}
  ): Promise<DeletionReport | null> {
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata')
      .eq('id', characterId)
      .eq('user_id', userId)
      .single();
    if (!character) return null;

    const report: DeletionReport = {
      characterId,
      name: character.name,
      entityFactsDeleted: 0,
      eventsDeleted: 0,
      eventsDetached: 0,
      omegaEntityDeleted: false,
    };

    const recovery = await entityDeletionRecoveryService.runBeforeCharacterDelete(
      userId,
      character as { id: string; name: string; alias?: string[] | null; metadata: Record<string, unknown> | null },
      { reason: opts.reason, mode: 'permanent' }
    );
    report.recovery = {
      eventId: recovery.eventId,
      preserveOmega: recovery.preserveOmega,
      omegaEntityId: recovery.omegaEntityId,
      factsPreserved: recovery.factsPreserved,
      claimsCreated: recovery.claimsCreated,
      reprocessJobsQueued: recovery.reprocessJobsQueued,
      deletionCount: recovery.deletionCount,
      sourceMessagesFound: recovery.sourceMessageIds.length,
    };

    const shouldRedistribute = opts.redistribute !== false && !recovery.preserveOmega;
    if (shouldRedistribute) {
      const { characterMisclassificationRedistributionService } = await import(
        './characterMisclassificationRedistributionService'
      );
      const redistribution = await characterMisclassificationRedistributionService.redistributeBeforeDelete(
        userId,
        character as { id: string; name: string; metadata: Record<string, unknown> | null }
      );
      report.redistribution = {
        redistributed: redistribution.redistributed,
        kind: redistribution.kind,
        omegaEntityId: redistribution.omegaEntityId,
        factsMigrated: redistribution.factsMigrated,
        claimsCreated: redistribution.claimsCreated,
      };
    }

    const { data: deletedFacts } = await supabaseAdmin
      .from('entity_facts')
      .delete()
      .eq('user_id', userId)
      .eq('entity_type', 'character')
      .eq('entity_id', characterId)
      .select('id');
    report.entityFactsDeleted = deletedFacts?.length ?? 0;

    const meta = (character.metadata as Record<string, unknown> | null) ?? {};
    const omegaId =
      recovery.omegaEntityId ??
      (meta.omega_entity_id as string | undefined);
    const preserveOmega = recovery.preserveOmega || report.redistribution?.redistributed === true;

    if (omegaId) {
      const { data: events } = await supabaseAdmin
        .from('resolved_events')
        .select('id, people')
        .eq('user_id', userId)
        .contains('people', [omegaId]);

      for (const ev of (events ?? []) as Array<{ id: string; people: string[] | null }>) {
        if (preserveOmega || !opts.deleteEvents) {
          await supabaseAdmin
            .from('resolved_events')
            .update({ people: (ev.people ?? []).filter((p) => p !== omegaId) })
            .eq('id', ev.id)
            .eq('user_id', userId);
          report.eventsDetached++;
        } else if (opts.deleteEvents) {
          await supabaseAdmin.from('resolved_events').delete().eq('id', ev.id).eq('user_id', userId);
          report.eventsDeleted++;
        }
      }

      if (!preserveOmega) {
        const { error: omegaErr } = await supabaseAdmin
          .from('omega_entities')
          .delete()
          .eq('id', omegaId)
          .eq('user_id', userId);
        report.omegaEntityDeleted = !omegaErr;
      }
    }

    const { error } = await supabaseAdmin
      .from('characters')
      .delete()
      .eq('id', characterId)
      .eq('user_id', userId);
    if (error) {
      logger.error({ err: error, characterId }, 'Failed to delete character row');
      throw error;
    }

    logger.info({ userId, ...report }, 'Character deleted');
    return report;
  }
}

export const characterDeletionService = new CharacterDeletionService();
