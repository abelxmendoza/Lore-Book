import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { supabaseAdmin } from '../services/supabaseClient';
import { logger } from '../logger';

const router = Router();

// User profile schema
const profileUpdateSchema = z.object({
  name: z.string().optional(),
  bio: z.string().optional(),
  avatar_url: z.string().url().optional(),
  persona: z.string().optional(),
});

// Privacy settings schema
const privacySettingsSchema = z.object({
  profileVisibility: z.enum(['private', 'public', 'friends']).optional(),
  showEmail: z.boolean().optional(),
  allowDataSharing: z.boolean().optional(),
  twoFactorEnabled: z.boolean().optional(),
});

/**
 * GET /api/user/profile
 * Get user profile
 */
router.get('/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const user = req.user!;

    const profile = {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.full_name || user.user_metadata?.name || '',
      bio: user.user_metadata?.bio || '',
      avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
      persona: user.user_metadata?.persona || user.user_metadata?.personas?.[0] || '',
      created_at: user.created_at,
      updated_at: user.updated_at || user.created_at,
    };

    res.json({ profile });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch user profile');
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

/**
 * PUT /api/user/profile
 * Update user profile
 */
router.put('/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = req.user!.id;
    const updates = parsed.data;

    // Update user metadata via Supabase Admin
    const { data: { user: currentUser }, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (fetchError) {
      throw fetchError;
    }

    const { data: { user }, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        user_metadata: {
          ...(currentUser?.user_metadata || {}),
          ...(updates.name && { full_name: updates.name, name: updates.name }),
          ...(updates.bio && { bio: updates.bio }),
          ...(updates.avatar_url && { avatar_url: updates.avatar_url, picture: updates.avatar_url }),
          ...(updates.persona && { persona: updates.persona }),
        },
      }
    );

    if (updateError) {
      throw updateError;
    }

    const profile = {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.full_name || user.user_metadata?.name || '',
      bio: user.user_metadata?.bio || '',
      avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
      persona: user.user_metadata?.persona || '',
      created_at: user.created_at,
      updated_at: new Date().toISOString(),
    };

    res.json({ profile });
  } catch (error) {
    logger.error({ error }, 'Failed to update user profile');
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

/**
 * GET /api/user/privacy-settings
 * Get user privacy settings
 */
router.get('/privacy-settings', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    // Try to get from database first
    const { data, error } = await supabaseAdmin
      .from('user_privacy_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (data) {
      return res.json({
        settings: {
          profileVisibility: data.profile_visibility || 'private',
          showEmail: data.show_email || false,
          allowDataSharing: data.allow_data_sharing || false,
          twoFactorEnabled: data.two_factor_enabled || false,
        },
      });
    }

    // Return defaults if not found
    res.json({
      settings: {
        profileVisibility: 'private',
        showEmail: false,
        allowDataSharing: false,
        twoFactorEnabled: false,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch privacy settings');
    // Return defaults on error
    res.json({
      settings: {
        profileVisibility: 'private',
        showEmail: false,
        allowDataSharing: false,
        twoFactorEnabled: false,
      },
    });
  }
});

/**
 * PUT /api/user/privacy-settings
 * Update user privacy settings
 */
router.put('/privacy-settings', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = privacySettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = req.user!.id;
    const settings = parsed.data;

    const settingsData = {
      user_id: userId,
      profile_visibility: settings.profileVisibility || 'private',
      show_email: settings.showEmail ?? false,
      allow_data_sharing: settings.allowDataSharing ?? false,
      two_factor_enabled: settings.twoFactorEnabled ?? false,
      updated_at: new Date().toISOString(),
    };

    // Try to update existing
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('user_privacy_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code === 'PGRST116') {
      // Create new
      const { data, error: insertError } = await supabaseAdmin
        .from('user_privacy_settings')
        .insert(settingsData)
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      return res.json({
        settings: {
          profileVisibility: data.profile_visibility,
          showEmail: data.show_email,
          allowDataSharing: data.allow_data_sharing,
          twoFactorEnabled: data.two_factor_enabled,
        },
      });
    }

    // Update existing
    const { data, error: updateError } = await supabaseAdmin
      .from('user_privacy_settings')
      .update(settingsData)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    res.json({
      settings: {
        profileVisibility: data.profile_visibility,
        showEmail: data.show_email,
        allowDataSharing: data.allow_data_sharing,
        twoFactorEnabled: data.two_factor_enabled,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update privacy settings');
    res.status(500).json({ error: 'Failed to update privacy settings' });
  }
});

/**
 * GET /api/user/activity
 * Get user activity logs
 */
router.get('/activity', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;

    // Try to get from database
    const { data, error } = await supabaseAdmin
      .from('user_activity_logs')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error && error.code !== '42P01') {
      // If table doesn't exist, return empty array
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return res.json({ logs: [] });
      }
      throw error;
    }

    const logs = (data || []).map((log) => ({
      id: log.id,
      action: log.action || 'Unknown',
      location: log.location || log.ip_address || 'Unknown',
      device: log.device || log.user_agent || 'Unknown',
      timestamp: log.timestamp || log.created_at,
      ip_address: log.ip_address,
    }));

    res.json({ logs });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch activity logs');
    // Return empty array on error
    res.json({ logs: [] });
  }
});

/**
 * GET /api/user/storage
 * Get user storage usage
 */
router.get('/storage', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    // Calculate storage from entries and attachments
    const [entriesResult, attachmentsResult] = await Promise.all([
      supabaseAdmin
        .from('journal_entries')
        .select('id, content, metadata')
        .eq('user_id', userId)
        .catch(() => ({ data: [] })),
      supabaseAdmin
        .storage
        .from('attachments')
        .list(userId, { limit: 1000 })
        .catch(() => ({ data: [] })),
    ]);

    // Calculate sizes (rough estimates)
    const entriesSize = ((entriesResult.data || []) as any[]).reduce((acc, entry) => {
      const contentSize = (entry.content || '').length;
      const metadataSize = JSON.stringify(entry.metadata || {}).length;
      return acc + contentSize + metadataSize;
    }, 0);

    const attachmentsSize = ((attachmentsResult.data || []) as any[]).reduce((acc, file) => {
      return acc + ((file as any).metadata?.size || 0);
    }, 0);

    // Default to 10GB total
    const total = 10 * 1024 * 1024 * 1024; // 10 GB
    const used = entriesSize + attachmentsSize;
    const memories = entriesSize;
    const attachments = attachmentsSize;

    res.json({
      usage: {
        total,
        used,
        memories,
        attachments,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch storage usage');
    // Return default usage on error
    res.json({
      usage: {
        total: 10 * 1024 * 1024 * 1024, // 10 GB
        used: 0,
        memories: 0,
        attachments: 0,
      },
    });
  }
});

/**
 * GET /api/user/export
 * Export user data
 */
router.get('/export', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const format = (req.query.format as string) || 'json';

    // Use the account export endpoint logic
    const exportTables = [
      'journal_entries',
      'timeline_events',
      'tasks',
      'characters',
      'relationships',
      'task_memory_bridges',
      'voice_memos'
    ];

    const payload: Record<string, unknown> = {};
    for (const table of exportTables) {
      const { data, error } = await supabaseAdmin.from(table).select('*').eq('user_id', userId);
      if (error) {
        logger.warn({ error, table }, 'Failed to export table');
        payload[table] = [];
      } else {
        payload[table] = data ?? [];
      }
    }

    const exportData = {
      userId,
      exportedAt: new Date().toISOString(),
      data: payload,
    };

    if (format === 'csv') {
      // Convert to CSV (simplified - just return JSON as CSV for now)
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="lorekeeper-export-${new Date().toISOString().split('T')[0]}.csv"`);
      return res.send(JSON.stringify(exportData, null, 2));
    }

    // Return as JSON blob
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="lorekeeper-export-${new Date().toISOString().split('T')[0]}.json"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    logger.error({ error }, 'Failed to export user data');
    res.status(500).json({ error: 'Failed to export user data' });
  }
});

/**
 * DELETE /api/user/delete
 * Delete user account
 */
router.delete('/delete', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    // Delete all user data
    const exportTables = [
      'journal_entries',
      'timeline_events',
      'tasks',
      'characters',
      'relationships',
      'task_memory_bridges',
      'voice_memos'
    ];

    for (const table of exportTables) {
      const { error } = await supabaseAdmin.from(table).delete().eq('user_id', userId);
      if (error) {
        logger.warn({ error, table }, 'Failed to delete table data');
      }
    }

    // Delete user from auth (this will cascade delete related data)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      logger.warn({ error: deleteError }, 'Failed to delete user from auth');
    }

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    logger.error({ error }, 'Failed to delete user account');
    res.status(500).json({ error: 'Failed to delete user account' });
  }
});

const acceptTermsSchema = z.object({
  acceptedAt: z.string().datetime(),
  version: z.string().default('1.0')
});

// Check if user has accepted terms
router.get('/terms-status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const version = '1.0'; // Current terms version

    const { data, error } = await supabaseAdmin
      .from('terms_acceptance')
      .select('*')
      .eq('user_id', userId)
      .eq('version', version)
      .single();

    if (error) {
      // PGRST116 is "not found" - this is fine, user hasn't accepted yet
      if (error.code === 'PGRST116') {
        return res.json({
          accepted: false,
          acceptedAt: null,
          version: version
        });
      }

      // Check if table doesn't exist
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        logger.warn({ error }, 'terms_acceptance table does not exist. Returning not accepted.');
        return res.json({
          accepted: false,
          acceptedAt: null,
          version: version
        });
      }

      logger.error({ error, errorCode: error.code, errorMessage: error.message }, 'Failed to check terms status');
      return res.status(500).json({ error: 'Failed to check terms status', message: error.message });
    }

    res.json({
      accepted: !!data,
      acceptedAt: data?.accepted_at || null,
      version: data?.version || version
    });
  } catch (error) {
    logger.error({ error }, 'Error checking terms status');
    res.status(500).json({ error: 'Failed to check terms status' });
  }
});

// Accept terms of service
router.post('/accept-terms', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = acceptTermsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const userId = req.user!.id;
    const { acceptedAt, version } = parsed.data;

    // Get IP address and user agent for audit trail
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // In dev mode, ensure the dev user exists in auth.users
    // The foreign key constraint requires the user to exist in auth.users
    if (userId === '00000000-0000-0000-0000-000000000000') {
      try {
        // Try to get the user first
        const { data: existingUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
        
        if (getUserError || !existingUser) {
          // Dev user doesn't exist, create it
          logger.info({ userId }, 'Creating dev user for terms acceptance');
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            id: userId,
            email: 'dev@example.com',
            email_confirm: true,
            user_metadata: { dev_mode: true }
          });
          
          if (createError) {
            logger.warn({ error: createError }, 'Failed to create dev user, may need to run create-dev-user.sql');
            // Continue anyway - the insert will fail with a clearer error
          } else {
            logger.info({ userId }, 'Dev user created successfully');
          }
        }
      } catch (error) {
        logger.warn({ error }, 'Error checking/creating dev user');
      }
    }

    const { data, error } = await supabaseAdmin
      .from('terms_acceptance')
      .insert({
        user_id: userId,
        version,
        accepted_at: acceptedAt,
        ip_address: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
        user_agent: userAgent,
        metadata: {
          source: 'web',
          timestamp: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (error) {
      // Check if table doesn't exist
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        logger.error({ error, userId }, 'terms_acceptance table does not exist. Please run migration: migrations/20250120_terms_acceptance.sql');
        return res.status(500).json({ 
          error: 'Database table not found',
          message: 'The terms_acceptance table does not exist. Please run the database migration: migrations/20250120_terms_acceptance.sql'
        });
      }

      // Check if it's a duplicate (user already accepted)
      if (error.code === '23505') { // Unique violation
        logger.info({ userId, version }, 'User already accepted terms');
        return res.json({
          success: true,
          message: 'Terms already accepted',
          acceptedAt: acceptedAt
        });
      }

      // Check for foreign key constraint violation (dev user doesn't exist)
      if (error.code === '23503') {
        logger.error({ error, userId }, 'Foreign key constraint violation - dev user does not exist in auth.users');
        return res.status(500).json({ 
          error: 'Dev user not found',
          message: 'The dev user does not exist in auth.users. Please run this SQL in Supabase SQL Editor:\n\n' +
                   'See: scripts/create-dev-user.sql\n\n' +
                   'Or go to: https://supabase.com/dashboard/project/jawzxiiwfagliloxnnkc/sql/new',
          code: error.code,
          hint: 'Run the SQL from scripts/create-dev-user.sql to create the dev user'
        });
      }

      logger.error({ error, userId, version, errorCode: error.code, errorMessage: error.message }, 'Failed to accept terms');
      return res.status(500).json({ 
        error: 'Failed to accept terms',
        message: error.message || 'Database error occurred',
        code: error.code
      });
    }

    logger.info({ userId, version, acceptedAt }, 'User accepted terms of service');

    res.json({
      success: true,
      message: 'Terms accepted successfully',
      acceptedAt: data.accepted_at,
      version: data.version
    });
  } catch (error) {
    logger.error({ error }, 'Error accepting terms');
    res.status(500).json({ error: 'Failed to accept terms' });
  }
});

export const userRouter = router;

