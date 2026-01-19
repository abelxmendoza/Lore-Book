import { spawn } from 'node:child_process';

import cron from 'node-cron';

import { logger } from '../logger';
import { insightStorageService } from '../services/insightStorageService';
import { supabaseAdmin } from '../services/supabaseClient';

/**
 * Daily Insight Generation Job
 * Regenerates insights: emotional trends, behavioral loops, arc predictions
 */
class InsightGenerationJob {
  /**
   * Run Python insight engine with payload
   */
  private async runInsightEngine(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const proc = spawn('python', ['-m', 'lorekeeper.insight_engine']);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code !== 0) {
          logger.error({ stderr }, 'Insight engine failed');
          reject(new Error(stderr || `Insight engine exited with code ${code}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (error) {
          reject(error);
        }
      });

      proc.stdin.write(JSON.stringify(payload));
      proc.stdin.end();
    });
  }

  /**
   * Build payload for insight engine
   */
  private async buildPayload(userId: string, range?: { from?: string; to?: string }) {
    const { memoryService } = await import('../services/memoryService');
    const { chapterService } = await import('../services/chapterService');

    const [timeline, arcs] = await Promise.all([
      memoryService.searchEntries(userId, { limit: 200, from: range?.from, to: range?.to }),
      chapterService.listChapters(userId),
    ]);

    return {
      timeline,
      arcs,
      identity: [],
      tasks: [],
      characters: [],
      locations: [],
    };
  }

  /**
   * Generate insights for a user
   */
  async generateInsightsForUser(userId: string): Promise<void> {
    try {
      logger.info({ userId }, 'Generating daily insights');

      // Get recent entries and components
      const payload = await this.buildPayload(userId);

      // Run Python insight engine
      const insights = await this.runInsightEngine(payload);

      // Store insights in database
      // Note: This depends on the format returned by Python engine
      // For now, we'll log and let the Python engine handle storage if needed
      logger.info({ userId, insightCount: Object.keys(insights).length }, 'Insights generated');

      // Clean up old insights (older than 90 days)
      const deletedCount = await insightStorageService.deleteOldInsights(userId, 90);
      logger.info({ userId, deletedCount }, 'Cleaned up old insights');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to generate insights for user');
    }
  }

  /**
   * Generate insights for all active users
   */
  async generateInsightsForAllUsers(): Promise<void> {
    try {
      logger.info('Starting daily insight generation for all users');

      // Get all active users (users with recent entries)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('user_id')
        .gte('date', thirtyDaysAgo.toISOString())
        .limit(1000);

      if (!entries) {
        logger.info('No active users found');
        return;
      }

      const userIds = [...new Set(entries.map(e => e.user_id))];

      logger.info({ userCount: userIds.length }, 'Found active users');

      // Process users in batches
      const batchSize = 5;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);

        await Promise.all(
          batch.map(userId => this.generateInsightsForUser(userId))
        );

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.info('Daily insight generation completed');
    } catch (error) {
      logger.error({ error }, 'Failed to generate insights for all users');
    }
  }

  /**
   * Register daily cron job
   */
  register(): void {
    // Run daily at 2:30 AM
    cron.schedule('30 2 * * *', async () => {
      logger.info('Running daily insight generation job');
      await this.generateInsightsForAllUsers();
    });

    logger.info('Daily insight generation job registered (runs at 2:30 AM)');
  }
}

export const insightGenerationJob = new InsightGenerationJob();

