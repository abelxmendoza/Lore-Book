import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validateRequest';
import { logger } from '../logger';
import { supabaseAdmin } from '../lib/supabase';
import { encrypt, decrypt } from '../services/encryption';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Privacy settings schema
const privacySettingsSchema = z.object({
  dataRetentionDays: z.number().int().min(30).max(3650).optional(),
  allowAnalytics: z.boolean().optional(),
  allowDataSharing: z.boolean().optional(),
  encryptSensitiveData: z.boolean().optional(),
  autoDeleteAfterDays: z.number().int().min(0).max(3650).optional()
});

// Get user privacy settings
router.get(
  '/settings',
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    try {
      const { data, error } = await supabaseAdmin
        .from('user_privacy_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (!data) {
        // Return default settings
        return res.json({
          dataRetentionDays: 365,
          allowAnalytics: false,
          allowDataSharing: false,
          encryptSensitiveData: true,
          autoDeleteAfterDays: null
        });
      }

      // Decrypt sensitive settings if needed
      const settings = {
        ...data,
        encryptSensitiveData: data.encrypt_sensitive_data ?? true
      };

      res.json(settings);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to fetch privacy settings');
      throw error;
    }
  })
);

// Update privacy settings
router.put(
  '/settings',
  authMiddleware,
  validateBody(privacySettingsSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const settings = req.body;

    try {
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from('user_privacy_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      const settingsData = {
        user_id: userId,
        data_retention_days: settings.dataRetentionDays ?? 365,
        allow_analytics: settings.allowAnalytics ?? false,
        allow_data_sharing: settings.allowDataSharing ?? false,
        encrypt_sensitive_data: settings.encryptSensitiveData ?? true,
        auto_delete_after_days: settings.autoDeleteAfterDays ?? null,
        updated_at: new Date().toISOString()
      };

      if (fetchError && fetchError.code === 'PGRST116') {
        // Create new settings
        const { data, error } = await supabaseAdmin
          .from('user_privacy_settings')
          .insert(settingsData)
          .select()
          .single();

        if (error) throw error;
        res.json(data);
      } else {
        // Update existing settings
        const { data, error } = await supabaseAdmin
          .from('user_privacy_settings')
          .update(settingsData)
          .eq('user_id', userId)
          .select()
          .single();

        if (error) throw error;
        res.json(data);
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to update privacy settings');
      throw error;
    }
  })
);

// Request data export (GDPR)
router.post(
  '/export',
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    try {
      // Fetch all user data
      const [entries, characters, locations, chapters] = await Promise.all([
        supabaseAdmin.from('journal_entries').select('*').eq('user_id', userId),
        supabaseAdmin.from('people_places').select('*').eq('user_id', userId),
        supabaseAdmin.from('locations').select('*').eq('user_id', userId),
        supabaseAdmin.from('chapters').select('*').eq('user_id', userId)
      ]);

      const exportData = {
        userId,
        exportedAt: new Date().toISOString(),
        entries: entries.data || [],
        characters: characters.data || [],
        locations: locations.data || [],
        chapters: chapters.data || []
      };

      res.json({
        message: 'Data export initiated',
        downloadUrl: `/api/privacy/export/${userId}/download`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to export user data');
      throw error;
    }
  })
);

// Request data deletion (GDPR)
router.delete(
  '/delete-account',
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    try {
      // Delete all user data
      await Promise.all([
        supabaseAdmin.from('journal_entries').delete().eq('user_id', userId),
        supabaseAdmin.from('people_places').delete().eq('user_id', userId),
        supabaseAdmin.from('locations').delete().eq('user_id', userId),
        supabaseAdmin.from('chapters').delete().eq('user_id', userId),
        supabaseAdmin.from('user_privacy_settings').delete().eq('user_id', userId)
      ]);

      logger.info({ userId }, 'User account deleted');

      res.json({ message: 'Account and all data deleted successfully' });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to delete user account');
      throw error;
    }
  })
);

export { router as privacyRouter };

