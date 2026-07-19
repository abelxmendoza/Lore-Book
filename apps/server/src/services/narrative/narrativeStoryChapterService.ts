/**
 * Persist narrative Story Chapters and attach Scenes to them.
 *
 * Distinct from arc-thesis `narrative_chapters` (keyed by life_arc_id).
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { AssembledChapter } from './chapterAssembler';

export type NarrativeStoryChapterRow = {
  id: string;
  user_id: string;
  title: string;
  summary: string;
  thesis: string | null;
  time_start: string | null;
  time_end: string | null;
  location: string | null;
  participants: string[];
  scene_ids: string[];
  event_ids: string[];
  themes: string[];
  dominant_emotion: string | null;
  significance_score: number;
  confidence: number;
  thread_id: string | null;
  metadata: Record<string, unknown>;
};

export class NarrativeStoryChapterService {
  async listChapters(
    userId: string,
    opts: { limit?: number } = {},
  ): Promise<NarrativeStoryChapterRow[]> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    try {
      const { data, error } = await supabaseAdmin
        .from('narrative_story_chapters')
        .select('*')
        .eq('user_id', userId)
        .order('time_start', { ascending: true })
        .limit(limit);
      if (error) {
        logger.warn({ error, userId }, 'narrative_story_chapters list failed');
        return [];
      }
      return (data ?? []) as NarrativeStoryChapterRow[];
    } catch (error) {
      logger.warn({ error, userId }, 'narrative_story_chapters list error');
      return [];
    }
  }

  async upsertChapter(input: {
    userId: string;
    chapter: AssembledChapter;
    significanceScore: number;
    threadId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<NarrativeStoryChapterRow | null> {
    const { chapter, userId, significanceScore, threadId } = input;
    if (!chapter.title.trim() && !chapter.summary.trim()) return null;

    const fingerprint = [
      chapter.timeStart?.slice(0, 10) ?? 'undated',
      chapter.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80),
      [...chapter.sceneIds].sort().join(',').slice(0, 120),
    ].join('|');

    try {
      const { data: existing } = await supabaseAdmin
        .from('narrative_story_chapters')
        .select('*')
        .eq('user_id', userId)
        .eq('metadata->>fingerprint', fingerprint)
        .limit(1)
        .maybeSingle();

      const payload = {
        title: chapter.title || 'Untitled chapter',
        summary: chapter.summary,
        thesis: chapter.thesis || null,
        time_start: chapter.timeStart,
        time_end: chapter.timeEnd,
        location: chapter.location,
        participants: chapter.participants,
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

      if (/^(?:captured conversation|untitled(?: chapter| scene| event)?|unknown)/i.test(payload.title)) {
        payload.title = chapter.summary.slice(0, 60) || payload.title;
      }

      if (existing?.id) {
        const mergedSceneIds = Array.from(
          new Set([...(existing.scene_ids ?? []), ...chapter.sceneIds]),
        );
        const mergedEventIds = Array.from(
          new Set([...(existing.event_ids ?? []), ...chapter.eventIds]),
        );
        const { data, error } = await supabaseAdmin
          .from('narrative_story_chapters')
          .update({
            ...payload,
            scene_ids: mergedSceneIds,
            event_ids: mergedEventIds,
          })
          .eq('id', existing.id)
          .eq('user_id', userId)
          .select('*')
          .single();
        if (error) {
          logger.warn({ error, userId }, 'narrative_story_chapters update failed');
          return existing as NarrativeStoryChapterRow;
        }
        await this.attachScenes(userId, data.id, mergedSceneIds);
        return data as NarrativeStoryChapterRow;
      }

      const { data, error } = await supabaseAdmin
        .from('narrative_story_chapters')
        .insert({
          user_id: userId,
          ...payload,
        })
        .select('*')
        .single();

      if (error) {
        logger.warn({ error, userId }, 'narrative_story_chapters insert failed');
        return null;
      }
      await this.attachScenes(userId, data.id, chapter.sceneIds);
      return data as NarrativeStoryChapterRow;
    } catch (error) {
      logger.warn({ error, userId }, 'narrative_story_chapters upsert error');
      return null;
    }
  }

  async attachScenes(userId: string, chapterId: string, sceneIds: string[]): Promise<void> {
    if (!sceneIds.length) return;
    const { error } = await supabaseAdmin
      .from('narrative_scenes')
      .update({ chapter_id: chapterId, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .in('id', sceneIds);
    if (error) {
      logger.warn({ error, userId, chapterId }, 'attach scenes to chapter failed');
    }
  }
}

export const narrativeStoryChapterService = new NarrativeStoryChapterService();
