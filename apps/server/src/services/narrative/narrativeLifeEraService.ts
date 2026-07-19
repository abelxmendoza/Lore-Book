/**
 * Persist narrative Life Eras and attach Story Chapters to them.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { AssembledEra } from './eraAssembler';

export type NarrativeLifeEraRow = {
  id: string;
  user_id: string;
  title: string;
  summary: string;
  thesis: string | null;
  time_start: string | null;
  time_end: string | null;
  location: string | null;
  participants: string[];
  chapter_ids: string[];
  scene_ids: string[];
  event_ids: string[];
  themes: string[];
  dominant_emotion: string | null;
  is_current: boolean;
  significance_score: number;
  confidence: number;
  thread_id: string | null;
  metadata: Record<string, unknown>;
};

export class NarrativeLifeEraService {
  async listEras(
    userId: string,
    opts: { limit?: number } = {},
  ): Promise<NarrativeLifeEraRow[]> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    try {
      const { data, error } = await supabaseAdmin
        .from('narrative_life_eras')
        .select('*')
        .eq('user_id', userId)
        .order('time_start', { ascending: true })
        .limit(limit);
      if (error) {
        logger.warn({ error, userId }, 'narrative_life_eras list failed');
        return [];
      }
      return (data ?? []) as NarrativeLifeEraRow[];
    } catch (error) {
      logger.warn({ error, userId }, 'narrative_life_eras list error');
      return [];
    }
  }

  async upsertEra(input: {
    userId: string;
    era: AssembledEra;
    significanceScore: number;
    threadId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<NarrativeLifeEraRow | null> {
    const { era, userId, significanceScore, threadId } = input;
    if (!era.title.trim() && !era.summary.trim()) return null;

    const fingerprint = [
      era.timeStart?.slice(0, 7) ?? 'undated',
      era.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80),
      [...era.chapterIds].sort().join(',').slice(0, 120),
    ].join('|');

    try {
      const { data: existing } = await supabaseAdmin
        .from('narrative_life_eras')
        .select('*')
        .eq('user_id', userId)
        .eq('metadata->>fingerprint', fingerprint)
        .limit(1)
        .maybeSingle();

      const payload = {
        title: era.title || 'Untitled era',
        summary: era.summary,
        thesis: era.thesis || null,
        time_start: era.timeStart,
        time_end: era.timeEnd,
        location: era.location,
        participants: era.participants,
        chapter_ids: era.chapterIds,
        scene_ids: era.sceneIds,
        event_ids: era.eventIds,
        themes: era.themes,
        dominant_emotion: era.dominantEmotion,
        is_current: era.isCurrent,
        significance_score: significanceScore,
        confidence: era.confidence,
        thread_id: threadId ?? null,
        updated_at: new Date().toISOString(),
        metadata: {
          ...(input.metadata ?? {}),
          fingerprint,
        },
      };

      if (/^(?:captured conversation|untitled(?: era| chapter)?|unknown)/i.test(payload.title)) {
        payload.title = era.summary.slice(0, 60) || payload.title;
      }

      if (era.isCurrent) {
        await supabaseAdmin
          .from('narrative_life_eras')
          .update({ is_current: false, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('is_current', true);
      }

      if (existing?.id) {
        const mergedChapterIds = Array.from(
          new Set([...(existing.chapter_ids ?? []), ...era.chapterIds]),
        );
        const mergedSceneIds = Array.from(
          new Set([...(existing.scene_ids ?? []), ...era.sceneIds]),
        );
        const mergedEventIds = Array.from(
          new Set([...(existing.event_ids ?? []), ...era.eventIds]),
        );
        const { data, error } = await supabaseAdmin
          .from('narrative_life_eras')
          .update({
            ...payload,
            chapter_ids: mergedChapterIds,
            scene_ids: mergedSceneIds,
            event_ids: mergedEventIds,
          })
          .eq('id', existing.id)
          .eq('user_id', userId)
          .select('*')
          .single();
        if (error) {
          logger.warn({ error, userId }, 'narrative_life_eras update failed');
          return existing as NarrativeLifeEraRow;
        }
        await this.attachChapters(userId, data.id, mergedChapterIds);
        return data as NarrativeLifeEraRow;
      }

      const { data, error } = await supabaseAdmin
        .from('narrative_life_eras')
        .insert({
          user_id: userId,
          ...payload,
        })
        .select('*')
        .single();

      if (error) {
        logger.warn({ error, userId }, 'narrative_life_eras insert failed');
        return null;
      }
      await this.attachChapters(userId, data.id, era.chapterIds);
      return data as NarrativeLifeEraRow;
    } catch (error) {
      logger.warn({ error, userId }, 'narrative_life_eras upsert error');
      return null;
    }
  }

  async attachChapters(userId: string, eraId: string, chapterIds: string[]): Promise<void> {
    if (!chapterIds.length) return;
    const { error } = await supabaseAdmin
      .from('narrative_story_chapters')
      .update({ era_id: eraId, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .in('id', chapterIds);
    if (error) {
      logger.warn({ error, userId, eraId }, 'attach chapters to era failed');
    }
  }
}

export const narrativeLifeEraService = new NarrativeLifeEraService();
