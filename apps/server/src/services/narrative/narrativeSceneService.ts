/**
 * Persist narrative Scenes and attach Moments to them.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { AssembledScene } from './sceneAssembler';

export type NarrativeSceneRow = {
  id: string;
  user_id: string;
  title: string;
  summary: string;
  time_start: string | null;
  time_end: string | null;
  location: string | null;
  participants: string[];
  moment_ids: string[];
  primary_goal: string | null;
  dominant_emotion: string | null;
  outcome: string | null;
  confidence: number;
  significance_score: number;
  promoted_event_id: string | null;
  thread_id: string | null;
  metadata: Record<string, unknown>;
};

export class NarrativeSceneService {
  async upsertScene(input: {
    userId: string;
    scene: AssembledScene;
    significanceScore: number;
    threadId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<NarrativeSceneRow | null> {
    const { scene, userId, significanceScore, threadId } = input;
    if (!scene.title.trim() && !scene.summary.trim()) return null;

    const fingerprint = [
      scene.timeStart?.slice(0, 10) ?? 'undated',
      scene.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80),
      [...scene.momentIds].sort().join(',').slice(0, 80),
    ].join('|');

    try {
      const { data: existing } = await supabaseAdmin
        .from('narrative_scenes')
        .select('*')
        .eq('user_id', userId)
        .eq('metadata->>fingerprint', fingerprint)
        .limit(1)
        .maybeSingle();

      const payload = {
        title: scene.title || 'Untitled scene',
        summary: scene.summary,
        time_start: scene.timeStart,
        time_end: scene.timeEnd,
        location: scene.location,
        participants: scene.participants,
        moment_ids: scene.momentIds,
        primary_goal: scene.primaryGoal,
        dominant_emotion: scene.dominantEmotion,
        confidence: scene.confidence,
        significance_score: significanceScore,
        thread_id: threadId ?? null,
        updated_at: new Date().toISOString(),
        metadata: {
          ...(input.metadata ?? {}),
          fingerprint,
        },
      };

      // Never persist forbidden placeholder titles as published scenes
      if (/^(?:captured conversation|untitled(?: scene| event)?|unknown)/i.test(payload.title)) {
        payload.title = scene.summary.slice(0, 60) || payload.title;
      }

      if (existing?.id) {
        const { data, error } = await supabaseAdmin
          .from('narrative_scenes')
          .update(payload)
          .eq('id', existing.id)
          .eq('user_id', userId)
          .select('*')
          .single();
        if (error) {
          logger.warn({ error, userId }, 'narrative_scenes update failed');
          return existing as NarrativeSceneRow;
        }
        await this.attachMoments(userId, data.id, scene.momentIds);
        return data as NarrativeSceneRow;
      }

      const { data, error } = await supabaseAdmin
        .from('narrative_scenes')
        .insert({
          user_id: userId,
          ...payload,
          outcome: null,
          promoted_event_id: null,
        })
        .select('*')
        .single();

      if (error) {
        logger.warn({ error, userId }, 'narrative_scenes insert failed');
        return null;
      }
      await this.attachMoments(userId, data.id, scene.momentIds);
      return data as NarrativeSceneRow;
    } catch (error) {
      logger.warn({ error, userId }, 'narrative_scenes upsert error');
      return null;
    }
  }

  async attachMoments(userId: string, sceneId: string, momentIds: string[]): Promise<void> {
    if (!momentIds.length) return;
    const { error } = await supabaseAdmin
      .from('narrative_moments')
      .update({ scene_id: sceneId, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .in('id', momentIds);
    if (error) {
      logger.warn({ error, userId, sceneId }, 'attach moments to scene failed');
    }
  }

  async markPromoted(userId: string, sceneId: string, eventId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('narrative_scenes')
      .update({
        promoted_event_id: eventId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sceneId)
      .eq('user_id', userId);
    if (error) {
      logger.warn({ error, userId, sceneId, eventId }, 'narrative_scenes markPromoted failed');
    }
  }

  async linkMomentGraph(
    userId: string,
    links: Array<{ id: string; previousMomentId: string | null; nextMomentId: string | null }>,
  ): Promise<void> {
    for (const link of links) {
      const { error } = await supabaseAdmin
        .from('narrative_moments')
        .update({
          previous_moment_id: link.previousMomentId,
          next_moment_id: link.nextMomentId,
          // Causal flow defaults to chronological neighbors
          caused_by_moment_id: link.previousMomentId,
          leads_to_moment_id: link.nextMomentId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', link.id)
        .eq('user_id', userId);
      if (error) {
        logger.debug({ error, momentId: link.id }, 'moment graph link failed');
      }
    }
  }
}

export const narrativeSceneService = new NarrativeSceneService();
