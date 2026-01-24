/**
 * Void Memory API Routes
 * Detects gaps in journal entries and provides engaging prompts to fill them
 */

import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { voidAwarenessService } from '../services/biographyGeneration/voidAwarenessService';
import { supabaseAdmin } from '../services/supabaseClient';
import { logger } from '../logger';
import { engagementPromptGenerator } from '../services/engagement/promptGenerator';

const router = Router();

/**
 * Calculate engagement score for a void period
 * Higher score = more important to fill
 */
function calculateEngagementScore(voidPeriod: {
  durationDays: number;
  significance: 'low' | 'medium' | 'high';
  type: 'short_gap' | 'medium_gap' | 'long_silence' | 'void';
}): number {
  let score = voidPeriod.durationDays * 0.1;
  if (voidPeriod.significance === 'high') score += 50;
  if (voidPeriod.significance === 'medium') score += 25;
  if (voidPeriod.type === 'long_silence') score += 30;
  if (voidPeriod.type === 'void') score += 40;
  return Math.min(100, Math.round(score));
}

/**
 * Get all void periods with enhanced context and prompts
 * GET /api/voids/gaps
 */
router.get('/gaps', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    // Get all journal entries
    const { data: entries, error } = await supabaseAdmin
      .from('journal_entries')
      .select('id, date, content')
      .eq('user_id', userId)
      .order('date', { ascending: true });

    if (error) {
      logger.error({ error, userId }, 'Failed to fetch journal entries for void detection');
      throw error;
    }

    if (!entries || entries.length === 0) {
      return res.json({ voids: [], totalGaps: 0, stats: null });
    }

    // Convert to narrative atoms
    const atoms = entries.map(e => ({
      id: e.id,
      timestamp: e.date,
      content: e.content,
      type: 'event' as const,
      domains: [] as string[],
      emotionalWeight: 0,
      sensitivity: 0,
      significance: 0,
      tags: [],
      timelineIds: [],
      sourceRefs: [e.id],
      metadata: {}
    }));

    // Determine timeline span (from first entry to now, or last entry)
    const firstEntry = entries[0];
    const lastEntry = entries[entries.length - 1];
    const now = new Date().toISOString();
    
    const timelineSpan = {
      start: firstEntry.date,
      end: lastEntry.date < now ? now : lastEntry.date
    };

    // Detect voids
    const voids = voidAwarenessService.detectVoids(atoms, timelineSpan);

    // Enhance voids with engagement scores and prompts
    const enhancedVoids = await Promise.all(
      voids.map(async (voidPeriod) => {
        const engagementScore = calculateEngagementScore(voidPeriod);
        
        // Generate engaging prompts
        const prompts = await engagementPromptGenerator.generateEngagingVoidPrompts(
          userId,
          voidPeriod
        );

        return {
          ...voidPeriod,
          prompts,
          engagementScore,
        };
      })
    );

    // Sort by engagement score (highest first)
    enhancedVoids.sort((a, b) => b.engagementScore - a.engagementScore);

    res.json({
      voids: enhancedVoids,
      totalGaps: enhancedVoids.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get void periods');
    res.status(500).json({ error: 'Failed to get void periods' });
  }
});

/**
 * Get aggregate statistics about voids
 * GET /api/voids/stats
 */
router.get('/stats', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    // Get all journal entries
    const { data: entries, error } = await supabaseAdmin
      .from('journal_entries')
      .select('id, date, content')
      .eq('user_id', userId)
      .order('date', { ascending: true });

    if (error) {
      logger.error({ error, userId }, 'Failed to fetch journal entries for void stats');
      throw error;
    }

    if (!entries || entries.length === 0) {
      return res.json({
        totalGaps: 0,
        totalMissingDays: 0,
        averageGapDuration: 0,
        mostSignificantGap: null,
        coveragePercentage: 0,
        timelineSpan: null,
      });
    }

    // Convert to narrative atoms
    const atoms = entries.map(e => ({
      id: e.id,
      timestamp: e.date,
      content: e.content,
      type: 'event' as const,
      domains: [] as string[],
      emotionalWeight: 0,
      sensitivity: 0,
      significance: 0,
      tags: [],
      timelineIds: [],
      sourceRefs: [e.id],
      metadata: {}
    }));

    // Determine timeline span
    const firstEntry = entries[0];
    const lastEntry = entries[entries.length - 1];
    const now = new Date().toISOString();
    
    const timelineSpan = {
      start: firstEntry.date,
      end: lastEntry.date < now ? now : lastEntry.date
    };

    // Detect voids
    const voids = voidAwarenessService.detectVoids(atoms, timelineSpan);

    // Calculate statistics
    const totalMissingDays = voids.reduce((sum, v) => sum + v.durationDays, 0);
    const averageGapDuration = voids.length > 0 ? totalMissingDays / voids.length : 0;
    
    const timelineStart = new Date(timelineSpan.start);
    const timelineEnd = new Date(timelineSpan.end);
    const totalTimelineDays = Math.ceil(
      (timelineEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const coveragePercentage = totalTimelineDays > 0
      ? Math.round(((totalTimelineDays - totalMissingDays) / totalTimelineDays) * 100)
      : 0;

    // Find most significant gap
    const mostSignificantGap = voids.length > 0
      ? voids.reduce((max, v) => {
          const maxScore = calculateEngagementScore(max);
          const vScore = calculateEngagementScore(v);
          return vScore > maxScore ? v : max;
        })
      : null;

    res.json({
      totalGaps: voids.length,
      totalMissingDays,
      averageGapDuration: Math.round(averageGapDuration),
      mostSignificantGap: mostSignificantGap ? {
        ...mostSignificantGap,
        engagementScore: calculateEngagementScore(mostSignificantGap),
      } : null,
      coveragePercentage,
      timelineSpan: {
        start: timelineSpan.start,
        end: timelineSpan.end,
        totalDays: totalTimelineDays,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get void statistics');
    res.status(500).json({ error: 'Failed to get void statistics' });
  }
});

export { router as voidRouter };
