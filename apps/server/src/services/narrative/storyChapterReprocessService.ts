/**
 * Rebuild Story Chapters with Narrative Ownership from existing Scenes.
 * Used by CLI and POST /api/story/story-chapters/reprocess.
 */

import { randomUUID } from 'crypto';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { assembleChaptersFromScenes, type ChapterSceneInput } from './chapterAssembler';
import { mayPersistChapter } from './chapterSignificance';
import { mayPublishOwnedChapter } from './narrativeValidation';
import { narrativeStoryChapterService } from './narrativeStoryChapterService';
import {
  assembleLifeChaptersFromStorylines,
  storylineRowToLifeChapterInput,
} from './lifeChapterAssembler';
import { narrativeLifeChapterService } from './narrativeLifeChapterService';
import { assembleErasFromChapters, lifeChapterRowToEraInput } from './eraAssembler';
import { mayPersistEra } from './eraSignificance';
import { narrativeLifeEraService } from './narrativeLifeEraService';

export type StoryChapterReprocessResult = {
  scenes: number;
  assembled: number;
  published: number;
  rejected: number;
  lifeChaptersPublished: number;
  erasPublished: number;
  clearedChapters: number;
  clearedLifeChapters: number;
  chapters: Awaited<ReturnType<typeof narrativeStoryChapterService.listChapters>>;
};

async function loadScenes(userId: string): Promise<ChapterSceneInput[]> {
  const pageSize = 500;
  const rows: Array<Record<string, unknown>> = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabaseAdmin
      .from('narrative_scenes')
      .select(
        'id, title, summary, time_start, time_end, location, participants, primary_goal, dominant_emotion, significance_score, promoted_event_id',
      )
      .eq('user_id', userId)
      .order('time_start', { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  // Batch-join narrative_milestones so a rebuild sees the same milestone
  // linkage live ingestion already computed — otherwise reprocessed chapters
  // would silently lose milestone_ids/top_milestone_score.
  const promotedEventIds = Array.from(
    new Set(rows.map((row) => row.promoted_event_id as string | null).filter((id): id is string => Boolean(id))),
  );
  const milestonesByEventId = new Map<string, { eligible: boolean; final_score: number }>();
  if (promotedEventIds.length > 0) {
    const { data: milestoneRows } = await supabaseAdmin
      .from('narrative_milestones')
      .select('event_id, eligible, final_score')
      .eq('user_id', userId)
      .in('event_id', promotedEventIds);
    for (const row of milestoneRows ?? []) {
      milestonesByEventId.set(row.event_id as string, {
        eligible: Boolean(row.eligible),
        final_score: Number(row.final_score ?? 0),
      });
    }
  }

  return rows.map((row) => {
    const promotedEventId = (row.promoted_event_id as string) ?? null;
    const milestone = promotedEventId ? milestonesByEventId.get(promotedEventId) : undefined;
    return {
      id: row.id as string,
      title: (row.title as string) ?? '',
      summary: (row.summary as string) ?? '',
      timeStart: (row.time_start as string) ?? null,
      timeEnd: (row.time_end as string) ?? null,
      location: (row.location as string) ?? null,
      participants: (row.participants as string[]) ?? [],
      primaryGoal: (row.primary_goal as string) ?? null,
      dominantEmotion: (row.dominant_emotion as string) ?? null,
      significanceScore: Number(row.significance_score ?? 0),
      promotedEventId,
      isMilestone: Boolean(milestone?.eligible),
      milestoneScore: milestone ? Math.round(milestone.final_score) : 0,
    };
  });
}

async function beginProjectionGeneration(userId: string, generation: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('narrative_projection_generations')
    .insert({ id: generation, user_id: userId, status: 'building' });
  if (error) {
    logger.warn({ error, userId, generation }, 'Saga generation table unavailable; using legacy rebuild');
    return false;
  }
  return true;
}

async function publishProjectionGeneration(userId: string, generation: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('narrative_projection_generations')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', generation)
    .eq('user_id', userId);
  if (error) throw error;
}

async function removeSupersededProjectionRows(
  table: 'narrative_story_chapters' | 'narrative_life_chapters' | 'narrative_life_eras',
  userId: string,
  generation: string,
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('id, metadata')
    .eq('user_id', userId);
  if (error) throw error;
  const staleIds = (data ?? [])
    .filter((row) => (row.metadata as Record<string, unknown> | null)?.projection_generation !== generation)
    .map((row) => row.id as string)
    .filter(Boolean);
  if (staleIds.length === 0) return 0;
  const { error: deleteError } = await supabaseAdmin.from(table).delete().in('id', staleIds);
  if (deleteError) throw deleteError;
  return staleIds.length;
}

async function rebuildStoryChaptersForUser(
  userId: string,
): Promise<StoryChapterReprocessResult> {
  const scenes = await loadScenes(userId);
  const assembled = assembleChaptersFromScenes(scenes);
  const projectionGeneration = randomUUID();
  if (scenes.length === 0 || assembled.length === 0) {
    logger.info({ userId, scenes: scenes.length }, 'story chapter reprocess: no source scenes; preserving existing projection');
    return {
      scenes: scenes.length,
      assembled: assembled.length,
      published: 0,
      rejected: assembled.length,
      lifeChaptersPublished: 0,
      erasPublished: 0,
      clearedChapters: 0,
      clearedLifeChapters: 0,
      chapters: await narrativeStoryChapterService.listChapters(userId, { limit: 5000 }),
    };
  }

  const staged = await beginProjectionGeneration(userId, projectionGeneration);
  let clearedLifeChapters = 0;
  let clearedChapters = 0;
  if (!staged) {
    const { error: eraClearError } = await supabaseAdmin
      .from('narrative_life_eras')
      .delete()
      .eq('user_id', userId);
    if (eraClearError) {
      logger.warn({ error: eraClearError, userId }, 'story chapter reprocess: era clear failed');
    }
    clearedLifeChapters = await narrativeLifeChapterService.clearChaptersForUser(userId);
    clearedChapters = await narrativeStoryChapterService.clearChaptersForUser(userId);
  }

  let published = 0;
  let rejected = 0;
  for (const chapter of assembled) {
    const ownershipGate = mayPublishOwnedChapter(chapter);
    const score = mayPersistChapter(chapter);
    if (!ownershipGate.allow || !score.allow) {
      rejected += 1;
      logger.info(
        {
          userId,
          title: chapter.title,
          ownershipReasons: ownershipGate.reasons,
          scoreAllow: score.allow,
        },
        'story chapter reprocess: skipped chapter',
      );
      continue;
    }
    const row = await narrativeStoryChapterService.upsertChapter({
      userId,
      chapter,
      significanceScore: score.score,
      metadata: {
        significance: score.breakdown,
        narrative: chapter.narrative,
        ownership: chapter.ownership,
        contributions: chapter.contributions,
        reprocessed: true,
        projection_generation: projectionGeneration,
      },
    });
    if (row?.id) published += 1;
  }

  const chapters = await narrativeStoryChapterService.listChapters(userId, {
    limit: 5000,
    projectionGeneration: staged ? projectionGeneration : null,
  });

  const lifeChapters = assembleLifeChaptersFromStorylines(
    chapters.map(storylineRowToLifeChapterInput),
  );
  let lifeChaptersPublished = 0;
  for (const lifeChapter of lifeChapters) {
    const row = await narrativeLifeChapterService.upsertChapter({
      userId,
      chapter: lifeChapter,
      significanceScore: Math.round(lifeChapter.confidence * 100),
      metadata: { reprocessed: true, projection_generation: projectionGeneration },
    });
    if (row?.id) lifeChaptersPublished += 1;
  }

  const recentLifeChapters = await narrativeLifeChapterService.listChapters(userId, {
    limit: 2000,
    projectionGeneration: staged ? projectionGeneration : null,
  });
  const eras = assembleErasFromChapters(recentLifeChapters.map(lifeChapterRowToEraInput));
  let erasPublished = 0;
  for (const era of eras) {
    const eraScore = mayPersistEra(era);
    if (!eraScore.allow) continue;
    const row = await narrativeLifeEraService.upsertEra({
      userId,
      era,
      significanceScore: eraScore.score,
      metadata: {
        significance: eraScore.breakdown,
        reprocessed: true,
        projection_generation: projectionGeneration,
      },
    });
    if (row?.id) erasPublished += 1;
  }

  if (staged) {
    await publishProjectionGeneration(userId, projectionGeneration);
    clearedChapters = await removeSupersededProjectionRows(
      'narrative_story_chapters',
      userId,
      projectionGeneration,
    );
    clearedLifeChapters = await removeSupersededProjectionRows(
      'narrative_life_chapters',
      userId,
      projectionGeneration,
    );
    await removeSupersededProjectionRows('narrative_life_eras', userId, projectionGeneration);
  }

  return {
    scenes: scenes.length,
    assembled: assembled.length,
    published,
    rejected,
    lifeChaptersPublished,
    erasPublished,
    clearedChapters,
    clearedLifeChapters,
    chapters,
  };
}

const reprocessInFlight = new Map<string, Promise<StoryChapterReprocessResult>>();

export async function reprocessStoryChaptersForUser(
  userId: string,
): Promise<StoryChapterReprocessResult> {
  const active = reprocessInFlight.get(userId);
  if (active) return active;
  const rebuild = rebuildStoryChaptersForUser(userId).finally(() => {
    reprocessInFlight.delete(userId);
  });
  reprocessInFlight.set(userId, rebuild);
  return rebuild;
}

export const storyChapterReprocessService = {
  reprocessForUser: reprocessStoryChaptersForUser,
};
