/**
 * P5 consolidation protocol — unified audit for merge/archive/delete operations.
 */
import { correctionAuthority } from './provenance';
import type { ArtifactType } from './provenance/types';

export type ConsolidationAction = 'ENTITY_MERGE' | 'ENTITY_ARCHIVE' | 'ENTITY_DELETE';

export async function recordEntityConsolidation(params: {
  userId: string;
  action: ConsolidationAction;
  sourceArtifactType: ArtifactType;
  sourceArtifactId: string;
  targetArtifactId?: string;
  beforeState: unknown;
  afterState: unknown;
  rationale?: string;
}): Promise<void> {
  await correctionAuthority.recordSystemMutation({
    userId: params.userId,
    artifactType: params.sourceArtifactType,
    artifactId: params.sourceArtifactId,
    mutationType: params.action,
    beforeState: params.beforeState,
    afterState: {
      ...((params.afterState as Record<string, unknown>) ?? {}),
      ...(params.targetArtifactId ? { target_artifact_id: params.targetArtifactId } : {}),
    },
    rationale: params.rationale,
  });
}
