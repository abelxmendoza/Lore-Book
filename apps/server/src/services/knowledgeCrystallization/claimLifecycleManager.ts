// ============================================================================
// Claim Lifecycle Manager
//
// All writes to crystallized_knowledge and knowledge_evidence_links happen here.
// No other file writes to these tables.
//
// Invariants:
//   - Claims are never deleted. State transitions only.
//   - HISTORICAL and SUPERSEDED claims are permanent archival records.
//   - The supersedence chain (superseded_by_id) must always be maintained.
//   - upsertClaim uses ON CONFLICT on the dedup index — a reinforce of an
//     existing claim updates it rather than creating a duplicate.
// ============================================================================

import { logger } from '../../logger';
import { ingestCrystallizedKnowledge } from '../narrativeSpine/narrativeSpineIngestion';
import { supabaseAdmin } from '../supabaseClient';
import type {
  UpsertClaimPayload,
  CrystallizedKnowledge,
  EvidenceBundleItem,
  ClaimStatus,
} from './types';

// ─── Upsert a claim and its evidence links ────────────────────────────────────
//
// The dedup index is: (user_id, knowledge_type, machine_claim) WHERE status
// NOT IN ('HISTORICAL', 'SUPERSEDED'). So this upsert will:
//   - Insert a new claim if none exists for this user/type/machine_claim
//   - Update the existing ACTIVE/DORMANT claim if one already exists
//     (reinforcing confidence, recency, and adding new evidence links)

export async function upsertClaim(
  userId: string,
  payload: UpsertClaimPayload,
  evidenceItems: EvidenceBundleItem[]
): Promise<CrystallizedKnowledge | null> {
  const { data: claim, error } = await supabaseAdmin
    .from('crystallized_knowledge')
    .upsert(
      {
        user_id:               userId,
        machine_claim:         payload.machine_claim,
        human_readable_claim:  payload.human_readable_claim,
        knowledge_type:        payload.knowledge_type,
        status:                payload.status,
        confidence:            payload.confidence,
        confidence_breakdown:  payload.confidence_breakdown as unknown as Record<string, unknown>,
        trigger_type:          payload.trigger_type,
        trigger_id:            payload.trigger_id,
        first_evidenced_at:    payload.first_evidenced_at,
        last_reinforced_at:    payload.last_reinforced_at ?? new Date().toISOString(),
        arc_close_eligible:    payload.arc_close_eligible ?? false,
        crystallize_after:     payload.crystallize_after ?? null,
        biography_eligible:    false,
        principle_eligible:    false,
      },
      {
        onConflict: 'user_id,knowledge_type,machine_claim',
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (error || !claim) {
    logger.error({ error, userId, machine_claim: payload.machine_claim }, 'claimLifecycleManager: upsert failed');
    return null;
  }

  // Write evidence links — delete existing links for this claim first to avoid
  // accumulating stale links on reinforce. The current bundle is always authoritative.
  await supabaseAdmin
    .from('knowledge_evidence_links')
    .delete()
    .eq('knowledge_id', claim.id)
    .eq('user_id', userId);

  if (evidenceItems.length > 0) {
    const { error: linkError } = await supabaseAdmin
      .from('knowledge_evidence_links')
      .insert(
        evidenceItems.map(item => ({
          knowledge_id:     claim.id,
          user_id:          userId,
          evidence_type:    item.evidence_type,
          evidence_id:      item.evidence_id,
          evidence_weight:  item.raw_weight,
          evidence_summary: item.summary,
        }))
      );

    if (linkError) {
      logger.error({ linkError, knowledgeId: claim.id }, 'claimLifecycleManager: evidence links write failed');
      // Non-fatal — the claim exists, evidence links will be repaired on next reinforce
    }
  }

  logger.info(
    { userId, knowledgeId: claim.id, machine_claim: payload.machine_claim, confidence: payload.confidence },
    'claimLifecycleManager: claim upserted'
  );

  ingestCrystallizedKnowledge(userId, claim.id);

  return claim as CrystallizedKnowledge;
}

// ─── Transition to HISTORICAL ─────────────────────────────────────────────────
//
// Called when:
//   - A life arc closes (the claim belonged to that arc period)
//   - A user explicitly supersedes the claim
//   - A correction directly invalidates the claim
//
// The claim is never deleted. HISTORICAL is the terminal archival state for
// claims that were true and are now past.

export async function transitionToHistorical(
  userId: string,
  knowledgeId: string,
  reason: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('crystallized_knowledge')
    .update({
      status: 'HISTORICAL' as ClaimStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', knowledgeId)
    .eq('user_id', userId)
    .in('status', ['ACTIVE', 'DORMANT']);

  if (error) {
    logger.error({ error, userId, knowledgeId, reason }, 'claimLifecycleManager: transitionToHistorical failed');
    return;
  }

  logger.info({ userId, knowledgeId, reason }, 'claimLifecycleManager: claim transitioned to HISTORICAL');
}

// ─── Transition to SUPERSEDED ─────────────────────────────────────────────────
//
// Called when a newer, stronger claim replaces an existing one on the same subject.
// Maintains the supersedence chain by writing superseded_by_id on the old claim.
// Example: "You're learning guitar" (2022) superseded by "You play guitar" (2024).

export async function transitionToSuperseded(
  userId: string,
  oldKnowledgeId: string,
  newKnowledgeId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('crystallized_knowledge')
    .update({
      status:           'SUPERSEDED' as ClaimStatus,
      superseded_by_id: newKnowledgeId,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', oldKnowledgeId)
    .eq('user_id', userId);

  if (error) {
    logger.error({ error, userId, oldKnowledgeId, newKnowledgeId }, 'claimLifecycleManager: transitionToSuperseded failed');
    return;
  }

  logger.info({ userId, oldKnowledgeId, newKnowledgeId }, 'claimLifecycleManager: claim superseded');
}

// ─── Reinforce (update recency + confidence on an existing ACTIVE claim) ──────
//
// Called when a pattern threshold is crossed again for a claim that already
// exists. Updates confidence and last_reinforced_at without changing the claim text.

export async function reinforceClaim(
  userId: string,
  knowledgeId: string,
  newConfidence: number,
  newBreakdown: Record<string, unknown>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('crystallized_knowledge')
    .update({
      confidence:           newConfidence,
      confidence_breakdown: newBreakdown,
      last_reinforced_at:   new Date().toISOString(),
      status:               'ACTIVE' as ClaimStatus, // Reactivates if DORMANT
      updated_at:           new Date().toISOString(),
    })
    .eq('id', knowledgeId)
    .eq('user_id', userId)
    .in('status', ['ACTIVE', 'DORMANT']);

  if (error) {
    logger.error({ error, userId, knowledgeId }, 'claimLifecycleManager: reinforce failed');
  }
}

// ─── Get existing claim by machine key ────────────────────────────────────────
//
// Used by crystallizationService to check whether a claim already exists
// before deciding to upsert vs. reinforce vs. create new.

export async function findActiveClaim(
  userId: string,
  knowledgeType: string,
  machineClaim: string
): Promise<CrystallizedKnowledge | null> {
  const { data } = await supabaseAdmin
    .from('crystallized_knowledge')
    .select('*')
    .eq('user_id', userId)
    .eq('knowledge_type', knowledgeType)
    .eq('machine_claim', machineClaim)
    .not('status', 'in', '("HISTORICAL","SUPERSEDED")')
    .maybeSingle();

  return data as CrystallizedKnowledge | null;
}
