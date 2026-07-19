#!/usr/bin/env tsx
/**
 * Smoke-test Moments → Scenes → Story Chapters → Life Eras.
 *
 * Usage:
 *   SMOKE_USER_ID=<uuid> npx tsx src/scripts/smokeNarrativeLadder.ts
 *
 * Optional:
 *   SMOKE_WINDOW_DAYS=365  (default 365)
 */
import { eventAssemblyService } from '../services/conversationCentered/eventAssemblyService';
import { supabaseAdmin } from '../services/supabaseClient';

const userId = process.env.SMOKE_USER_ID ?? process.env.TARGET_USER_ID ?? '';
const windowDays = Number(process.env.SMOKE_WINDOW_DAYS ?? 365);

async function countForUser(table: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) {
    console.error(`count ${table}:`, error.message);
    return -1;
  }
  return count ?? 0;
}

async function main() {
  if (!userId) {
    console.error('Required: SMOKE_USER_ID or TARGET_USER_ID');
    process.exit(1);
  }

  console.log(`Assembling events for user ${userId.slice(0, 8)}… (windowDays=${windowDays})`);
  const events = await eventAssemblyService.assembleEvents(userId, undefined, {
    windowDays: Number.isFinite(windowDays) ? windowDays : 365,
  });
  console.log(`assembleEvents returned ${events.length} event result(s)`);

  const moments = await countForUser('narrative_moments');
  const scenes = await countForUser('narrative_scenes');
  const chapters = await countForUser('narrative_story_chapters');
  const eras = await countForUser('narrative_life_eras');

  console.log(
    JSON.stringify(
      {
        userPrefix: userId.slice(0, 8),
        events: events.length,
        narrative_moments: moments,
        narrative_scenes: scenes,
        narrative_story_chapters: chapters,
        narrative_life_eras: eras,
        pass:
          moments > 0 &&
          scenes > 0 &&
          chapters > 0 &&
          eras > 0,
      },
      null,
      2,
    ),
  );

  if (moments <= 0 || scenes <= 0) {
    process.exitCode = 2;
  } else if (chapters <= 0 || eras <= 0) {
    // Moments/Scenes ok; chapters/eras may need richer multi-scene spans
    process.exitCode = 3;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
