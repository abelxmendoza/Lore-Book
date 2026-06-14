/**
 * When a misclassified name was promoted to a character card, deleting it should
 * preserve knowledge by retyping the omega entity and migrating facts to claims.
 */

import { logger } from '../logger';
import {
  classifyMentionKind,
  type MentionClassification,
} from '../utils/entityMentionClassifier';
import { normalizeNameKey } from '../utils/nameNormalization';
import { misclassifiedEntityRouter } from './misclassifiedEntityRouter';
import { supabaseAdmin } from './supabaseClient';

export type RedistributionReport = {
  redistributed: boolean;
  kind: string;
  omegaEntityId: string | null;
  factsMigrated: number;
  claimsCreated: number;
  identityIndexRemoved: number;
};

class CharacterMisclassificationRedistributionService {
  async redistributeBeforeDelete(
    userId: string,
    character: { id: string; name: string; metadata: Record<string, unknown> | null },
    force = false
  ): Promise<RedistributionReport> {
    const classification = classifyMentionKind(character.name);
    const report: RedistributionReport = {
      redistributed: false,
      kind: classification.kind,
      omegaEntityId: null,
      factsMigrated: 0,
      claimsCreated: 0,
      identityIndexRemoved: 0,
    };

    if (classification.kind === 'person' && !force) {
      return report;
    }

    const omegaId =
      (character.metadata?.omega_entity_id as string | undefined) ??
      (await this.findOmegaEntityId(userId, character.name));

    report.omegaEntityId = await misclassifiedEntityRouter.retypeOrCreateOmegaEntity(
      userId,
      character.name,
      classification.kind === 'person'
        ? ({ kind: 'event', omegaType: 'EVENT', canonicalName: character.name } as MentionClassification)
        : classification,
      omegaId ?? undefined
    );

    if (!report.omegaEntityId) {
      logger.warn({ userId, characterId: character.id, name: character.name }, 'Redistribution: no omega entity to attach knowledge');
      return report;
    }

    const { data: facts } = await supabaseAdmin
      .from('entity_facts')
      .select('id, fact, confidence, first_seen_at, category')
      .eq('user_id', userId)
      .eq('entity_type', 'character')
      .eq('entity_id', character.id);

    report.factsMigrated = facts?.length ?? 0;

    if (facts?.length) {
      const now = new Date().toISOString();
      for (const row of facts) {
        const { error } = await supabaseAdmin.from('omega_claims').insert({
          user_id: userId,
          entity_id: report.omegaEntityId,
          text: row.fact as string,
          source: 'USER',
          confidence: (row.confidence as number) ?? 0.7,
          start_time: (row.first_seen_at as string) ?? now,
          is_active: true,
          metadata: {
            migrated_from: 'character',
            character_id: character.id,
            category: row.category,
          },
        });
        if (!error) report.claimsCreated += 1;
      }
    }

    const { data: indexRows } = await supabaseAdmin
      .from('character_identity_index')
      .delete()
      .eq('user_id', userId)
      .eq('character_id', character.id)
      .select('id');

    report.identityIndexRemoved = indexRows?.length ?? 0;
    report.redistributed = true;

    logger.info({ userId, characterId: character.id, ...report }, 'Redistributed misclassified character knowledge');
    return report;
  }

  private async findOmegaEntityId(userId: string, name: string): Promise<string | null> {
    const key = normalizeNameKey(name);
    const { data } = await supabaseAdmin
      .from('omega_entities')
      .select('id, primary_name')
      .eq('user_id', userId);

    const match = (data ?? []).find((r) => normalizeNameKey(r.primary_name) === key);
    return match?.id ?? null;
  }
}

export const characterMisclassificationRedistributionService =
  new CharacterMisclassificationRedistributionService();
