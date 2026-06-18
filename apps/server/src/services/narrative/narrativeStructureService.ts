/**
 * Narrative Structure Service — persists lexical story structure onto the graph.
 *
 * Writes proposed (not asserted) narrative structure to:
 *   - resolved_events.metadata.narrative_structure
 *   - event_interpretations (append-only, lexical detector metadata)
 *   - arc_memberships.role boost when a candidate links to a turning-point event
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { interpretationService } from '../interpretationService';
import { arcMembershipService, type MembershipRole } from '../continuityRuntime/arcs/arcMembershipService';
import {
  analyzeNarrativeStructure,
  stageToNarrativeRole,
  type NarrativeStructureAnalysis,
} from './narrativeStructureBridge';

export type { NarrativeStructureAnalysis };

const ROLE_RANK: Record<MembershipRole, number> = {
  turning_point: 4,
  defining_moment: 3,
  transition: 2,
  background: 1,
};

function mergeMetadata(
  existing: Record<string, unknown> | null | undefined,
  analysis: NarrativeStructureAnalysis,
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    narrative_structure: {
      stages: analysis.stages.map((s) => ({
        stage: s.stage,
        cue: s.cue,
        confidence: s.confidence,
        sentence_index: s.sentenceIndex,
      })),
      discourse: analysis.discourse.map((d) => ({
        move: d.move,
        cue: d.cue,
        confidence: d.confidence,
      })),
      primary_narrative_role: analysis.primaryNarrativeRole,
      primary_arc_membership_role: analysis.primaryArcMembershipRole,
      is_story_block: analysis.isStoryBlock,
      detector: 'lexical',
      updated_at: new Date().toISOString(),
    },
  };
}

async function writeInterpretations(
  userId: string,
  analysis: NarrativeStructureAnalysis,
  targets: { eventId?: string; journalEntryId?: string },
): Promise<void> {
  const seen = new Set<string>();
  for (const stage of analysis.stages) {
    const role = stageToNarrativeRole(stage.stage);
    if (!role) continue;
    const key = `${role}:${stage.cue}`;
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      await interpretationService.addInterpretation(userId, {
        eventId: targets.eventId,
        journalEntryId: targets.journalEntryId,
        interpretation: stage.evidence,
        narrativeRole: role,
        source: 'ai',
        metadata: {
          detector: 'lexical',
          narrative_stage: stage.stage,
          cue: stage.cue,
          confidence: stage.confidence,
        },
      });
    } catch (err) {
      logger.debug({ err, userId, stage: stage.stage }, 'Narrative interpretation write skipped');
    }
  }
}

/**
 * Attach lexical narrative structure to a resolved event (additive metadata + interpretations).
 */
export async function persistNarrativeStructureForEvent(
  userId: string,
  eventId: string,
  text: string,
): Promise<NarrativeStructureAnalysis | null> {
  if (!text?.trim()) return null;

  const analysis = analyzeNarrativeStructure(text);
  if (analysis.stages.length === 0 && analysis.discourse.length === 0) return null;

  try {
    const { data: row } = await supabaseAdmin
      .from('resolved_events')
      .select('metadata')
      .eq('id', eventId)
      .eq('user_id', userId)
      .maybeSingle();

    const metadata = mergeMetadata(row?.metadata as Record<string, unknown>, analysis);
    await supabaseAdmin
      .from('resolved_events')
      .update({ metadata })
      .eq('id', eventId)
      .eq('user_id', userId);

    await writeInterpretations(userId, analysis, { eventId });
  } catch (err) {
    logger.warn({ err, userId, eventId }, 'persistNarrativeStructureForEvent failed (non-blocking)');
    return null;
  }

  return analysis;
}

/**
 * Attach lexical narrative structure to a journal entry (story slices / backward storytelling).
 */
export async function persistNarrativeStructureForJournalEntry(
  userId: string,
  journalEntryId: string,
  text: string,
): Promise<NarrativeStructureAnalysis | null> {
  if (!text?.trim()) return null;

  const analysis = analyzeNarrativeStructure(text);
  if (analysis.stages.length === 0 && analysis.discourse.length === 0) return null;

  try {
    await writeInterpretations(userId, analysis, { journalEntryId });
  } catch (err) {
    logger.warn({ err, userId, journalEntryId }, 'persistNarrativeStructureForJournalEntry failed');
    return null;
  }

  return analysis;
}

/**
 * When an event carries a lexical turning-point signal, upgrade arc_memberships.role
 * for any candidate that includes this event.
 */
export async function boostArcMembershipFromEvent(
  userId: string,
  eventId: string,
): Promise<void> {
  try {
    const { data: event } = await supabaseAdmin
      .from('resolved_events')
      .select('metadata')
      .eq('id', eventId)
      .eq('user_id', userId)
      .maybeSingle();

    const structure = (event?.metadata as Record<string, unknown> | undefined)?.narrative_structure as
      | { primary_arc_membership_role?: MembershipRole }
      | undefined;

    const lexicalRole = structure?.primary_arc_membership_role;
    if (!lexicalRole || lexicalRole === 'background') return;

    const { data: candidates } = await supabaseAdmin
      .from('event_candidates')
      .select('id')
      .eq('user_id', userId)
      .contains('source_event_ids', [eventId]);

    if (!candidates?.length) return;

    for (const candidate of candidates) {
      const { data: memberRows } = await supabaseAdmin
        .from('arc_memberships')
        .select('arc_id, role, metadata')
        .eq('user_id', userId)
        .eq('event_candidate_id', candidate.id);

      for (const row of memberRows ?? []) {
        const current = (row.role as MembershipRole | null) ?? 'background';
        if (ROLE_RANK[lexicalRole] <= ROLE_RANK[current]) continue;

        await arcMembershipService.set(userId, {
          arc_id: row.arc_id as string,
          event_candidate_id: candidate.id,
          role: lexicalRole,
          metadata: {
            ...((row.metadata as Record<string, unknown>) ?? {}),
            lexical_boost: true,
            source_event_id: eventId,
          },
        });
      }
    }
  } catch (err) {
    logger.debug({ err, userId, eventId }, 'boostArcMembershipFromEvent skipped');
  }
}

/** Read lexical arc role hint from resolved_event metadata (for arc membership suggestion). */
export function lexicalArcMembershipRoleFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): MembershipRole | null {
  const structure = metadata?.narrative_structure as
    | { primary_arc_membership_role?: MembershipRole }
    | undefined;
  return structure?.primary_arc_membership_role ?? null;
}
