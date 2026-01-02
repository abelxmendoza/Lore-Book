import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { EngineManifestEntry } from './types';

/**
 * Loads engine manifest entries from database
 */
export class RegistryLoader {
  /**
   * Load all engines
   */
  static async loadAll(): Promise<EngineManifestEntry[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('engine_manifest')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        logger.error({ error }, 'Failed to load all engines');
        return [];
      }

      return (data || []) as EngineManifestEntry[];
    } catch (error) {
      logger.error({ error }, 'Failed to load all engines');
      return [];
    }
  }

  /**
   * Load a specific engine by name
   */
  static async load(name: string): Promise<EngineManifestEntry | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('engine_manifest')
        .select('*')
        .eq('name', name)
        .single();

      if (error || !data) {
        logger.debug({ error, name }, 'Engine not found');
        return null;
      }

      return data as EngineManifestEntry;
    } catch (error) {
      logger.error({ error, name }, 'Failed to load engine');
      return null;
    }
  }
}

