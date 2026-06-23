import type { CanonicalIdentityRecord } from './canonicalIdentityTypes';
import { canonicalIdentityKey } from './canonicalAliasService';

export function resolveCanonicalDuplicate(
  displayName: string,
  domain: CanonicalIdentityRecord['domain'],
  existing: CanonicalIdentityRecord[] = [],
): CanonicalIdentityRecord | undefined {
  const key = canonicalIdentityKey(displayName);

  return existing.find((record) => {
    if (record.domain !== domain) return false;
    if (record.canonicalIdentity === key) return true;
    if (canonicalIdentityKey(record.displayName) === key) return true;
    return (record.aliases ?? []).some((alias) => canonicalIdentityKey(alias) === key);
  });
}
