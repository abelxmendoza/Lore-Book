/**
 * Main Lifestory Service
 * 
 * Maintains the user's main lifestory biography/lorebook that is always available.
 * Automatically updates when new chat entries are added.
 * Alternative versions can be generated from this main one.
 */

import { logger } from '../logger';

import { biographyGenerationEngine, type BiographySpec } from './biographyGeneration';
import { supabaseAdmin } from './supabaseClient';

const MAIN_LIFESTORY_NAME = 'My Full Life Story';
const MAIN_LIFESTORY_ID = 'main-lifestory';

class MainLifestoryService {
  /**
   * Ensure main lifestory biography exists and is up to date
   */
  async ensureMainLifestory(userId: string, forceRegenerate: boolean = false): Promise<void> {
    try {
      // Check if main lifestory exists
      const { data: existing } = await supabaseAdmin
        .from('biographies')
        .select('*')
        .eq('user_id', userId)
        .eq('is_core_lorebook', true)
        .eq('lorebook_name', MAIN_LIFESTORY_NAME)
        .order('lorebook_version', { ascending: false })
        .limit(1)
        .single();

      // If exists and not forcing regenerate, check if it needs update
      if (existing && !forceRegenerate) {
        const needsUpdate = await this.checkNeedsUpdate(userId, existing);
        if (!needsUpdate) {
          logger.debug({ userId }, 'Main lifestory is up to date');
          return;
        }
      }

      // Generate or regenerate main lifestory
      await this.generateMainLifestory(userId, existing?.lorebook_version || 1);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to ensure main lifestory');
      // Don't throw - this is a background service
    }
  }

  /**
   * Generate the main lifestory biography
   */
  private async generateMainLifestory(userId: string, version: number): Promise<void> {
    try {
      const spec: BiographySpec = {
        scope: 'full_life',
        tone: 'neutral',
        depth: 'detailed',
        audience: 'self',
        version: 'main',
        includeIntrospection: true,
        filterSensitive: false
      };

      logger.info({ userId, version }, 'Generating main lifestory biography');

      const biography = await biographyGenerationEngine.generateBiography(userId, {
        ...spec,
        isCoreLorebook: true,
        lorebookName: MAIN_LIFESTORY_NAME,
        lorebookVersion: version
      } as any);

      logger.info({ userId, biographyId: biography.id, version }, 'Main lifestory generated successfully');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to generate main lifestory');
      throw error;
    }
  }

  /**
   * Check if main lifestory needs updating based on new entries
   */
  private async checkNeedsUpdate(userId: string, existingBiography: any): Promise<boolean> {
    try {
      // Get the last update time of the biography
      const lastUpdate = new Date(existingBiography.updated_at || existingBiography.created_at);
      
      // Check if there are new entries since last update
      const { data: newEntries } = await supabaseAdmin
        .from('journal_entries')
        .select('id, date, created_at')
        .eq('user_id', userId)
        .gt('created_at', lastUpdate.toISOString())
        .limit(10);

      // If there are new entries, update is needed
      if (newEntries && newEntries.length > 0) {
        logger.debug({ userId, newEntriesCount: newEntries.length }, 'Main lifestory needs update');
        return true;
      }

      return false;
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to check if lifestory needs update, assuming it does');
      return true; // Err on the side of updating
    }
  }

  /**
   * Get the main lifestory biography (always available)
   */
  async getMainLifestory(userId: string): Promise<any | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('biographies')
        .select('*')
        .eq('user_id', userId)
        .eq('is_core_lorebook', true)
        .eq('lorebook_name', MAIN_LIFESTORY_NAME)
        .order('lorebook_version', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        // If doesn't exist, create it
        await this.ensureMainLifestory(userId, true);
        // Try again
        const { data: newData } = await supabaseAdmin
          .from('biographies')
          .select('*')
          .eq('user_id', userId)
          .eq('is_core_lorebook', true)
          .eq('lorebook_name', MAIN_LIFESTORY_NAME)
          .order('lorebook_version', { ascending: false })
          .limit(1)
          .single();
        return newData;
      }

      return data;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get main lifestory');
      return null;
    }
  }

  /**
   * Generate alternative version from main lifestory
   */
  async generateAlternativeVersion(
    userId: string,
    version: 'safe' | 'explicit' | 'private',
    options?: {
      tone?: BiographySpec['tone'];
      depth?: BiographySpec['depth'];
      audience?: BiographySpec['audience'];
    }
  ): Promise<any> {
    try {
      const spec: BiographySpec = {
        scope: 'full_life',
        tone: options?.tone || 'neutral',
        depth: options?.depth || 'detailed',
        audience: options?.audience || 'self',
        version: version,
        includeIntrospection: version === 'explicit' || version === 'private',
        filterSensitive: version === 'safe'
      };

      logger.info({ userId, version }, 'Generating alternative lifestory version');

      const biography = await biographyGenerationEngine.generateBiography(userId, spec);

      return biography;
    } catch (error) {
      logger.error({ error, userId, version }, 'Failed to generate alternative version');
      throw error;
    }
  }

  /**
   * Update main lifestory after new chat entry is saved
   * Called automatically after chat entries are saved
   */
  async updateAfterChatEntry(userId: string): Promise<void> {
    try {
      // Debounce updates - only update if last update was more than 5 minutes ago
      const { data: existing } = await supabaseAdmin
        .from('biographies')
        .select('updated_at')
        .eq('user_id', userId)
        .eq('is_core_lorebook', true)
        .eq('lorebook_name', MAIN_LIFESTORY_NAME)
        .order('lorebook_version', { ascending: false })
        .limit(1)
        .single();

      if (existing) {
        const lastUpdate = new Date(existing.updated_at);
        const now = new Date();
        const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);

        // Only update if it's been more than 5 minutes since last update
        if (minutesSinceUpdate < 5) {
          logger.debug({ userId, minutesSinceUpdate }, 'Skipping lifestory update (too recent)');
          return;
        }
      }

      // Trigger update (non-blocking)
      this.ensureMainLifestory(userId, false).catch(err => {
        logger.warn({ err, userId }, 'Background lifestory update failed');
      });
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to trigger lifestory update after chat entry');
      // Don't throw - this is a background service
    }
  }
}

export const mainLifestoryService = new MainLifestoryService();
