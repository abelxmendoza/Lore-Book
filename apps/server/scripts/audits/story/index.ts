import { runStoryAwareChatAudit } from './storyAwareChat';
import { runLifeArcSynthesisAudit } from './lifeArcSynthesis';
import { runLifeStoryApiAudit } from './lifeStoryApi';
import { runLifeReconstructionAudit } from './lifeReconstruction';
import { runLifeReconstructionScoreAudit } from './lifeReconstructionScore';

export type StoryCheck = 'story-chat' | 'arcs' | 'life-story-api' | 'reconstruction' | 'scorecard';

const CHECKS: Record<StoryCheck, (argv: string[]) => Promise<void>> = {
  'story-chat': () => runStoryAwareChatAudit(),
  arcs: (argv) => runLifeArcSynthesisAudit(argv),
  'life-story-api': () => runLifeStoryApiAudit(),
  reconstruction: (argv) => runLifeReconstructionAudit(argv),
  scorecard: (argv) => runLifeReconstructionScoreAudit(argv),
};

export async function runStorySuite(checks?: StoryCheck[], argv: string[] = []): Promise<void> {
  const selected = checks?.length ? checks : (Object.keys(CHECKS) as StoryCheck[]);
  for (const check of selected) {
    console.error(`\n>>> Story check: ${check}\n`);
    await CHECKS[check](argv);
  }
}

export {
  runStoryAwareChatAudit,
  runLifeArcSynthesisAudit,
  runLifeStoryApiAudit,
  runLifeReconstructionAudit,
  runLifeReconstructionScoreAudit,
};
