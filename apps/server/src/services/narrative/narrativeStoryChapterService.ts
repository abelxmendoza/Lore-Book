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
  primary_narrative?: string | null;
  primary_subject?: string | null;
  primary_conflict?: string | null;
  primary_outcome?: string | null;
  contribution_scores?: Record<string, number>;
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
  era_id?: string | null;
  life_chapter_id?: string | null;
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

      const contributionScores = Object.fromEntries(
        (chapter.contributions ?? []).map((c) => [c.sceneId, c.strength]),
      );

      const payload = {
        title: chapter.title || 'Untitled chapter',
        summary: chapter.summary,
        thesis: chapter.ownership?.primaryNarrative || chapter.thesis || null,
        primary_narrative: chapter.ownership?.primaryNarrative || null,
        primary_subject: chapter.ownership?.primarySubject || null,
        primary_conflict: chapter.ownership?.primaryConflict || null,
        primary_outcome: chapter.ownership?.primaryOutcome || null,
        contribution_scores: contributionScores,
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
          ownership: chapter.ownership,
          contributions: chapter.contributions,
        },
      };

      if (/^(?:captured conversation|untitled(?: chapter| scene| event)?|unknown)/i.test(payload.title)) {
        payload.title = chapter.summary.slice(0, 60) || payload.title;
      }

      if (existing?.id) {
        // Ownership replaces membership — do not merge historical unrelated scenes back in.
        const attachIds = chapter.memberSceneIds?.length ? chapter.memberSceneIds : chapter.sceneIds;
        const priorSceneIds = (existing.scene_ids as string[]) ?? [];
        const dropSceneIds = priorSceneIds.filter((id) => !attachIds.includes(id));
        if (dropSceneIds.length) {
          await supabaseAdmin
            .from('narrative_scenes')
            .update({ chapter_id: null, updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .in('id', dropSceneIds);
        }
        const { data, error } = await supabaseAdmin
          .from('narrative_story_chapters')
          .update(payload)
          .eq('id', existing.id)
          .eq('user_id', userId)
          .select('*')
          .single();
        if (error) {
          logger.warn({ error, userId }, 'narrative_story_chapters update failed');
          return existing as NarrativeStoryChapterRow;
        }
        await this.attachScenes(userId, data.id, attachIds);
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
      const attachIds = chapter.memberSceneIds?.length ? chapter.memberSceneIds : chapter.sceneIds;
      await this.attachScenes(userId, data.id, attachIds);
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

  /**
   * Clear story chapters for a user and detach scenes so ownership reprocess can rebuild.
   */
  async clearChaptersForUser(userId: string): Promise<number> {
    try {
      await supabaseAdmin
        .from('narrative_scenes')
        .update({ chapter_id: null, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .not('chapter_id', 'is', null);

      const { data, error } = await supabaseAdmin
        .from('narrative_story_chapters')
        .delete()
        .eq('user_id', userId)
        .select('id');
      if (error) {
        logger.warn({ error, userId }, 'narrative_story_chapters clear failed');
        return 0;
      }
      return data?.length ?? 0;
    } catch (error) {
      logger.warn({ error, userId }, 'narrative_story_chapters clear error');
      return 0;
    }
  }
}

export const narrativeStoryChapterService = new NarrativeStoryChapterService();
