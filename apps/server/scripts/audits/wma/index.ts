/**
 * WMA / chat-memory audit suite aggregator.
 */
import { runMemoryUtilizationAudit } from './memoryUtilization';
import { runQueryClassificationAudit } from './queryClassification';
import { runGoalsActivationAudit } from './goalsActivation';
import { runValidateRecallAudit } from './validateRecall';

export type WmaCheck = 'memory' | 'classification' | 'goals' | 'recall';

const CHECKS: Record<WmaCheck, (argv: string[]) => Promise<unknown>> = {
  memory: () => runMemoryUtilizationAudit(),
  classification: () => runQueryClassificationAudit(),
  goals: () => runGoalsActivationAudit(),
  recall: (argv) => runValidateRecallAudit(argv),
};

export async function runWmaSuite(checks?: WmaCheck[], argv: string[] = []): Promise<void> {
  const selected = checks?.length ? checks : (Object.keys(CHECKS) as WmaCheck[]);
  for (const check of selected) {
    console.error(`\n>>> WMA check: ${check}\n`);
    await CHECKS[check](argv);
  }
}

export { runMemoryUtilizationAudit, runQueryClassificationAudit, runGoalsActivationAudit, runValidateRecallAudit };
