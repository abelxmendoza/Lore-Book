// =====================================================
// LOREKEEPER PHASE 3.6
// Canon Service - User override and management
// =====================================================

import { logger } from '../../logger';
import { canonDetectionService } from '../canonDetectionService';
import { supabaseAdmin } from '../supabaseClient';

import type { CanonStatus, CanonMetadata } from './types';

export class CanonService {
  /**
   * Override canon status for an entry (user-initiated, auditable)
   */
  async overrideCanon(
    entryId: string,
    status: CanonStatus,
    userId: string
  ): Promise<CanonMetadata> {
    try {
      const metadata = canonDetectionService.overrideCanon(entryId, status, userId);

      // Update entry IR
      const { error } = await supabaseAdmin
        .from('entry_ir')
        .update({
          canon: metadata,
        })
        .eq('id', entryId)
        .eq('user_id', userId);

      if (error) throw error;

      logger.info({ entryId, status, userId }, 'User overrode canon status');
      return metadata;
    } catch (error) {
      logger.error({ error, entryId, status, userId }, 'Failed to override canon status');
      throw error;
    }
  }

  /**
   * Get canon status for an entry
   */
  async getCanonStatus(entryId: string, userId: string): Promise<CanonMetadata | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('entry_ir')
        .select('canon')
        .eq('id', entryId)
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      return data.canon as CanonMetadata;
    } catch (error) {
      logger.debug({ error, entryId }, 'Failed to get canon status');
      return null;
    }
  }

  /**
   * Get all entries by canon status
   */
  async getEntriesByCanonStatus(
    userId: string,
    status: CanonStatus,
    limit: number = 100
  ): Promise<string[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('entry_ir')
        .select('id')
        .eq('user_id', userId)
        .eq('canon->>status', status)
        .limit(limit);

      if (error) throw error;

      return (data || []).map(e => e.id);
    } catch (error) {
      logger.error({ error, userId, status }, 'Failed to get entries by canon status');
      return [];
    }
  }
}

export const canonService = new CanonService();

