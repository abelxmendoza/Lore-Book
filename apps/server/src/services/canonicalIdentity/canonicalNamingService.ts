import type { CanonicalContextSource } from './canonicalIdentityTypes';
import { titleCaseIdentity } from './canonicalTitleNormalizer';

const ROLE_ARTICLE = /^(?:a|an|the|my|our|some|one of)\s+/i;

export function cleanRolePhrase(role: string): string {
  return role.replace(ROLE_ARTICLE, '').replace(/\s+/g, ' ').trim();
}

export function formatContextualPersonName(role: string, context: CanonicalContextSource | null): string {
  const title = titleCaseIdentity(cleanRolePhrase(role));
  if (!title) return '';
  if (!context) return title;

  const label = titleCaseIdentity(context.label);
  const prep = context.preposition.charAt(0).toUpperCase() + context.preposition.slice(1);
  return `${title} ${prep} ${label}`;
}

export function cleanPossessiveOwner(owner: string): string {
  return titleCaseIdentity(
    owner
      .replace(/^(?:my|our|the)\s+/i, '')
      .replace(/'s$/i, '')
      .replace(/s$/i, (suffix, offset, full) => {
        const lower = full.toLowerCase();
        return /^(?:moms|dads|abuelas|abuelos|tios|tias)$/.test(lower) ? '' : suffix;
      })
      .trim(),
  );
}

export function formatOwnedPlace(owner: string, placeKind: string): string {
  const ownerName = cleanPossessiveOwner(owner);
  const kind = /^(?:home|casa)$/i.test(placeKind) ? 'House' : titleCaseIdentity(placeKind);
  return `${ownerName}'s ${kind}`;
}

export function formatHouseholdName(owner: string): string {
  return `${cleanPossessiveOwner(owner)} Household`;
}
