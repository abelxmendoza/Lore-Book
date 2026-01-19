import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { EngineManifestRecord, EngineBlueprint, EngineEmbedding } from './manifestTypes';

/**
 * CRUD interface for engine manifest
 */
export class ManifestService {
  /**
   * Upsert manifest records
   */
  async upsertManifest(records: EngineManifestRecord[]): Promise<void> {
    try {
      for (const record of records) {
        const { error } = await supabaseAdmin
          .from('engine_manifest')
          .upsert(
            {
              name: record.name,
              category: record.category,
              status: record.status,
              version: record.version,
              description: record.description,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'name' }
          );

        if (error) {
          logger.error({ error, engine: record.name }, 'Failed to upsert engine manifest');
        }
      }

      logger.info({ count: records.length }, 'Upserted engine manifest records');
    } catch (error) {
      logger.error({ error }, 'Failed to upsert manifest');
      throw error;
    }
  }

  /**
   * Add blueprint for an engine
   */
  async addBlueprint(engineName: string, blueprint: string): Promise<void> {
    try {
      // Get engine ID
      const { data: engine, error: engineError } = await supabaseAdmin
        .from('engine_manifest')
        .select('id')
        .eq('name', engineName)
        .single();

      if (engineError || !engine) {
        logger.error({ error: engineError, engineName }, 'Engine not found for blueprint');
        return;
      }

      // Insert blueprint
      const { error } = await supabaseAdmin
        .from('engine_blueprints')
        .insert({
          engine_id: engine.id,
          blueprint,
          format: 'markdown',
        });

      if (error) {
        logger.error({ error, engineName }, 'Failed to add blueprint');
      } else {
        logger.debug({ engineName }, 'Added blueprint');
      }
    } catch (error) {
      logger.error({ error, engineName }, 'Failed to add blueprint');
      throw error;
    }
  }

  /**
   * List all engines
   */
  async listEngines(): Promise<EngineManifestRecord[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('engine_manifest')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        logger.error({ error }, 'Failed to list engines');
        return [];
      }

      return (data || []) as EngineManifestRecord[];
    } catch (error) {
      logger.error({ error }, 'Failed to list engines');
      return [];
    }
  }

  /**
   * Get blueprint for an engine
   */
  async getBlueprint(engineName: string): Promise<string | null> {
    try {
      // Get engine ID
      const { data: engine } = await supabaseAdmin
        .from('engine_manifest')
        .select('id')
        .eq('name', engineName)
        .single();

      if (!engine) {
        return null;
      }

      // Get latest blueprint
      const { data } = await supabaseAdmin
        .from('engine_blueprints')
        .select('blueprint')
        .eq('engine_id', engine.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      return data?.blueprint || null;
    } catch (error) {
      logger.error({ error, engineName }, 'Failed to get blueprint');
      return null;
    }
  }

  /**
   * Add embedding for an engine
   */
  async addEmbedding(engineName: string, embedding: number[], tokens: number): Promise<void> {
    try {
      // Get engine ID
      const { data: engine } = await supabaseAdmin
        .from('engine_manifest')
        .select('id')
        .eq('name', engineName)
        .single();

      if (!engine) {
        logger.error({ engineName }, 'Engine not found for embedding');
        return;
      }

      // Delete old embeddings and insert new one
      await supabaseAdmin
        .from('engine_embeddings')
        .delete()
        .eq('engine_id', engine.id);

      const { error } = await supabaseAdmin
        .from('engine_embeddings')
        .insert({
          engine_id: engine.id,
          embedding,
          tokens,
        });

      if (error) {
        logger.error({ error, engineName }, 'Failed to add embedding');
      } else {
        logger.debug({ engineName }, 'Added embedding');
      }
    } catch (error) {
      logger.error({ error, engineName }, 'Failed to add embedding');
      throw error;
    }
  }
}

