/**
 * Narrative Arc Consolidation — proposes life_arcs from lexical story structure.
 *
 * Clusters resolved_events that carry narrative_structure metadata, upserts
 * life_arcs (proposed, confidence-scored), and links event_candidates via
 * arc_memberships.
 */
import { logger } from '../../logger';
import { tracedCompletion } from '../../lib/openai';
import { supabaseAdmin } from '../supabaseClient';
import { arcService } from '../continuityRuntime/arcs/arcService';
import { arcMembershipService } from '../continuityRuntime/arcs/arcMembershipService';
import {
  clusterStoryEvents,
  membershipRoleForEvent,
  parseNarrativeStructure,
  proposeStoryArc,
  type StoryArcCluster,
  type StoryEventRecord,
} from './narrativeArcConsolidationBridge';

const MAX_EVENTS = 400;
/** LLM titles on by default; set NARRATIVE_ARC_LLM_TITLES=0 to disable. */
const LLM_TITLES_ENABLED = process.env.NARRATIVE_ARC_LLM_TITLES !== '0';

async function loadStoryEvents(userId: string): Promise<StoryEventRecord[]> {
  const { data, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, title, summary, start_time, people, locations, metadata')
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

async function polishStoryArcTitle(
  cluster: StoryArcCluster,
  fallbackTitle: string,
  userId: string,
): Promise<{ title: string; summary: string }> {
  const eventLines = cluster.events
    .slice(0, 6)
    .map((e) => {
      const stages = (e.narrative.stages ?? []).map((s) => s.stage).join(', ');
      return `- "${e.title}"${stages ? ` (${stages})` : ''}`;
    })
    .join('\n');

  const prompt = `You are naming a short personal story arc from autobiographical events.

Date range: ${cluster.earliest.toISOString().slice(0, 10)} to ${cluster.latest.toISOString().slice(0, 10)}
Events:
${eventLines}

Respond with JSON only:
{
  "title": "<2-6 word evocative chapter title>",
  "summary": "<1 sentence describing the story beat>"
}`;

  try {
    const completion = await tracedCompletion(
      {
        model: 'gpt-5.4-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 160,
        temperature: 0.3,
      },
      { service: 'narrativeArcConsolidation', userId },
    );

    const text = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text) as { title?: string; summary?: string };
    return {
      title: parsed.title?.trim() || fallbackTitle,
      summary: parsed.summary?.trim() || '',
    };
  } catch (err) {
    logger.debug({ err, userId }, 'narrativeArcConsolidation: LLM title failed, using fallback');
    return { title: fallbackTitle, summary: '' };
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

    for (const cluster of clusters) {
      try {
        const existingId = await findArcByConsolidationKey(userId, cluster.consolidationKey);
        let proposal = proposeStoryArc(cluster);
        if (LLM_TITLES_ENABLED) {
          const polished = await polishStoryArcTitle(cluster, proposal.title, userId);
          proposal = {
            ...proposal,
            title: polished.title,
            summary: polished.summary || proposal.summary,
          };
        }

        const arc = existingId
          ? await arcService.update(userId, existingId, {
              title: proposal.title,
              summary: proposal.summary,
              emotional_arc: proposal.emotional_arc,
              confidence: Math.max(proposal.confidence, 0.5),
              is_active: proposal.is_active,
              end_date: proposal.end_date,
              tags: proposal.tags,
              metadata: {
                consolidation_key: cluster.consolidationKey,
                detector: 'narrative_consolidation',
                dominant_stages: proposal.dominant_stages,
                source_event_ids: cluster.events.map((e) => e.id),
                proposed: true,
              },
            })
          : await arcService.upsert(userId, {
              title: proposal.title,
              arc_type: 'custom',
              track: 'inner',
              emotional_arc: proposal.emotional_arc,
              start_date: proposal.start_date,
              end_date: proposal.end_date,
              is_active: proposal.is_active,
              summary: proposal.summary,
              confidence: proposal.confidence,
              source: 'inferred',
              tags: proposal.tags,
              metadata: {
                consolidation_key: cluster.consolidationKey,
                detector: 'narrative_consolidation',
                dominant_stages: proposal.dominant_stages,
                source_event_ids: cluster.events.map((e) => e.id),
                proposed: true,
              },
            });

        arcCount += 1;
        membershipCount += await linkEventCandidates(userId, arc.id, cluster.events);

        logger.debug(
          { userId, arcId: arc.id, title: arc.title, events: cluster.events.length },
          'narrativeArcConsolidation: arc upserted',
        );
      } catch (err) {
        logger.warn({ err, userId, key: cluster.consolidationKey }, 'narrativeArcConsolidation: cluster failed');
      }
    }

    logger.info({ userId, arcs: arcCount, memberships: membershipCount }, 'narrativeArcConsolidation: complete');
    return { arcs: arcCount, memberships: membershipCount };
  }
}

export const narrativeArcConsolidationService = new NarrativeArcConsolidationService();
