/**
 * Persist narrative Life Chapters (domain groupings) and attach Storylines to them.
 *
 * Distinct from narrative_story_chapters ("Storylines") and from the arc-thesis
 * `narrative_chapters` (keyed by life_arc_id).
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { AssembledLifeChapter } from './lifeChapterAssembler';

export type NarrativeLifeChapterRow = {
  id: string;
  user_id: string;
  domain: string;
  title: string;
  summary: string;
  time_start: string | null;
  time_end: string | null;
  location: string | null;
  participants: string[];
  storyline_ids: string[];
  scene_ids: string[];
  event_ids: string[];
  themes: string[];
  dominant_emotion: string | null;
  significance_score: number;
  confidence: number;
  era_id: string | null;
  thread_id: string | null;
  metadata: Record<string, unknown>;
};

export class NarrativeLifeChapterService {
  async listChapters(
    userId: string,
    opts: { limit?: number; projectionGeneration?: string | null } = {},
  ): Promise<NarrativeLifeChapterRow[]> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 2000);
    try {
      let query = supabaseAdmin
        .from('narrative_life_chapters')
        .select('*')
        .eq('user_id', userId)
        .order('time_start', { ascending: true });
      if (opts.projectionGeneration) {
        query = query.eq('metadata->>projection_generation', opts.projectionGeneration);
      }
      const { data, error } = await query.limit(limit);
      if (error) {
        logger.warn({ error, userId }, 'narrative_life_chapters list failed');
        return [];
      }
      return (data ?? []) as NarrativeLifeChapterRow[];
    } catch (error) {
      logger.warn({ error, userId }, 'narrative_life_chapters list error');
      return [];
    }
  }

  async upsertChapter(input: {
    userId: string;
    chapter: AssembledLifeChapter;
    significanceScore: number;
    threadId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<NarrativeLifeChapterRow | null> {
    const { chapter, userId, significanceScore, threadId } = input;
    if (!chapter.title.trim() && !chapter.summary.trim()) return null;

    const normalize = (value: string | null | undefined) =>
      (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const projectionKey = [
      normalize(chapter.domain),
      normalize(chapter.title),
    ].filter(Boolean).join('|');
    const projectionGeneration =
      typeof input.metadata?.projection_generation === 'string'
        ? input.metadata.projection_generation
        : null;
    const fingerprint = [
      chapter.domain,
      chapter.timeStart?.slice(0, 10) ?? 'undated',
    ].join('|');

    try {
      let projectionKeyQuery = supabaseAdmin
        .from('narrative_life_chapters')
        .select('*')
        .eq('user_id', userId)
        .eq('metadata->>projection_key', projectionKey)
        .order('updated_at', { ascending: false });
      if (projectionGeneration) {
        projectionKeyQuery = projectionKeyQuery.eq('metadata->>projection_generation', projectionGeneration);
      }
      const { data: existingByProjectionKey } = await projectionKeyQuery.limit(1).maybeSingle();
      let fingerprintQuery = supabaseAdmin
        .from('narrative_life_chapters')
        .select('*')
        .eq('user_id', userId)
        .eq('metadata->>fingerprint', fingerprint);
      if (projectionGeneration) {
        fingerprintQuery = fingerprintQuery.eq('metadata->>projection_generation', projectionGeneration);
      }
      const { data: existingByFingerprint } = await fingerprintQuery.limit(1).maybeSingle();
      const existing = existingByProjectionKey ?? existingByFingerprint;

      const payload = {
        domain: chapter.domain,
        title: chapter.title || 'Untitled chapter',
        summary: chapter.summary,
        time_start: chapter.timeStart,
        time_end: chapter.timeEnd,
        location: chapter.location,
        participants: chapter.participants,
        storyline_ids: chapter.storylineIds,
        scene_ids: chapter.sceneIds,
        event_ids: chapter.eventIds,
        themes: chapter.themes,
        dominant_emotion: chapter.dominantEmotion,
        significance_score: significanceScore,
        confidence: chapter.confidence,
        thread_id: threadId ?? null,
        projection_key: projectionKey,
        updated_at: new Date().toISOString(),
        metadata: {
          ...(input.metadata ?? {}),
          fingerprint,
          projection_key: projectionKey,
        },
      };

      if (existing?.id) {
        const attachIds = chapter.storylineIds;
        const priorStorylineIds = (existing.storyline_ids as string[]) ?? [];
        const dropIds = priorStorylineIds.filter((id) => !attachIds.includes(id));
        if (dropIds.length) {
          await supabaseAdmin
            .from('narrative_story_chapters')
            .update({ life_chapter_id: null, updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .in('id', dropIds);
        }
        const { data, error } = await supabaseAdmin
          .from('narrative_life_chapters')
          .update(payload)
          .eq('id', existing.id)
          .eq('user_id', userId)
          .select('*')
          .single();
        if (error) {
          logger.warn({ error, userId }, 'narrative_life_chapters update failed');
          return existing as NarrativeLifeChapterRow;
        }
        await this.attachStorylines(userId, data.id, attachIds);
        return data as NarrativeLifeChapterRow;
      }

      const { data, error } = await supabaseAdmin
        .from('narrative_life_chapters')
        .insert({
          user_id: userId,
          ...payload,
        })
        .select('*')
        .single();

      if (error) {
        logger.warn({ error, userId }, 'narrative_life_chapters insert failed');
        return null;
      }
      await this.attachStorylines(userId, data.id, chapter.storylineIds);
      return data as NarrativeLifeChapterRow;
    } catch (error) {
      logger.warn({ error, userId }, 'narrative_life_chapters upsert error');
      return null;
    }
  }

  async attachStorylines(userId: string, chapterId: string, storylineIds: string[]): Promise<void> {
    if (!storylineIds.length) return;
    const { error } = await supabaseAdmin
      .from('narrative_story_chapters')
      .update({ life_chapter_id: chapterId, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .in('id', storylineIds);
    if (error) {
      logger.warn({ error, userId, chapterId }, 'attach storylines to life chapter failed');
    }
  }

  /**
   * Clear life chapters for a user and detach storylines so reprocessing can rebuild.
   */
  async clearChaptersForUser(userId: string): Promise<number> {
    try {
      await supabaseAdmin
        .from('narrative_story_chapters')
        .update({ life_chapter_id: null, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .not('life_chapter_id', 'is', null);

      const { data, error } = await supabaseAdmin
        .from('narrative_life_chapters')
        .delete()
        .eq('user_id', userId)
        .select('id');
      if (error) {
        logger.warn({ error, userId }, 'narrative_life_chapters clear failed');
        return 0;
      }
      return data?.length ?? 0;
    } catch (error) {
      logger.warn({ error, userId }, 'narrative_life_chapters clear error');
      return 0;
    }
  }
}

export const narrativeLifeChapterService = new NarrativeLifeChapterService();
