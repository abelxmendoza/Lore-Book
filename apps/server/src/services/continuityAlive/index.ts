export * from './types';
export { selectContinuity, buildCompositionGuidance, formatContinuityPromptBlock } from './selectContinuity';
export { scoreMemory, whySelected } from './relevanceModel';
export { inferSensitivity, sensitivityGate } from './sensitiveMemory';
export { CONTINUITY_COMPOSITION_RULES } from './composition';
export { CONTINUITY_SCENARIOS } from './fixtures/scenarios';
export {
  runContinuityBenchmark,
  evaluateScenario,
  formatBenchmarkReport,
  type ContinuityBenchmarkReport,
} from './scoreBenchmark';

import {
  listActiveMeaningForUser,
  type MeaningArtifactRow,
} from '../memoryQuality/meaningArtifactStore';
import type { ContinuityMemoryInput, ContinuitySelectionResult } from './types';
import { selectContinuity } from './selectContinuity';

/**
 * Load meaning artifacts + optional extra memories, run continuity selection
 * for the current chat message. Non-throwing for chat path.
 */
export async function selectContinuityForUser(opts: {
  userId: string;
  message: string;
  extraMemories?: ContinuityMemoryInput[];
  resolvedEntities?: string[];
}): Promise<ContinuitySelectionResult> {
  const extras = opts.extraMemories ?? [];
  let meaningMemories: ContinuityMemoryInput[] = [];
  try {
    const rows = await listActiveMeaningForUser(opts.userId, { limit: 24 });
    meaningMemories = rows.map((r) => {
      const row = r as MeaningArtifactRow & {
        linked_from_value?: string | null;
        linked_to_value?: string | null;
        created_at?: string;
        updated_at?: string;
        evidence_ids?: string[];
      };
      return {
        memoryId: row.id,
        memoryType:
          row.meaning_type === 'lesson'
            ? ('lesson' as const)
            : row.meaning_type === 'preference'
              ? ('preference' as const)
              : ('meaning' as const),
        summary: row.display_label,
        entities: [row.linked_from_value, row.linked_to_value].filter(
          (x): x is string => Boolean(x),
        ),
        eventTime: row.updated_at ?? row.created_at ?? null,
        evidenceIds: row.evidence_ids ?? [],
        confidence: row.confidence,
        epistemicType: row.epistemic_type,
        correctionState:
          row.status === 'USER_CORRECTED' || row.epistemic_type === 'user_corrected'
            ? ('user_corrected' as const)
            : ('active' as const),
        source: 'autobiographical_meaning_artifacts',
        tags: [row.meaning_type],
      };
    });
  } catch {
    meaningMemories = [];
  }

  return selectContinuity({
    currentMessage: opts.message,
    memories: [...meaningMemories, ...extras],
    resolvedEntities: opts.resolvedEntities,
  });
}
