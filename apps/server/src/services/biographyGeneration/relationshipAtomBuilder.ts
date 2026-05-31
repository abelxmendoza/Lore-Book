// ============================================================================
// Relationship Atom Builder
//
// Converts romantic relationship data into NarrativeAtoms for the biography
// generation engine. This is the bridge that makes relationships appear
// naturally in generated biographies and memoirs.
//
// Sources → Atoms:
//   romantic_dates      → high-significance relationship_moment atoms (milestones)
//   romantic_interactions → lower-significance atoms (texture and rhythm)
//   relationship_cycles → pattern atoms (recurring dynamics)
//   relationship_breakups → turning_point atoms (endings)
//
// The biography engine receives these atoms alongside journal-entry atoms and
// clusters them into chapters by timestamp. A user's biography of 2022 will
// naturally include their relationship milestones from that year.
// ============================================================================

import { v4 as uuid } from 'uuid';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { NarrativeAtom, Domain } from './types';

// Significance by milestone type — milestones dominate chapter narratives
const MILESTONE_SIGNIFICANCE: Record<string, number> = {
  first_meeting:        0.70,
  first_date:           0.80,
  first_kiss:           0.75,
  first_i_love_you:     0.90,
  first_sleepover:      0.65,
  moving_in:            0.85,
  engagement:           0.95,
  marriage:             0.95,
  meeting_family:       0.70,
  meeting_friends:      0.60,
  first_fight:          0.65,
  makeup:               0.55,
  milestone:            0.60,
  anniversary:          0.70,
  breakup:              0.95,
  special_date:         0.60,
};

// Significance by interaction type — interactions add texture, not structure
const INTERACTION_SIGNIFICANCE: Record<string, number> = {
  date:         0.45,
  conflict:     0.55,
  intimate:     0.40,
  celebration:  0.50,
  support:      0.40,
  call:         0.20,
  text:         0.15,
  meetup:       0.30,
  video_call:   0.20,
  sleepover:    0.35,
  gift:         0.40,
  other:        0.20,
};

// ─── Partner name resolution ──────────────────────────────────────────────────

async function resolvePartnerName(
  userId: string,
  personId: string,
  personType: string
): Promise<string> {
  if (personType === 'character') {
    const { data } = await supabaseAdmin
      .from('characters').select('name').eq('id', personId).eq('user_id', userId).single();
    return data?.name ?? 'Unknown';
  }
  const { data } = await supabaseAdmin
    .from('omega_entities').select('primary_name').eq('id', personId).eq('user_id', userId).single();
  return data?.primary_name ?? 'Unknown';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build NarrativeAtoms for all of a user's romantic relationships.
 * Called by the biography engine's atom pool construction.
 */
export async function buildRelationshipAtoms(userId: string): Promise<NarrativeAtom[]> {
  try {
    const atoms: NarrativeAtom[] = [];

    // Load all relationships with enough confidence to appear in biography
    const { data: relationships } = await supabaseAdmin
      .from('romantic_relationships')
      .select('id, person_id, person_type, relationship_type, affection_score, start_date, end_date, status')
      .eq('user_id', userId)
      .gte('affection_score', 0.40);  // Only relationships with meaningful emotional investment

    if (!relationships || relationships.length === 0) return [];

    for (const rel of relationships) {
      const partnerName = await resolvePartnerName(userId, rel.person_id, rel.person_type);
      const relAtoms = await buildAtomsForRelationship(userId, rel, partnerName);
      atoms.push(...relAtoms);
    }

    return atoms;
  } catch (err) {
    logger.error({ err, userId }, 'relationshipAtomBuilder: failed to build atoms');
    return [];
  }
}

/**
 * Build atoms for a single relationship. Used when a relationship ends
 * to update the biography atom pool incrementally.
 */
export async function buildAtomsForRelationshipId(
  userId: string,
  relationshipId: string
): Promise<NarrativeAtom[]> {
  try {
    const { data: rel } = await supabaseAdmin
      .from('romantic_relationships')
      .select('id, person_id, person_type, relationship_type, affection_score, start_date, end_date, status')
      .eq('id', relationshipId)
      .eq('user_id', userId)
      .single();

    if (!rel) return [];

    const partnerName = await resolvePartnerName(userId, rel.person_id, rel.person_type);
    return buildAtomsForRelationship(userId, rel, partnerName);
  } catch (err) {
    logger.error({ err, userId, relationshipId }, 'relationshipAtomBuilder: single relationship build failed');
    return [];
  }
}

// ─── Core builder ─────────────────────────────────────────────────────────────

async function buildAtomsForRelationship(
  userId: string,
  rel: any,
  partnerName: string
): Promise<NarrativeAtom[]> {
  const atoms: NarrativeAtom[] = [];
  const domains: Domain[] = ['romance', 'relationships'];
  const personIds = [rel.person_id];

  // ── 1. Milestone atoms (from romantic_dates) ─────────────────────────────
  const { data: dates } = await supabaseAdmin
    .from('romantic_dates')
    .select('id, date_type, date_time, description, sentiment, was_positive')
    .eq('relationship_id', rel.id)
    .order('date_time', { ascending: true });

  for (const event of dates ?? []) {
    const significance = MILESTONE_SIGNIFICANCE[event.date_type] ?? 0.55;
    const label = event.date_type.replace(/_/g, ' ');
    const content = event.description
      ? `${label} with ${partnerName}: ${event.description.substring(0, 150)}`
      : `${label} with ${partnerName}`;

    atoms.push({
      id:              uuid(),
      type:            event.date_type === 'breakup' ? 'turning_point' : 'relationship_moment',
      timestamp:       event.date_time,
      domains,
      emotionalWeight: Math.abs(event.sentiment ?? 0.5),
      sensitivity:     event.date_type === 'breakup' ? 0.7 : 0.4,
      significance,
      peopleIds:       personIds,
      tags:            [event.date_type, rel.relationship_type],
      content,
      timelineIds:     [],
      sourceRefs:      [event.id],
      metadata:        {
        relationship_id:  rel.id,
        partner_name:     partnerName,
        milestone_type:   event.date_type,
        was_positive:     event.was_positive,
      },
    });
  }

  // ── 2. Interaction texture atoms (from romantic_interactions) ─────────────
  // Only include interactions with meaningful sentiment or type — not every text
  const { data: interactions } = await supabaseAdmin
    .from('romantic_interactions')
    .select('id, interaction_type, interaction_date, sentiment, was_positive, description')
    .eq('relationship_id', rel.id)
    .or('interaction_type.in.(date,conflict,intimate,celebration,support),sentiment.gte.0.4,sentiment.lte.-0.4')
    .order('interaction_date', { ascending: true })
    .limit(50);  // Cap — interactions add texture, not structure

  for (const i of interactions ?? []) {
    const significance = INTERACTION_SIGNIFICANCE[i.interaction_type] ?? 0.25;
    if (significance < 0.30 && Math.abs(i.sentiment ?? 0) < 0.4) continue; // Skip low-signal

    const typeLabel = i.interaction_type.replace(/_/g, ' ');
    const toneWord  = (i.sentiment ?? 0) > 0.3 ? 'positive' : (i.sentiment ?? 0) < -0.3 ? 'difficult' : '';
    const content   = i.description
      ? `${typeLabel} with ${partnerName}${toneWord ? ` (${toneWord})` : ''}: ${i.description.substring(0, 120)}`
      : `${typeLabel} with ${partnerName}${toneWord ? ` (${toneWord})` : ''}`;

    atoms.push({
      id:              uuid(),
      type:            i.interaction_type === 'conflict' ? 'conflict' : 'relationship_moment',
      timestamp:       i.interaction_date,
      domains,
      emotionalWeight: Math.abs(i.sentiment ?? 0.3),
      sensitivity:     i.interaction_type === 'intimate' ? 0.8 : 0.3,
      significance,
      peopleIds:       personIds,
      tags:            [i.interaction_type, rel.relationship_type],
      content,
      timelineIds:     [],
      sourceRefs:      [i.id],
      metadata:        {
        relationship_id:  rel.id,
        partner_name:     partnerName,
        interaction_type: i.interaction_type,
        sentiment:        i.sentiment,
      },
    });
  }

  // ── 3. Pattern atoms (from relationship_cycles with high strength) ─────────
  const { data: cycles } = await supabaseAdmin
    .from('relationship_cycles')
    .select('id, cycle_type, cycle_strength, pattern_description, first_detected_at')
    .eq('relationship_id', rel.id)
    .gte('cycle_strength', 0.65)
    .order('first_detected_at', { ascending: true });

  for (const cycle of cycles ?? []) {
    if (!cycle.first_detected_at) continue;
    const isNegative = ['toxic_pattern', 'negative_loop', 'on_again_off_again'].includes(cycle.cycle_type);
    const label = cycle.cycle_type.replace(/_/g, '-');

    atoms.push({
      id:              uuid(),
      type:            'reflection',
      timestamp:       cycle.first_detected_at,
      domains,
      emotionalWeight: cycle.cycle_strength,
      sensitivity:     isNegative ? 0.6 : 0.3,
      significance:    0.50,
      peopleIds:       personIds,
      tags:            [cycle.cycle_type, 'pattern', rel.relationship_type],
      content:         `Pattern with ${partnerName}: ${label} — ${cycle.pattern_description ?? ''}`,
      timelineIds:     [],
      sourceRefs:      [cycle.id],
      metadata:        {
        relationship_id: rel.id,
        partner_name:    partnerName,
        cycle_type:      cycle.cycle_type,
        is_negative:     isNegative,
      },
    });
  }

  // ── 4. Breakup atom (from relationship_breakups) ───────────────────────────
  const { data: breakup } = await supabaseAdmin
    .from('relationship_breakups')
    .select('id, breakup_date, breakup_type, reason, closure_level, recovery_status')
    .eq('relationship_id', rel.id)
    .eq('user_id', userId)
    .order('breakup_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (breakup?.breakup_date) {
    const typeLabel = breakup.breakup_type?.replace(/_/g, ' ') ?? 'ended';
    const closure   = breakup.closure_level != null
      ? ` Closure: ${Math.round(breakup.closure_level * 100)}%.`
      : '';

    atoms.push({
      id:              uuid(),
      type:            'turning_point',
      timestamp:       breakup.breakup_date,
      domains,
      emotionalWeight: 0.85,
      sensitivity:     0.75,
      significance:    0.90,
      peopleIds:       personIds,
      tags:            ['breakup', breakup.breakup_type ?? 'ended', rel.relationship_type],
      content:         `Relationship with ${partnerName} ended (${typeLabel}).${closure}${breakup.reason ? ` ${breakup.reason.substring(0, 100)}` : ''}`,
      timelineIds:     [],
      sourceRefs:      [breakup.id],
      metadata:        {
        relationship_id:  rel.id,
        partner_name:     partnerName,
        breakup_type:     breakup.breakup_type,
        closure_level:    breakup.closure_level,
        recovery_status:  breakup.recovery_status,
      },
    });
  }

  return atoms;
}
