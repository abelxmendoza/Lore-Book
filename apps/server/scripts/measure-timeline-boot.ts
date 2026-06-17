/**
 * Measures timeline bootstrap latency (cold + warm cache).
 * Usage: npx tsx scripts/measure-timeline-boot.ts [userId]
 */
import { chapterInsightsService } from '../src/services/chapterInsightsService';
import { chapterService } from '../src/services/chapterService';
import { memoryService } from '../src/services/memoryService';
import { supabaseAdmin } from '../src/services/supabaseClient';

async function resolveUserId(): Promise<string | null> {
  const arg = process.argv[2];
  if (arg) return arg;

  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .select('user_id')
    .limit(1000);

  if (error || !data?.length) return null;

  const counts = new Map<string, number>();
  for (const row of data) {
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [userId, count] of counts) {
    if (count > bestCount) {
      best = userId;
      bestCount = count;
    }
  }
  return best;
}

async function simulateBoot(userId: string, label: string) {
  const wallStart = Date.now();

  const timelinePromise = memoryService.getTimeline(userId);
  const tagsPromise = memoryService.listTags(userId);
  const chaptersPromise = (async () => {
    const started = Date.now();
    const entries = await memoryService.searchEntries(userId, { limit: 400 });
    const entryFetchMs = Date.now() - started;
    const chapterLoadStart = Date.now();
    const chapterRows = await chapterService.listChapters(userId);
    const chapterLoadMs = Date.now() - chapterLoadStart;
    const profileStart = Date.now();
    const candidateStart = Date.now();
    const [chapters, candidates] = await Promise.all([
      chapterInsightsService.buildProfiles(userId, { entries, chapters: chapterRows }),
      chapterInsightsService.detectCandidates(userId, { entries }),
    ]);
    return {
      chapters,
      candidates,
      timing: {
        totalMs: Date.now() - started,
        entryFetchMs,
        chapterLoadMs,
        profileComputeMs: Date.now() - profileStart,
        candidateComputeMs: Date.now() - candidateStart,
      },
    };
  })();

  const [timeline, tags, chapters] = await Promise.all([
    timelinePromise,
    tagsPromise,
    chaptersPromise,
  ]);

  const wallMs = Date.now() - wallStart;

  console.log(`\n=== ${label} ===`);
  console.log(
    JSON.stringify(
      {
        userId,
        wallMs,
        timeline: timeline.timing,
        tags: tags.timing,
        chapters: chapters.timing,
        openaiMs: 0,
        arcLoadingMs: 0,
        note: 'Arc/era/saga loads happen on Omni Timeline page via /api/timeline/arcs — not on boot endpoints',
      },
      null,
      2
    )
  );
}

async function main() {
  const userId = await resolveUserId();
  if (!userId) {
    console.error('No userId found. Pass one: npx tsx scripts/measure-timeline-boot.ts <userId>');
    process.exit(1);
  }

  memoryService.invalidateEntryListCache(userId);
  await simulateBoot(userId, 'COLD BOOT (cache cleared)');

  await simulateBoot(userId, 'WARM BOOT (30s entry cache)');

  process.exit(0);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
