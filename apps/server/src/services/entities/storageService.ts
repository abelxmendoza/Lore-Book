import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { ResolvedEntity, ExtractedEntity, EntityMention } from './types';

/**
 * Storage layer for entities and mentions
 */
export class EntityStorage {
  /**
   * Load all entities for a user
   */
  async loadAll(userId: string): Promise<ResolvedEntity[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('entities')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        logger.error({ error }, 'Failed to load entities');
        return [];
      }

      return (data || []).map(e => ({
        id: e.id,
        canonical: e.canonical_name,
        aliases: e.aliases || [],
        type: e.type,
        confidence: e.confidence,
        user_id: e.user_id,
        created_at: e.created_at,
        updated_at: e.updated_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to load entities');
      return [];
    }
  }

  /**
   * Create a new entity
   */
  async createEntity(
    userId: string,
    entity: {
      canonical_name: string;
      aliases: string[];
      type: string;
      confidence?: number;
    }
  ): Promise<ResolvedEntity> {
    try {
      const { data, error } = await supabaseAdmin
        .from('entities')
        .insert({
          user_id: userId,
          canonical_name: entity.canonical_name,
          aliases: entity.aliases || [],
          type: entity.type,
          confidence: entity.confidence || 1.0,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to create entity');
        throw error;
      }

      return {
        id: data.id,
        canonical: data.canonical_name,
        aliases: data.aliases || [],
        type: data.type,
        confidence: data.confidence,
        user_id: data.user_id,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to create entity');
      throw error;
    }
  }

  /**
   * Link entity to a journal entry
   */
  async linkEntity(entityId: string, extracted: ExtractedEntity): Promise<void> {
    try {
      if (!extracted.userId) {
        logger.warn({ extracted }, 'Missing userId in extracted entity');
        return;
      }

      const { error } = await supabaseAdmin
        .from('entity_mentions')
        .insert({
          user_id: extracted.userId,
          entity_id: entityId,
          memory_id: extracted.memoryId,
          raw_text: extracted.raw,
        });

      if (error) {
        logger.error({ error, entityId, extracted }, 'Failed to link entity');
      }
    } catch (error) {
      logger.error({ error, entityId, extracted }, 'Failed to link entity');
    }
  }

  /**
   * Update entity aliases
   */
  async updateAliases(entityId: string, aliases: string[]): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('entities')
        .update({
          aliases,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entityId);

      if (error) {
        logger.error({ error, entityId }, 'Failed to update aliases');
      }
    } catch (error) {
      logger.error({ error, entityId }, 'Failed to update aliases');
    }
  }
}

