import { runChatTrustRecoveryAudit } from './chatTrustRecovery';
import { runShadowBaselineIntegrityAudit } from './shadowBaseline';

export type IntegrityCheck = 'chat-trust' | 'shadow-baseline';

const CHECKS: Record<IntegrityCheck, () => Promise<void>> = {
  'chat-trust': () => runChatTrustRecoveryAudit(),
  'shadow-baseline': () => runShadowBaselineIntegrityAudit(),
};

export async function runIntegritySuite(checks?: IntegrityCheck[]): Promise<void> {
  const selected = checks?.length ? checks : (Object.keys(CHECKS) as IntegrityCheck[]);
  for (const check of selected) {
    console.error(`\n>>> Integrity check: ${check}\n`);
    await CHECKS[check]();
  }
}

export { runChatTrustRecoveryAudit, runShadowBaselineIntegrityAudit };
