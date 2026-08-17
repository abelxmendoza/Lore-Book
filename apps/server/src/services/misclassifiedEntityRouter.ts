/**
 * Routes misclassified mentions away from the Characters book into the omega graph.
 */

import { logger } from '../logger';
import { classifyMentionKind, type MentionClassification } from '../utils/entityMentionClassifier';
import { normalizeNameKey } from '../utils/nameNormalization';
import { supabaseAdmin } from './supabaseClient';
import { omegaMemoryService } from './omegaMemoryService';
import { omegaOrgPromotionService } from './entities/omegaOrgPromotionService';
import { omegaLocationPromotionService } from './entities/omegaLocationPromotionService';

type OmegaEntityRow = {
  id: string;
  primary_name: string;
  type: string;
  aliases?: string[] | null;
  mention_count?: number;
  metadata?: Record<string, unknown> | null;
};

class MisclassifiedEntityRouter {
  async routeRejectedMention(
    userId: string,
    name: string,
    reason: string,
    opts: { omegaEntityId?: string; threadId?: string | null; rawContext?: string } = {}
  ): Promise<void> {
    const classification = classifyMentionKind(name, opts.rawContext);
    if (classification.kind === 'person') return;

    await this.retypeOrCreateOmegaEntity(userId, name, classification, opts.omegaEntityId);
    logger.info({ userId, name, reason, kind: classification.kind }, 'Routed misclassified mention away from characters');
  }

  async retypeOrCreateOmegaEntity(
    userId: string,
    name: string,
    classification: MentionClassification,
    existingOmegaId?: string
  ): Promise<string | null> {
    const omegaType = classification.omegaType ?? 'EVENT';
    const canonicalName = classification.canonicalName ?? name;
    const subkind = classification.kind;

    if (existingOmegaId) {
      const { data: existing } = await supabaseAdmin
        .from('omega_entities')
        .select('id, primary_name, type, aliases, metadata')
        .eq('id', existingOmegaId)
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        const aliases = new Set<string>(Array.isArray(existing.aliases) ? existing.aliases : []);
        if (normalizeNameKey(existing.primary_name) !== normalizeNameKey(canonicalName)) {
          aliases.add(existing.primary_name);
        }
        if (normalizeNameKey(name) !== normalizeNameKey(canonicalName)) {
          aliases.add(name);
        }

        await supabaseAdmin
          .from('omega_entities')
          .update({
            type: omegaType,
            primary_name: canonicalName,
            aliases: aliases.size > 0 ? [...aliases] : null,
            metadata: {
              ...(existing.metadata as Record<string, unknown> ?? {}),
              subkind,
              rerouted_from: 'character_pipeline',
              rerouted_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingOmegaId)
          .eq('user_id', userId);

        this.schedulePromotion(userId, omegaType, existingOmegaId, canonicalName);
        return existingOmegaId;
      }
    }

    // Search by name across ALL types, not just the target type — otherwise a
    // mention that was previously (mis)classified under a different type
    // (e.g. PERSON) never gets found here, and this creates a second,
    // disconnected row instead of retyping the existing one. That's how
    // "East Los Productions" ended up as both a PERSON and an ORG entity.
    const nameKey = normalizeNameKey(canonicalName);
    const { data: rows } = await supabaseAdmin
      .from('omega_entities')
      .select('id, primary_name, type')
      .eq('user_id', userId);

    const match = (rows ?? []).find(
      (r) => normalizeNameKey(r.primary_name) === nameKey
    );
    if (match) {
      if (match.type !== omegaType) {
        await supabaseAdmin
          .from('omega_entities')
          .update({
            type: omegaType,
            metadata: { subkind, rerouted_from: 'character_pipeline', rerouted_at: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          })
          .eq('id', match.id)
          .eq('user_id', userId);
      }
      this.schedulePromotion(userId, omegaType, match.id as string, canonicalName);
      return match.id as string;
    }

    const { data: created, error } = await supabaseAdmin
      .from('omega_entities')
      .insert({
        user_id: userId,
        primary_name: canonicalName,
        type: omegaType,
        aliases: normalizeNameKey(name) !== nameKey ? [name] : [],
        mention_count: 1,
        mention_status: 'mentioned_only',
        metadata: { subkind, rerouted_from: 'character_pipeline' },
      })
      .select('id')
      .single();

    if (error) {
      logger.warn({ err: error, userId, name }, 'Failed to create rerouted omega entity');
      return null;
    }
    const createdId = created?.id as string;
    this.schedulePromotion(userId, omegaType, createdId, canonicalName);
    return createdId;
  }

  /**
   * Best-effort, non-fatal: propose a group_candidates review entry (ORG) or
   * create a real Place directly (LOCATION), so an omega entity doesn't sit
   * invisible to the Group Book / Places Book forever. Never throws — a
   * promotion failure must not break the calling mention classification flow.
   */
  private schedulePromotion(userId: string, omegaType: string, id: string | undefined, name: string): void {
    if (!id) return;
    if (omegaType === 'ORG') {
      void omegaOrgPromotionService
        .promoteEntity(userId, { id, primary_name: name })
        .catch((err) => logger.debug({ err, userId, id }, 'omega org promotion (best-effort) failed'));
    } else if (omegaType === 'LOCATION') {
      void omegaLocationPromotionService
        .promoteEntity(userId, { id, primary_name: name })
        .catch((err) => logger.debug({ err, userId, id }, 'omega location promotion (best-effort) failed'));
    }
  }

  /** Merge "Magic" + "Gathering" fragment entities into one game entity. */
  async mergeMtgFragments(userId: string, entityIds: string[]): Promise<string | null> {
    if (entityIds.length === 0) return null;
    const classification: MentionClassification = {
      kind: 'game',
      omegaType: 'ORG',
      canonicalName: 'Magic: The Gathering',
      reason: 'mtg_merge',
    };
    const primaryId = await this.retypeOrCreateOmegaEntity(userId, 'Magic: The Gathering', classification, entityIds[0]);
    if (!primaryId) return null;

    for (const id of entityIds.slice(1)) {
      if (id === primaryId) continue;
      await omegaMemoryService.mergeEntities(userId, id, primaryId, {
        actor: 'SYSTEM',
        reason: 'Deterministic Magic: The Gathering fragment consolidation',
        evidenceIds: entityIds.map((entityId) => `omega-entity:${entityId}`),
      });
    }
    return primaryId;
  }
}

export const misclassifiedEntityRouter = new MisclassifiedEntityRouter();
