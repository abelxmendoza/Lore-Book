/**
 * User corrections for autobiographical meaning artifacts.
 */
import { correctMeaningArtifact, type CorrectionAction } from './meaningArtifactStore';

export type { CorrectionAction };

export async function applyMeaningCorrection(params: {
  userId: string;
  artifactId: string;
  action: CorrectionAction;
  rationale?: string;
}): Promise<{ ok: boolean; artifactId: string }> {
  return correctMeaningArtifact(params);
}
