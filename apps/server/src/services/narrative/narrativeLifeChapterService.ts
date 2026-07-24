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
    opts: { limit?: number } = {},
  ): Promise<NarrativeLifeChapterRow[]> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    try {
      const { data, error } = await supabaseAdmin
        .from('narrative_life_chapters')
        .select('*')
        .eq('user_id', userId)
        .order('time_start', { ascending: true })
        .limit(limit);
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

    const fingerprint = [
      chapter.domain,
      chapter.timeStart?.slice(0, 10) ?? 'undated',
    ].join('|');

    try {
      const { data: existing } = await supabaseAdmin
        .from('narrative_life_chapters')
        .select('*')
        .eq('user_id', userId)
        .eq('metadata->>fingerprint', fingerprint)
        .limit(1)
        .maybeSingle();

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
        updated_at: new Date().toISOString(),
        metadata: {
          ...(input.metadata ?? {}),
          fingerprint,
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
