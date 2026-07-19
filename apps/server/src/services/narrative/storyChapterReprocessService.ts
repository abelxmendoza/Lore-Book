/**
 * Rebuild Story Chapters with Narrative Ownership from existing Scenes.
 * Used by CLI and POST /api/story/story-chapters/reprocess.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { assembleChaptersFromScenes, type ChapterSceneInput } from './chapterAssembler';
import { mayPersistChapter } from './chapterSignificance';
import { mayPublishOwnedChapter } from './narrativeValidation';
import { narrativeStoryChapterService } from './narrativeStoryChapterService';
import { assembleErasFromChapters, chapterRowToEraInput } from './eraAssembler';
import { mayPersistEra } from './eraSignificance';
import { narrativeLifeEraService } from './narrativeLifeEraService';

export type StoryChapterReprocessResult = {
  scenes: number;
  assembled: number;
  published: number;
  rejected: number;
  erasPublished: number;
  clearedChapters: number;
  chapters: Awaited<ReturnType<typeof narrativeStoryChapterService.listChapters>>;
};

async function loadScenes(userId: string): Promise<ChapterSceneInput[]> {
  const { data, error } = await supabaseAdmin
    .from('narrative_scenes')
    .select(
      'id, title, summary, time_start, time_end, location, participants, primary_goal, dominant_emotion, significance_score, promoted_event_id',
    )
    .eq('user_id', userId)
    .order('time_start', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((row) => ({
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
    promotedEventId: (row.promoted_event_id as string) ?? null,
  }));
}

export async function reprocessStoryChaptersForUser(
  userId: string,
): Promise<StoryChapterReprocessResult> {
  const scenes = await loadScenes(userId);

  const { error: eraClearError } = await supabaseAdmin
    .from('narrative_life_eras')
    .delete()
    .eq('user_id', userId);
  if (eraClearError) {
    logger.warn({ error: eraClearError, userId }, 'story chapter reprocess: era clear failed');
  }

  const clearedChapters = await narrativeStoryChapterService.clearChaptersForUser(userId);
  const assembled = assembleChaptersFromScenes(scenes);

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
      },
    });
    if (row?.id) published += 1;
  }

  const chapters = await narrativeStoryChapterService.listChapters(userId, { limit: 100 });
  const eras = assembleErasFromChapters(chapters.map(chapterRowToEraInput));
  let erasPublished = 0;
  for (const era of eras) {
    const eraScore = mayPersistEra(era);
    if (!eraScore.allow) continue;
    const row = await narrativeLifeEraService.upsertEra({
      userId,
      era,
      significanceScore: eraScore.score,
      metadata: { significance: eraScore.breakdown, reprocessed: true },
    });
    if (row?.id) erasPublished += 1;
  }

  return {
    scenes: scenes.length,
    assembled: assembled.length,
    published,
    rejected,
    erasPublished,
    clearedChapters,
    chapters,
  };
}

export const storyChapterReprocessService = {
  reprocessForUser: reprocessStoryChaptersForUser,
};
