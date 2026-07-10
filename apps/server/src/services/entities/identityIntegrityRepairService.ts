import { correctionAuthority } from '../provenance/CorrectionAuthority';
import { incrementEntityResolutionMetric } from './entityResolutionMetrics';
import type { IdentityIntegrityFinding } from './identityIntegrityScanner';

export type IdentityRepairPlan = {
  findingId: string;
  userId: string;
  dryRun: boolean;
  action: 'SUPERSEDE_MISLABELED_MUTATION' | 'SEPARATE_ENTITIES' | 'MANUAL_REVIEW';
  deterministic: boolean;
  mutations: Array<{ type: string; artifactId: string; before: unknown; after: unknown }>;
  warnings: string[];
};

export function previewIdentityIntegrityRepair(userId: string, finding: IdentityIntegrityFinding): IdentityRepairPlan {
  if (!userId || finding.userId !== userId) throw new Error('Repair finding is outside the explicit user scope');
  const relationshipMislabeled = finding.findingType === 'RELATIONSHIP_AS_IDENTITY_MERGE';
  const plan: IdentityRepairPlan = {
    findingId: finding.findingId,
    userId,
    dryRun: true,
    action: relationshipMislabeled
      ? 'SUPERSEDE_MISLABELED_MUTATION'
      : finding.findingType === 'CROSS_TYPE_IDENTITY_MERGE' ? 'SEPARATE_ENTITIES' : 'MANUAL_REVIEW',
    deterministic: relationshipMislabeled && finding.repairableAutomatically,
    mutations: relationshipMislabeled && finding.sourceEntityId
      ? [{
          type: 'IDENTITY_INTEGRITY_CORRECTION', artifactId: finding.sourceEntityId,
          before: { mutation_ids: finding.mutationIds, classification: 'ENTITY_MERGE' },
          after: { classification: 'RELATIONSHIP_CREATED', supersedes: finding.mutationIds, derived_state_invalidated: true },
        }]
      : [],
    warnings: relationshipMislabeled
      ? ['The original append-only event is preserved; this correction supersedes its display semantics.']
      : ['No automatic mutation is allowed. Review provenance and choose or create the correct identity.'],
  };
  incrementEntityResolutionMetric(plan.deterministic ? 'repairs_proposed' : 'repairs_requiring_review');
  return plan;
}

export async function executeIdentityIntegrityRepair(userId: string, finding: IdentityIntegrityFinding): Promise<IdentityRepairPlan> {
  const plan = previewIdentityIntegrityRepair(userId, finding);
  if (!plan.deterministic) throw new Error('Identity repair requires review and cannot be executed automatically');
  for (const mutation of plan.mutations) {
    await correctionAuthority.recordSystemMutation({
      userId,
      artifactType: 'entity',
      artifactId: mutation.artifactId,
      mutationType: mutation.type,
      beforeState: mutation.before,
      afterState: mutation.after,
      rationale: `Identity integrity repair ${finding.findingId}: ${finding.explanation}`,
    });
  }
  incrementEntityResolutionMetric('repairs_executed');
  return { ...plan, dryRun: false };
}
