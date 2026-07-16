/**
 * Story assembly — related events become ONE story, not N isolated memories.
 *
 * A multi-stop night out (venue → venue → venue → home) is a single lived
 * experience with an arc. Events chain into a story when they sit inside the
 * same time window and share participants, or clearly belong to one outing.
 */
import type { AnchorBuildContext, AnchorBuildEvent } from './narrativeAnchorTypes';
import { scoreEventImportance } from './importanceScorer';
import type { AssembledStory, EventImportance, StoryStop } from './narrativeCognitionTypes';

/** Events within this many hours of each other may chain into one story. */
const MAX_STOP_GAP_HOURS = 8;

function parseTime(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function sharesParticipant(a: AnchorBuildEvent, b: AnchorBuildEvent): boolean {
  if (a.entityIds.length === 0 || b.entityIds.length === 0) return true; // sparse data: time adjacency decides
  const setA = new Set(a.entityIds);
  return b.entityIds.some((id) => setA.has(id));
}

function placeNamesFor(event: AnchorBuildEvent, ctx: AnchorBuildContext): string[] {
  const locationIds = new Set(
    ctx.entities.filter((e) => e.entityType === 'location').map((e) => e.entityId),
  );
  return event.entityIds
    .filter((id) => locationIds.has(id))
    .map((id) => ctx.entities.find((e) => e.entityId === id)?.name)
    .filter((name): name is string => Boolean(name));
}

function storyImportance(stops: AnchorBuildEvent[]): EventImportance {
  const scored = stops.map(scoreEventImportance);
  const best = scored.reduce((max, s) => (s.score > max.score ? s : max), scored[0]);
  // Multi-stop outings carry more narrative weight than any single stop.
  const bonus = Math.min(0.15, (stops.length - 1) * 0.05);
  const score = Math.min(1, best.score + bonus);
  return {
    score: Math.round(score * 100) / 100,
    level: best.level,
    reasons: stops.length > 1 ? [...best.reasons, `${stops.length}-stop story`] : best.reasons,
  };
}

function titleFor(stops: StoryStop[]): string {
  const labels = stops.map((stop) => stop.placeNames[0] ?? stop.title);
  return labels.join(' → ');
}

/**
 * Group time-adjacent, participant-sharing events into stories. Events without
 * timestamps stay single-stop stories — adjacency cannot be proven.
 */
export function assembleStories(ctx: AnchorBuildContext): AssembledStory[] {
  const dated = ctx.events
    .filter((event) => parseTime(event.startDate) != null)
    .sort((a, b) => parseTime(a.startDate)! - parseTime(b.startDate)!);
  const undated = ctx.events.filter((event) => parseTime(event.startDate) == null);

  const groups: AnchorBuildEvent[][] = [];
  for (const event of dated) {
    const current = groups[groups.length - 1];
    const previous = current?.[current.length - 1];
    if (
      previous &&
      parseTime(event.startDate)! - parseTime(previous.startDate)! <=
        MAX_STOP_GAP_HOURS * 3_600_000 &&
      sharesParticipant(previous, event)
    ) {
      current.push(event);
    } else {
      groups.push([event]);
    }
  }
  for (const event of undated) groups.push([event]);

  return groups.map((group) => {
    const stops: StoryStop[] = group.map((event, index) => ({
      eventId: event.id,
      title: event.title,
      startTime: event.startDate,
      placeNames: placeNamesFor(event, ctx),
      order: index,
    }));
    const peopleIds = [
      ...new Set(
        group.flatMap((event) => event.entityIds).filter((id) =>
          ctx.entities.some((e) => e.entityId === id && e.entityType === 'character'),
        ),
      ),
    ];
    return {
      id: `story-${group[0].id}`,
      title: titleFor(stops),
      stops,
      peopleIds,
      placeNames: [...new Set(stops.flatMap((stop) => stop.placeNames))],
      startTime: group[0].startDate,
      endTime: group[group.length - 1].startDate,
      importance: storyImportance(group),
      isMultiStop: group.length > 1,
    };
  });
}

/** The most recent story — what "your latest outing" should resolve to. */
export function latestStory(stories: AssembledStory[]): AssembledStory | null {
  const dated = stories.filter((story) => parseTime(story.startTime) != null);
  if (dated.length === 0) return null;
  return dated.reduce((latest, story) =>
    parseTime(story.startTime)! > parseTime(latest.startTime)! ? story : latest,
  );
}
