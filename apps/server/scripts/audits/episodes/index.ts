import { runEpisodeActivationAudit } from './activation';
import { runEpisodeQualityValidation } from './qualityValidation';

export type EpisodeCheck = 'activation' | 'quality';

const CHECKS: Record<EpisodeCheck, (argv: string[]) => Promise<void>> = {
  activation: (argv) => runEpisodeActivationAudit(argv),
  quality: () => runEpisodeQualityValidation(),
};

export async function runEpisodesSuite(checks?: EpisodeCheck[], argv: string[] = []): Promise<void> {
  const selected = checks?.length ? checks : (Object.keys(CHECKS) as EpisodeCheck[]);
  for (const check of selected) {
    console.error(`\n>>> Episodes check: ${check}\n`);
    await CHECKS[check](argv);
  }
}

export { runEpisodeActivationAudit, runEpisodeQualityValidation };
