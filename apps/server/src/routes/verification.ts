import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validateRequest';
import { truthVerificationService } from '../services/truthVerificationService';
import { memoryService } from '../services/memoryService';
import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();

const verifyClaimSchema = z.object({
  claim_type: z.enum(['date', 'location', 'character', 'event', 'relationship', 'attribute', 'other']),
  subject: z.string().min(1),
  attribute: z.string().min(1),
  value: z.string().min(1)
});

/**
 * Verify a specific entry
 */
router.post('/verify-entry/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Get the entry
    const entry = await memoryService.getEntry(userId, id);
    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Verify the entry
    const result = await truthVerificationService.verifyEntry(userId, id, entry);

    // Store verification result
    await truthVerificationService.storeVerification(userId, id, result);

    res.json({ verification: result });
  } catch (error) {
    logger.error({ error }, 'Failed to verify entry');
    res.status(500).json({ error: 'Failed to verify entry' });
  }
});

/**
 * Verify a specific claim
 */
router.post('/verify-claim', requireAuth, validateBody(verifyClaimSchema), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { claim_type, subject, attribute, value } = req.body;

    // Find entries containing this claim
    const entries = await memoryService.searchEntries(userId, {
      search: `${subject} ${attribute}`,
      limit: 50
    });

    // Extract and verify facts from matching entries
    const results = await Promise.all(
      entries.slice(0, 10).map(async entry => {
        const verification = await truthVerificationService.verifyEntry(userId, entry.id, entry);
        return {
          entry_id: entry.id,
          entry_date: entry.date,
          verification
        };
      })
    );

    res.json({
      claim: { claim_type, subject, attribute, value },
      results
    });
  } catch (error) {
    logger.error({ error }, 'Failed to verify claim');
    res.status(500).json({ error: 'Failed to verify claim' });
  }
});

/**
 * Get verification status for an entry
 */
router.get('/status/:entryId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user!.id;

    const { data, error } = await supabaseAdmin
      .from('entry_verifications')
      .select('*')
      .eq('user_id', userId)
      .eq('entry_id', entryId)
      .single();

    if (error || !data) {
      return res.json({ status: 'unverified', verification: null });
    }

    res.json({ status: data.verification_status, verification: data });
  } catch (error) {
    logger.error({ error }, 'Failed to get verification status');
    res.status(500).json({ error: 'Failed to get verification status' });
  }
});

/**
 * Get all contradictions
 */
router.get('/contradictions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const { data, error } = await supabaseAdmin
      .from('entry_verifications')
      .select('*')
      .eq('user_id', userId)
      .in('verification_status', ['contradicted', 'ambiguous'])
      .eq('resolved', false)
      .order('verified_at', { ascending: false })
      .limit(100);

    // Fetch entry details separately
    if (data && data.length > 0) {
      const entryIds = data.map(v => v.entry_id);
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('id, date, content, summary')
        .in('id', entryIds);

      // Merge entry data with verifications
      const entriesMap = new Map(entries?.map(e => [e.id, e]) || []);
      data.forEach(v => {
        v.entry = entriesMap.get(v.entry_id);
      });
    }

    if (error) {
      throw error;
    }

    res.json({ contradictions: data || [] });
  } catch (error) {
    logger.error({ error }, 'Failed to get contradictions');
    res.status(500).json({ error: 'Failed to get contradictions' });
  }
});

/**
 * Resolve a contradiction
 */
router.post('/resolve/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { resolution_notes } = req.body;

    const { data, error } = await supabaseAdmin
      .from('entry_verifications')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolution_notes: resolution_notes || null
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({ verification: data });
  } catch (error) {
    logger.error({ error }, 'Failed to resolve contradiction');
    res.status(500).json({ error: 'Failed to resolve contradiction' });
  }
});

/**
 * Get verification statistics
 */
router.get('/stats', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const { data, error } = await supabaseAdmin
      .from('entry_verifications')
      .select('verification_status')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    const stats = {
      total: data?.length || 0,
      verified: data?.filter(v => v.verification_status === 'verified').length || 0,
      unverified: data?.filter(v => v.verification_status === 'unverified').length || 0,
      contradicted: data?.filter(v => v.verification_status === 'contradicted').length || 0,
      ambiguous: data?.filter(v => v.verification_status === 'ambiguous').length || 0,
      unresolved: data?.filter(v => v.verification_status === 'contradicted' || v.verification_status === 'ambiguous').length || 0
    };

    res.json({ stats });
  } catch (error) {
    logger.error({ error }, 'Failed to get verification stats');
    res.status(500).json({ error: 'Failed to get verification stats' });
  }
});

export const verificationRouter = router;

