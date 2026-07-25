import { beliefCognitionEngine } from '../beliefCognitionEngine';
import type {
  BeliefMigrationDecision,
  BeliefQueueAuditRecord,
} from '../beliefTypes';
import { supabaseAdmin } from '../../supabaseClient';

export async function auditBeliefQueue(userId: string): Promise<BeliefQueueAuditRecord[]> {
  const { data, error } = await supabaseAdmin
    .from('memory_proposals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const originalText = String(row.claim_text ?? '');
    const sourceText = String(row.source_excerpt ?? originalText);
    const cognition = beliefCognitionEngine.evaluate({
      userId,
      claimText: originalText,
      sourceText,
      entityId: row.entity_id,
      storyGroupLabel: String(meta.group_label ?? ''),
      evidenceIds: Array.isArray(meta.source_evidence_ids)
        ? (meta.source_evidence_ids as string[])
        : [],
      extractionConfidence: Number(row.confidence ?? 0.6),
      metadata: meta,
    });

    const migrationDecision = decideMigration(cognition.decision, cognition.routingTarget, cognition.speechAct);
    const removedStoryGroup = cognition.diagnostic.rejectedSubjectCandidates.find(
      (c) => c.reason.includes('story_group'),
    )?.label;

    return {
      proposalId: row.id,
      originalText,
      speechAct: cognition.speechAct,
      compiledProposition: cognition.proposition,
      originalKind: String(meta.proposal_kind ?? 'unknown'),
      proposedDomain: cognition.proposition.domain,
      proposedDurability: cognition.proposition.durability,
      routingTarget: cognition.routingTarget,
      migrationDecision,
      existingMatchIds: cognition.correctionTarget.candidateBeliefIds,
      duplicateIds: [],
      contradictionIds: [],
      correctionTargetIds: cognition.correctionTarget.selectedBeliefId
        ? [cognition.correctionTarget.selectedBeliefId]
        : [],
      removedStoryGroupSubject: removedStoryGroup,
      repairedSubject: cognition.proposition.subject.displayName,
      sensitivity: cognition.sensitivity,
      warnings: cognition.diagnostic.warnings,
      proposedMutation: cognition.mutationPlan,
      confidence: cognition.proposition.confidenceBreakdown.overallEligibilityConfidence,
    };
  });
}

function decideMigration(
  decision: string,
  routing: string,
  speechAct: string,
): BeliefMigrationDecision {
  if (decision === 'REJECT' || speechAct === 'COMMAND' || speechAct === 'QUESTION' || speechAct === 'SYSTEM_FEEDBACK') {
    return 'ARCHIVE_INVALID';
  }
  if (routing === 'EVENT') return 'ROUTE_TO_EVENT';
  if (routing === 'TEMPORAL_STATE') return 'ROUTE_TO_TEMPORAL_STATE';
  if (routing === 'PLAN') return 'ROUTE_TO_PLAN';
  if (routing === 'PROJECT_GOAL') return 'ROUTE_TO_PROJECT_GOAL';
  if (routing === 'PROJECT_REQUIREMENT') return 'ROUTE_TO_PRODUCT_REQUIREMENT';
  if (routing === 'UI_PREFERENCE') return 'ROUTE_TO_UI_PREFERENCE';
  if (routing === 'ASSISTANT_FEEDBACK') return 'ROUTE_TO_ASSISTANT_FEEDBACK';
  if (decision === 'ADD_NEGATIVE_CONSTRAINT') return 'ADD_NEGATIVE_CONSTRAINT';
  if (decision === 'SUPERSEDE') return 'RESOLVE_CORRECTION_TARGET';
  if (decision === 'ADD_EVIDENCE') return 'MERGE_DUPLICATE';
  return 'RECOMPILE';
}
