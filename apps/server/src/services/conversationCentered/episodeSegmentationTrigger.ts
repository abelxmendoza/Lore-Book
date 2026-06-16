/**
 * Episode Segmentation Trigger (Episode Activation Sprint — Phase 3).
 *
 * Debounced per-thread background segmentation. Mirrors graphRecoveryTrigger
 * but scopes to (userId, threadId) and writes episodes + threadMeta.episodes.
 */

import { logger } from '../../logger';
import { persistEpisodesForThread, type PersistEpisodesResult } from './episodePersistenceService';

const DEBOUNCE_MS = Number(process.env.EPISODE_SEGMENTATION_DEBOUNCE_MS ?? 15_000);
const MIN_INTERVAL_MS = Number(process.env.EPISODE_SEGMENTATION_MIN_INTERVAL_MS ?? 5 * 60_000);
const LIVE_ENABLED = process.env.EPISODE_SEGMENTATION_LIVE !== '0';

interface ThreadState {
  timer: NodeJS.Timeout | null;
  lastRunAt: number;
  pending: number;
  inFlight: boolean;
}

class EpisodeSegmentationTrigger {
  private state = new Map<string, ThreadState>();
  private lastRun = new Map<string, PersistEpisodesResult>();

  private key(userId: string, threadId: string): string {
    return `${userId}:${threadId}`;
  }

  private getState(key: string): ThreadState {
    let s = this.state.get(key);
    if (!s) {
      s = { timer: null, lastRunAt: 0, pending: 0, inFlight: false };
      this.state.set(key, s);
    }
    return s;
  }

  /** Called after each ingested chat message. Non-blocking. */
  schedule(userId: string, threadId: string): void {
    if (!LIVE_ENABLED || !userId || !threadId) return;
    const key = this.key(userId, threadId);
    const s = this.getState(key);
    s.pending += 1;
    if (s.timer) return;

    s.timer = setTimeout(() => this.onTimer(userId, threadId), DEBOUNCE_MS);
    if (typeof s.timer.unref === 'function') s.timer.unref();
  }

  private onTimer(userId: string, threadId: string): void {
    const key = this.key(userId, threadId);
    const s = this.getState(key);
    s.timer = null;

    if (s.pending === 0 || s.inFlight) return;

    const sinceLast = Date.now() - s.lastRunAt;
    if (s.lastRunAt > 0 && sinceLast < MIN_INTERVAL_MS) {
      const wait = MIN_INTERVAL_MS - sinceLast;
      s.timer = setTimeout(() => this.onTimer(userId, threadId), wait);
      if (typeof s.timer.unref === 'function') s.timer.unref();
      return;
    }

    void this.runNow(userId, threadId).catch((err) =>
      logger.warn({ err, userId, threadId }, 'episode_segmentation: scheduled run failed (non-blocking)')
    );
  }

  async runNow(userId: string, threadId: string): Promise<PersistEpisodesResult> {
    const key = this.key(userId, threadId);
    const s = this.getState(key);
    if (s.inFlight) {
      return this.lastRun.get(key) ?? emptyResult(userId, threadId);
    }

    s.inFlight = true;
    s.pending = 0;
    const startedAt = Date.now();

    try {
      const result = await persistEpisodesForThread(userId, threadId);
      s.lastRunAt = Date.now();
      this.lastRun.set(key, result);

      if (result.episodeLabels.length > 0) {
        const { threadIntelligenceService } = await import('./threadIntelligenceService');
        await threadIntelligenceService.updateOnMessage(userId, threadId, {
          at: new Date().toISOString(),
          replaceEpisodes: result.episodeLabels,
          episodeId: result.activeEpisodeId,
          episodeLabel: result.activeEpisodeLabel,
        });
      }

      logger.info(
        {
          userId,
          threadId,
          episodeCount: result.episodeCount,
          messagesTotal: result.messagesTotal,
          durationMs: Date.now() - startedAt,
        },
        'episode_segmentation: complete'
      );
      return result;
    } finally {
      s.inFlight = false;
    }
  }

  getLastRun(userId: string, threadId: string): PersistEpisodesResult | null {
    return this.lastRun.get(this.key(userId, threadId)) ?? null;
  }
}

function emptyResult(userId: string, threadId: string): PersistEpisodesResult {
  return {
    threadId,
    episodeCount: 0,
    created: 0,
    messagesTotal: 0,
    activeEpisodeId: null,
    activeEpisodeLabel: null,
    episodeLabels: [],
    episodes: [],
    coverage: {
      messagesWithEntities: 0,
      messagesWithLocations: 0,
      episodesWithEvents: 0,
      episodesWithParticipants: 0,
      avgMessagesPerEpisode: 0,
    },
  };
}

export const episodeSegmentationTrigger = new EpisodeSegmentationTrigger();
