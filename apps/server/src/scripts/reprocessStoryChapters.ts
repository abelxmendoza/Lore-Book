#!/usr/bin/env tsx
/**
 * Rebuild Story Chapters with Narrative Ownership from existing Scenes.
 *
 * Usage:
 *   SMOKE_USER_ID=<uuid> npx tsx src/scripts/reprocessStoryChapters.ts
 */
import { storyChapterReprocessService } from '../services/narrative/storyChapterReprocessService';

const userId = process.env.SMOKE_USER_ID ?? process.env.TARGET_USER_ID ?? '';

async function main() {
  if (!userId) {
    console.error('Required: SMOKE_USER_ID or TARGET_USER_ID');
    process.exit(1);
  }

  console.log(`Reprocessing story chapters for ${userId.slice(0, 8)}…`);
  const result = await storyChapterReprocessService.reprocessForUser(userId);
  console.log(
    JSON.stringify(
      {
        scenes: result.scenes,
        assembled: result.assembled,
        published: result.published,
        rejected: result.rejected,
        erasPublished: result.erasPublished,
        clearedChapters: result.clearedChapters,
        pass: result.published > 0 || result.scenes === 0,
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
