/**
 * Narrative Arc Consolidation — proposes life_arcs from lexical story structure.
 *
 * Clusters resolved_events that carry narrative_structure metadata, upserts
 * life_arcs (proposed, confidence-scored), and links event_candidates via
 * arc_memberships.
 */
import { tracedCompletion } from '../../lib/openai';
import { logger } from '../../logger';
import { arcMembershipService } from '../continuityRuntime/arcs/arcMembershipService';
import { arcService } from '../continuityRuntime/arcs/arcService';
import { supabaseAdmin } from '../supabaseClient';

import {
  CHAPTER_CONTRIBUTION_THRESHOLD,
  buildNarrativeChapterPlans,
  clusterStoryEvents,
  membershipRoleForEvent,
  parseNarrativeStructure,
  proposeStoryArc,
  type NarrativeChapterPlan,
  type StoryArcCluster,
  type StoryEventRecord,
} from './narrativeArcConsolidationBridge';

const MAX_EVENTS = 400;
/** Narrative drafting on by default; deterministic fallbacks preserve the pipeline offline. */
const LLM_CHAPTERS_ENABLED = process.env.NARRATIVE_ARC_LLM_TITLES !== '0';
const CONTRIBUTION_THRESHOLD = Math.min(
  100,
  Math.max(0, Number(process.env.NARRATIVE_CHAPTER_CONTRIBUTION_THRESHOLD) || CHAPTER_CONTRIBUTION_THRESHOLD),
);
const QUALITY_THRESHOLD = Math.min(
  100,
  Math.max(0, Number(process.env.NARRATIVE_CHAPTER_QUALITY_THRESHOLD) || 60),
);

async function loadStoryEvents(userId: string): Promise<StoryEventRecord[]> {
  const { data, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, title, summary, start_time, people, locations, activities, tags, metadata')
    .eq('user_id', userId)
    .order('start_time', { ascending: true })
    .limit(MAX_EVENTS);

  if (error) {
    logger.error({ error, userId }, 'narrativeArcConsolidation: load events failed');
    return [];
  }

  const out: StoryEventRecord[] = [];
  for (const row of data ?? []) {
    const narrative = parseNarrativeStructure(row.metadata as Record<string, unknown>);
    if (!narrative) continue;
    out.push({
      id: row.id as string,
      title: row.title as string,
      summary: (row.summary as string | null) ?? null,
      start_time: row.start_time as string,
      people: (row.people as string[]) ?? [],
      locations: (row.locations as string[]) ?? [],
      activities: (row.activities as string[]) ?? [],
      tags: (row.tags as string[]) ?? [],
      narrative,
    });
  }
  return out;
}

async function findArcByConsolidationKey(userId: string, key: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('life_arcs')
    .select('id')
    .eq('user_id', userId)
    .contains('metadata', { consolidation_key: key })
    .maybeSingle();
  return (data?.id as string) ?? null;
}

type ExistingNarrativeArc = {
  id: string;
  sourceEventIds: string[];
  consolidationKey?: string;
  proposed: boolean;
};

async function loadExistingNarrativeArcs(userId: string): Promise<ExistingNarrativeArc[]> {
  const { data } = await supabaseAdmin
    .from('life_arcs')
    .select('id, metadata')
    .eq('user_id', userId)
    .contains('tags', ['narrative_consolidation']);
  return (data ?? []).map((row) => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      sourceEventIds: (metadata.source_event_ids as string[]) ?? [],
      consolidationKey: metadata.consolidation_key as string | undefined,
      proposed: metadata.proposed === true,
    };
  });
}

function bestReusableArc(
  existing: ExistingNarrativeArc[],
  claimed: Set<string>,
  eventIds: string[],
): ExistingNarrativeArc | undefined {
  const desired = new Set(eventIds);
  return existing
    .filter((arc) => !claimed.has(arc.id))
    .map((arc) => ({
      arc,
      overlap: arc.sourceEventIds.filter((id) => desired.has(id)).length,
    }))
    .filter((candidate) => candidate.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)[0]?.arc;
}

async function linkEventCandidates(
  userId: string,
  arcId: string,
  events: StoryEventRecord[],
): Promise<number> {
  let linked = 0;

  for (const event of events) {
    const { data: candidates } = await supabaseAdmin
      .from('event_candidates')
      .select('id')
      .eq('user_id', userId)
      .contains('source_event_ids', [event.id]);

    for (const candidate of candidates ?? []) {
      const role = membershipRoleForEvent(event);
      await arcMembershipService.set(userId, {
        arc_id: arcId,
        event_candidate_id: candidate.id as string,
        importance_score: role === 'turning_point' ? 0.85 : role === 'defining_moment' ? 0.75 : 0.55,
        role,
        metadata: {
          narrative_consolidation: true,
          source_event_id: event.id,
          narrative_stages: event.narrative.stages ?? [],
        },
      });
      linked += 1;
    }
  }

  return linked;
}

async function replaceEventCandidateLinks(
  userId: string,
  arcId: string,
  events: StoryEventRecord[],
): Promise<number> {
  const { error } = await supabaseAdmin
    .from('arc_memberships')
    .delete()
    .eq('user_id', userId)
    .eq('arc_id', arcId);
  if (error) {
    logger.warn({ error, userId, arcId }, 'narrativeArcConsolidation: stale memberships not cleared');
  }
  return linkEventCandidates(userId, arcId, events);
}

type ChapterNarrative = {
  thesis: string;
  dominantTheme: string;
  backgroundContext: string[];
  outcomes: string[];
};

async function generateChapterNarrative(
  plan: NarrativeChapterPlan,
  userId: string,
): Promise<ChapterNarrative> {
  const fallback: ChapterNarrative = {
    thesis: plan.thesis,
    dominantTheme: plan.dominantTheme,
    backgroundContext: plan.backgroundEvents.map((event) => event.summary || event.title),
    outcomes: plan.outcomes,
  };
  if (!LLM_CHAPTERS_ENABLED) return fallback;

  const scenes = plan.supportingEvents
    .map((event) => `- [${event.id}] ${event.title}: ${event.summary ?? ''}`)
    .join('\n');
  const context = plan.backgroundEvents
    .map((event) => `- [${event.id}] ${event.title}: ${event.summary ?? ''}`)
    .join('\n');
  const prompt = `Write the identity of one autobiographical chapter. Do not create a title yet.

Supporting scenes:
${scenes}

Possible background context (exposition, not scenes):
${context || '- none'}

The thesis must express one story, not combine parallel topics. Outcomes answer "what changed?".
Respond with JSON only:
{
  "thesis": "This chapter tells the story of ...",
  "dominantTheme": "<one concise theme>",
  "backgroundContext": ["<context fact>"],
  "outcomes": ["<concrete change or result>"]
}`;

  try {
    const completion = await tracedCompletion(
      {
        model: 'gpt-5.4-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 320,
        temperature: 0.2,
      },
      { service: 'narrativeChapterThesis', userId },
    );
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Partial<ChapterNarrative>;
    return {
      thesis: parsed.thesis?.trim() || fallback.thesis,
      dominantTheme: parsed.dominantTheme?.trim() || fallback.dominantTheme,
      backgroundContext: Array.isArray(parsed.backgroundContext)
        ? parsed.backgroundContext.map(String).filter(Boolean).slice(0, 6)
        : fallback.backgroundContext,
      outcomes: Array.isArray(parsed.outcomes)
        ? parsed.outcomes.map(String).filter(Boolean).slice(0, 5)
        : fallback.outcomes,
    };
  } catch (err) {
    logger.debug({ err, userId }, 'narrativeArcConsolidation: thesis generation failed');
    return fallback;
  }
}

async function generateChapterTitle(
  plan: NarrativeChapterPlan,
  narrative: ChapterNarrative,
  fallbackTitle: string,
  userId: string,
): Promise<string> {
  if (!LLM_CHAPTERS_ENABLED) return fallbackTitle;
  const scenes = plan.supportingEvents.map((event) => `- ${event.title}`).join('\n');
  const prompt = `Name this completed autobiographical chapter. The title is generated last and may only describe the thesis and included scenes.

Thesis: ${narrative.thesis}
Dominant theme: ${narrative.dominantTheme}
Scenes:
${scenes}
Outcomes:
${narrative.outcomes.map((outcome) => `- ${outcome}`).join('\n')}

Respond with JSON only: { "title": "<2-7 word chapter title>" }`;
  try {
    const completion = await tracedCompletion(
      {
        model: 'gpt-5.4-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 80,
        temperature: 0.25,
      },
      { service: 'narrativeChapterTitle', userId },
    );
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as { title?: string };
    return parsed.title?.trim() || fallbackTitle;
  } catch (err) {
    logger.debug({ err, userId }, 'narrativeArcConsolidation: title generation failed');
    return fallbackTitle;
  }
}

async function persistNarrativeChapter(
  userId: string,
  arcId: string,
  title: string,
  plan: NarrativeChapterPlan,
  narrative: ChapterNarrative,
): Promise<void> {
  const contributionScores = Object.fromEntries(
    plan.contributions.map((item) => [item.eventId, item.score]),
  );
  const { error } = await supabaseAdmin.from('narrative_chapters').upsert({
    user_id: userId,
    life_arc_id: arcId,
    title,
    thesis: narrative.thesis,
    dominant_theme: narrative.dominantTheme,
    start_date: plan.supportingEvents[0]?.start_time?.slice(0, 10) ?? null,
    end_date: plan.supportingEvents.at(-1)?.start_time?.slice(0, 10) ?? null,
    participant_ids: plan.participants,
    location_ids: plan.locations,
    supporting_event_ids: plan.supportingEvents.map((event) => event.id),
    background_event_ids: plan.backgroundEvents.map((event) => event.id),
    background_context: narrative.backgroundContext,
    outcomes: narrative.outcomes,
    contribution_scores: contributionScores,
    quality: plan.quality,
    confidence: plan.confidence,
    generation_version: 'chapter-thesis-v1',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'life_arc_id' });
  if (error) {
    logger.warn({ error, userId, arcId }, 'narrativeArcConsolidation: chapter persistence failed');
  }
}

export class NarrativeArcConsolidationService {
  async runForUser(userId: string): Promise<{ arcs: number; memberships: number }> {
    const events = await loadStoryEvents(userId);
    if (events.length === 0) {
      logger.debug({ userId }, 'narrativeArcConsolidation: no structured events');
      return { arcs: 0, memberships: 0 };
    }

    const clusters = clusterStoryEvents(events);
    if (clusters.length === 0) {
      logger.debug({ userId, structuredEvents: events.length }, 'narrativeArcConsolidation: no clusters');
      return { arcs: 0, memberships: 0 };
    }

    let arcCount = 0;
    let membershipCount = 0;
    const existingArcs = await loadExistingNarrativeArcs(userId);
    const claimedArcIds = new Set<string>();

    const plans = clusters.flatMap((cluster) =>
      buildNarrativeChapterPlans(cluster, events, CONTRIBUTION_THRESHOLD),
    );

    for (const plan of plans) {
      const planKey = plan.supportingEvents.map((event) => event.id).sort().join(':');
      try {
        if (plan.quality.overallStoryQuality < QUALITY_THRESHOLD || plan.supportingEvents.length === 0) {
          logger.warn(
            { userId, key: planKey, quality: plan.quality.overallStoryQuality },
            'narrativeArcConsolidation: chapter rejected by quality gate',
          );
          continue;
        }

        const chapterCluster: StoryArcCluster = {
          events: plan.supportingEvents,
          earliest: new Date(plan.supportingEvents[0].start_time),
          latest: new Date(plan.supportingEvents[plan.supportingEvents.length - 1].start_time),
          consolidationKey: plan.supportingEvents.map((event) => event.id).sort().join(':'),
        };
        const exactId = await findArcByConsolidationKey(userId, chapterCluster.consolidationKey);
        const reusable = exactId
          ? existingArcs.find((arc) => arc.id === exactId)
          : bestReusableArc(
              existingArcs,
              claimedArcIds,
              plan.supportingEvents.map((event) => event.id),
            );
        const existingId = exactId ?? reusable?.id ?? null;
        if (existingId) claimedArcIds.add(existingId);
        const proposal = proposeStoryArc(chapterCluster);
        const narrative = await generateChapterNarrative(plan, userId);
        // Title deliberately comes last, after the thesis and contribution gate.
        const title = await generateChapterTitle(plan, narrative, proposal.title, userId);
        const contributionScores = Object.fromEntries(
          plan.contributions.map((item) => [item.eventId, item.score]),
        );
        const chapterMetadata = {
          consolidation_key: chapterCluster.consolidationKey,
          detector: 'narrative_chapter',
          dominant_stages: proposal.dominant_stages,
          source_event_ids: plan.supportingEvents.map((event) => event.id),
          background_event_ids: plan.backgroundEvents.map((event) => event.id),
          excluded_event_ids: plan.excludedEvents.map((event) => event.id),
          chapter_thesis: narrative.thesis,
          dominant_theme: narrative.dominantTheme,
          participant_ids: plan.participants,
          location_ids: plan.locations,
          background_context: narrative.backgroundContext,
          outcomes: narrative.outcomes,
          contribution_scores: contributionScores,
          chapter_quality: plan.quality,
          generation_version: 'chapter-thesis-v1',
          proposed: true,
        };

        const arc = existingId
          ? await arcService.update(userId, existingId, {
              title,
              summary: narrative.thesis,
              emotional_arc: proposal.emotional_arc,
              confidence: Math.max(plan.confidence, 0.5),
              is_active: proposal.is_active,
              end_date: proposal.end_date,
              tags: proposal.tags,
              metadata: chapterMetadata,
            })
          : await arcService.upsert(userId, {
              title,
              arc_type: 'custom',
              track: 'inner',
              emotional_arc: proposal.emotional_arc,
              start_date: proposal.start_date,
              end_date: proposal.end_date,
              is_active: proposal.is_active,
              summary: narrative.thesis,
              confidence: plan.confidence,
              source: 'inferred',
              tags: proposal.tags,
              metadata: chapterMetadata,
            });

        await persistNarrativeChapter(userId, arc.id, title, plan, narrative);
        arcCount += 1;
        claimedArcIds.add(arc.id);
        membershipCount += await replaceEventCandidateLinks(userId, arc.id, plan.supportingEvents);

        logger.debug(
          {
            userId,
            arcId: arc.id,
            title: arc.title,
            scenes: plan.supportingEvents.length,
            background: plan.backgroundEvents.length,
            excluded: plan.excludedEvents.length,
            quality: plan.quality.overallStoryQuality,
          },
          'narrativeArcConsolidation: chapter upserted',
        );
      } catch (err) {
        logger.warn({ err, userId, key: planKey }, 'narrativeArcConsolidation: chapter failed');
      }
    }

    // Remove only stale, system-proposed chapters. They are derived data and
    // will otherwise leave the old broad semantic cluster visible beside the
    // new story-driven chapters.
    for (const stale of existingArcs) {
      if (!stale.proposed || claimedArcIds.has(stale.id)) continue;
      await arcService.delete(userId, stale.id);
      logger.info({ userId, arcId: stale.id }, 'narrativeArcConsolidation: stale chapter removed');
    }

    logger.info({ userId, arcs: arcCount, memberships: membershipCount }, 'narrativeArcConsolidation: complete');
    return { arcs: arcCount, memberships: membershipCount };
  }
}

export const narrativeArcConsolidationService = new NarrativeArcConsolidationService();
