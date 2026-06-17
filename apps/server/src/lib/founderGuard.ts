import { isFounderAccount, isFounderEmail } from './accountAuthority';

/**
 * Founder personal data must never be used for demo, seed, fixture, or export pipelines.
 * Call before any operation that writes synthetic data to a user scope.
 */
export function assertSafeForSyntheticData(
  userId: string,
  email?: string | null,
  context = 'synthetic data generation'
): void {
  if (isFounderAccount(userId, email)) {
    throw new Error(
      `Founder account protected: cannot run ${context} against the founder production account.`
    );
  }
  if (email && isFounderEmail(email)) {
    throw new Error(
      `Founder account protected: cannot run ${context} for ${email}.`
    );
  }
}

export function isBlockedFounderTarget(userId: string, email?: string | null): boolean {
  return isFounderAccount(userId, email) || (!!email && isFounderEmail(email));
}
