// ============================================================================
// Relationship Ended Trigger
//
// Called when a romantic relationship transitions to status = 'ended'.
// This is the most significant crystallization event in the relationship
// intelligence system — a closed relationship has a complete evidence set.
//
// What this trigger does:
//   1. Creates a relationship arc in life_arcs (track = 'romance')
//   2. Crystallizes a 'relationship' knowledge claim (documented fact)
//   3. Queues a cross-relationship pattern analysis if >= 3 ended relationships exist
//
// What this trigger does NOT do:
//   - Crystallize lessons from a single relationship (requires 3+ relationships)
//   - Make judgments about why the relationship ended
//   - Generate identity claims (identity systems do not generate knowledge)
//
// Lesson and value crystallization happen in crossRelationshipAnalyzer.ts
// after enough relationships have ended to establish genuine patterns.
// ============================================================================

import { logger } from '../../logger';
import { buildAtomsForRelationshipId } from '../biographyGeneration/relationshipAtomBuilder';
import { arcService } from '../continuityRuntime/arcs/arcService';
import { supabaseAdmin } from '../supabaseClient';

import { upsertClaim } from './claimLifecycleManager';
import type { ConfidenceBreakdown } from './types';

// Emotional arc mapping from relationship data
function deriveEmotionalArc(
  breakupType: string | null,
  closureLevel: number | null
): 'building' | 'climax' | 'resolution' | 'grief' | 'recovery' | 'neutral' {
  if (!breakupType) return 'neutral';
  if (['mutual', 'incompatibility'].includes(breakupType)) {
    return (closureLevel ?? 0) >= 0.6 ? 'resolution' : 'neutral';
  }
  if (['ghosted', 'they_initiated', 'cheating'].includes(breakupType)) {
    return (closureLevel ?? 0) < 0.5 ? 'grief' : 'recovery';
  }
  if (breakupType === 'faded_away') return 'neutral';
  return 'resolution';
}

// Duration in months from start_date to end_date
function durationMonths(startDate: string | null, endDate: string | null): number {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const end   = endDate ? new Date(endDate) : new Date();
  return Math.round((end.getTime() - start.getTime()) / (30 * 24 * 60 * 60 * 1000));
}

// ─── Main trigger ─────────────────────────────────────────────────────────────

export async function onRelationshipEnded(
  userId: string,
  relationshipId: string
): Promise<void> {
  try {
    // Load full relationship record
    const { data: rel } = await supabaseAdmin
      .from('romantic_relationships')
      .select('*')
      .eq('id', relationshipId)
      .eq('user_id', userId)
      .single();

    if (!rel) {
      logger.warn({ userId, relationshipId }, 'relationshipEndedTrigger: relationship not found');
      return;
    }

    // Resolve partner name
    let partnerName = 'Unknown';
    if (rel.person_type === 'character') {
      const { data: char } = await supabaseAdmin
        .from('characters').select('name').eq('id', rel.person_id).single();
      partnerName = char?.name ?? 'Unknown';
    } else {
      const { data: entity } = await supabaseAdmin
        .from('omega_entities').select('primary_name').eq('id', rel.person_id).single();
      partnerName = entity?.primary_name ?? 'Unknown';
    }

    // Load breakup data for arc emotional classification
    const { data: breakup } = await supabaseAdmin
      .from('relationship_breakups')
      .select('breakup_type, closure_level, breakup_date')
      .eq('relationship_id', relationshipId)
      .eq('user_id', userId)
      .order('breakup_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const months      = durationMonths(rel.start_date, rel.end_date ?? breakup?.breakup_date ?? null);
    const emotionalArc = deriveEmotionalArc(
      breakup?.breakup_type ?? null,
      breakup?.closure_level ?? null
    );

    // ── 1. Create relationship life arc ─────────────────────────────────────
    // Only create if the relationship lasted long enough to be arc-worthy
    const MIN_ARC_DURATION_MONTHS = 2;
    if (months >= MIN_ARC_DURATION_MONTHS) {
      const arcTitle = months >= 12
        ? `${partnerName} (${new Date(rel.start_date ?? Date.now()).getFullYear()}–${new Date(rel.end_date ?? Date.now()).getFullYear()})`
        : `With ${partnerName}`;

      const arcConfidence = Math.min(0.90,
        0.50
        + (rel.affection_score ?? 0.5) * 0.20
        + Math.min(months / 24, 1) * 0.20
        + ((rel.relationship_health ?? 0.5) * 0.10)
      );

      await arcService.upsert(userId, {
        title:           arcTitle,
        arc_type:        'custom',
        track:           'romance',
        dominant_emotion: breakup?.breakup_type === 'ghosted' ? 'confusion'
                        : emotionalArc === 'grief' ? 'grief'
                        : emotionalArc === 'resolution' ? 'acceptance'
                        : 'love',
        emotional_arc:   emotionalArc,
        start_date:      rel.start_date ?? undefined,
        end_date:        rel.end_date ?? breakup?.breakup_date ?? undefined,
        is_active:       false,
        summary:         null,
        confidence:      arcConfidence,
        source:          'inferred',
        tags:            [rel.relationship_type, 'romantic'],
        metadata:        { romantic_relationship_id: relationshipId, partner_name: partnerName },
      });

      logger.info({ userId, relationshipId, partnerName, months }, 'relationshipEndedTrigger: arc created');
    }

    // ── 2. Crystallize the 'relationship' knowledge claim ───────────────────
    // This documents the relationship as a biographical fact.
    // Threshold: affection_score >= 0.50 AND duration >= 90 days.
    const MIN_AFFECTION   = 0.50;
    const MIN_DAYS        = 90;
    const durationDays    = months * 30;

    if ((rel.affection_score ?? 0) >= MIN_AFFECTION && durationDays >= MIN_DAYS) {
      const startLabel = rel.start_date
        ? new Date(rel.start_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : 'an unknown date';
      const endLabel = rel.end_date
        ? new Date(rel.end_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : 'recently';

      const machineClaim    = `relationship:${partnerName.toLowerCase().replace(/\s+/g, '_')}_${rel.relationship_type}`;
      const humanReadable   = `You were in a ${rel.relationship_type} relationship with ${partnerName} from ${startLabel} to ${endLabel} (${months} months).`;

      const breakdown: ConfidenceBreakdown = {
        base_evidence:        Math.min(0.80, (rel.affection_score ?? 0.5) + Math.min(durationDays / 730, 0.30)),
        temporal_stability:   Math.min(1.0, durationDays / 365),
        cross_context:        0.60,  // Single relationship — no cross-context bonus
        recency_factor:       0.85,  // Just ended
        contradiction_penalty: 0,
        final:                0,
        computed_at:          new Date().toISOString(),
      };
      breakdown.final = Math.min(0.90, Math.max(0.40,
        breakdown.base_evidence * breakdown.temporal_stability * breakdown.cross_context * breakdown.recency_factor
      ));

      await upsertClaim(
        userId,
        {
          machine_claim:        machineClaim,
          human_readable_claim: humanReadable,
          knowledge_type:       'relationship',
          status:               'HISTORICAL',  // Ended relationship → immediately HISTORICAL
          confidence:           breakdown.final,
          confidence_breakdown: breakdown,
          trigger_type:         'arc_close',
          trigger_id:           relationshipId,
          first_evidenced_at:   rel.start_date ?? null,
          last_reinforced_at:   rel.end_date ?? new Date().toISOString(),
          arc_close_eligible:   true,
        },
        [
          {
            evidence_type: 'romantic_relationship',
            evidence_id:   relationshipId,
            raw_weight:    0.60,
            summary:       `${rel.relationship_type} relationship with ${partnerName} (${months} months, affection: ${Math.round((rel.affection_score ?? 0.5) * 100)}%)`,
            event_date:    rel.end_date ?? rel.start_date ?? null,
            arc_id:        null,
          },
        ]
      );

      logger.info({ userId, relationshipId, partnerName }, 'relationshipEndedTrigger: relationship claim crystallized');
    }

    // ── 3. Build relationship atoms for biography pool ───────────────────────
    // Fire-and-forget — the biography engine uses these on next generation
    buildAtomsForRelationshipId(userId, relationshipId).catch(err =>
      logger.debug({ err, relationshipId }, 'relationshipEndedTrigger: atom build failed (non-blocking)')
    );

    // ── 4. Check if cross-relationship pattern analysis should run ────────────
    const { count } = await supabaseAdmin
      .from('romantic_relationships')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'ended');

    if (typeof count === 'number' && count >= 3) {
      // Import lazily to avoid circular dependency
      import('./crossRelationshipAnalyzer')
        .then(({ analyzeCrossRelationshipPatterns }) =>
          analyzeCrossRelationshipPatterns(userId)
        )
        .catch(err => logger.debug({ err, userId }, 'Cross-relationship analysis failed (non-blocking)'));
    }
  } catch (err) {
    logger.error({ err, userId, relationshipId }, 'relationshipEndedTrigger: failed');
  }
}
