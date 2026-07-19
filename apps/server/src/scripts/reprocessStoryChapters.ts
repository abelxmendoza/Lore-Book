#!/usr/bin/env tsx
/**
 * Rebuild Story Chapters with Narrative Ownership from existing Scenes.
 *
 * Usage:
 *   SMOKE_USER_ID=<uuid> npx tsx src/scripts/reprocessStoryChapters.ts
 */
import { assembleChaptersFromScenes, type ChapterSceneInput } from '../services/narrative/chapterAssembler';
import { mayPersistChapter } from '../services/narrative/chapterSignificance';
import { mayPublishOwnedChapter } from '../services/narrative/narrativeValidation';
import { narrativeStoryChapterService } from '../services/narrative/narrativeStoryChapterService';
import {
  assembleErasFromChapters,
  chapterRowToEraInput,
} from '../services/narrative/eraAssembler';
import { mayPersistEra } from '../services/narrative/eraSignificance';
import { narrativeLifeEraService } from '../services/narrative/narrativeLifeEraService';
import { supabaseAdmin } from '../services/supabaseClient';

const userId = process.env.SMOKE_USER_ID ?? process.env.TARGET_USER_ID ?? '';

async function loadScenes(uid: string): Promise<ChapterSceneInput[]> {
  const { data, error } = await supabaseAdmin
    .from('narrative_scenes')
    .select(
      'id, title, summary, time_start, time_end, location, participants, primary_goal, dominant_emotion, significance_score, promoted_event_id',
    )
    .eq('user_id', uid)
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

async function main() {
  if (!userId) {
    console.error('Required: SMOKE_USER_ID or TARGET_USER_ID');
    process.exit(1);
  }

  const scenes = await loadScenes(userId);
  console.log(`Loaded ${scenes.length} scenes for ${userId.slice(0, 8)}…`);

  // Clear eras first (FK from chapters), then chapters.
  const { error: eraClearError } = await supabaseAdmin
    .from('narrative_life_eras')
    .delete()
    .eq('user_id', userId);
  if (eraClearError) {
    console.warn('era clear:', eraClearError.message);
  }

  const cleared = await narrativeStoryChapterService.clearChaptersForUser(userId);
  console.log(`Cleared ${cleared} prior story chapters`);

  const assembled = assembleChaptersFromScenes(scenes);
  let published = 0;
  let rejected = 0;
  for (const chapter of assembled) {
    const ownershipGate = mayPublishOwnedChapter(chapter);
    const score = mayPersistChapter(chapter);
    if (!ownershipGate.allow || !score.allow) {
      rejected += 1;
      console.log(
        JSON.stringify({
          skipped: chapter.title,
          ownershipReasons: ownershipGate.reasons,
          scoreAllow: score.allow,
        }),
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
    if (row?.id) {
      published += 1;
      console.log(
        JSON.stringify({
          published: row.title,
          primary_narrative: row.primary_narrative,
          primary_subject: row.primary_subject,
          scenes: row.scene_ids?.length,
        }),
      );
    }
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

  console.log(
    JSON.stringify(
      {
        scenes: scenes.length,
        assembled: assembled.length,
        published,
        rejected,
        erasPublished,
        pass: published > 0,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
