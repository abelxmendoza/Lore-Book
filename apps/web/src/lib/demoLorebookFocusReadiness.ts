import type { LorebookFocusEntity } from './lorebookCompile';
import type { LoreReadinessEvaluation, LoreReadinessLevel } from './loreReadiness';
import { mockDataService } from '../services/mockDataService';

function finishEvaluation(
  atomCount: number,
  entryCount: number,
): LoreReadinessEvaluation {
  const wordCount = atomCount * 180;
  const progress = Math.min(1, Math.min(atomCount / 6, entryCount / 3));
  const level: LoreReadinessLevel =
    progress >= 1 ? 'ready' : progress >= 0.45 ? 'building' : 'needs_more';
  return {
    label: 'Demo subject',
    level,
    progress,
    canGenerate: progress >= 1,
    atomCount,
    entryCount,
    wordCount,
    estimatedPages: Math.max(1, Math.floor(atomCount / 6)),
    atomsNeeded: Math.max(0, 6 - atomCount),
    entriesNeeded: Math.max(0, 3 - entryCount),
    gaps: [],
    dimensionScores: {
      volume: progress,
      diversity: progress,
      anchoring: progress,
      temporal: progress,
      evidence: progress,
    },
    suggestions: [],
  };
}

export function demoLorebookFocusReadiness(
  focusEntity: LorebookFocusEntity,
): LoreReadinessEvaluation | null {
  if (focusEntity.type === 'person') {
    const character = mockDataService.get.characters().find((item) => item.id === focusEntity.id);
    if (!character) return null;
    const atomCount = Math.max(
      1,
      character.memory_count ?? 0,
      character.shared_memories?.length ?? 0,
    );
    const entryCount = Math.max(
      1,
      character.direct_memory_count ?? 0,
      character.shared_memories?.length ?? 0,
    );
    return finishEvaluation(atomCount, entryCount);
  }

  if (focusEntity.type === 'place') {
    const location = mockDataService.get.locations().find((item) => item.id === focusEntity.id);
    if (!location) return null;
    const atomCount = Math.max(
      1,
      location.entries.length,
      location.mentionCount ?? 0,
      location.visitCount,
    );
    return finishEvaluation(atomCount, Math.max(1, location.entries.length));
  }

  if (focusEntity.type === 'skill') {
    const skill = mockDataService.get.skills().find((item) => item.id === focusEntity.id);
    if (!skill) return null;
    const atomCount = Math.max(1, skill.practice_count);
    return finishEvaluation(atomCount, Math.max(1, Math.ceil(skill.practice_count / 2)));
  }

  return null;
}
