/**
 * Map a book-specific rescan onto LoreBook parse apply domains.
 *
 * Rescan Skills may ATTACH evidence to an already-existing canonical Skill.
 * It must not CREATE Projects / Characters / Groups / Places / Quests.
 *
 * Wrong-book routing may attach to an already-existing canonical entity when
 * identity is proven. It must not spawn unrelated book records.
 */

import type { LoreBookDomain } from '../parser/loreBookParserTypes';

export type SuggestionRescanBook =
  | 'characters'
  | 'quests'
  | 'skills'
  | 'projects'
  | 'locations'
  | 'romantic'
  | 'organizations';

export function mapSuggestionDomainsToApplyDomains(
  domains: SuggestionRescanBook[],
): LoreBookDomain[] {
  const out = new Set<LoreBookDomain>();
  for (const domain of domains) {
    switch (domain) {
      case 'romantic':
        break;
      case 'organizations':
        out.add('organizations');
        out.add('groups');
        out.add('schools');
        break;
      default:
        out.add(domain);
        break;
    }
  }
  return [...out];
}

export function operationMatchesApplyDomains(
  opDomain: LoreBookDomain,
  applyDomains?: LoreBookDomain[],
): boolean {
  if (!applyDomains) return true;
  if (applyDomains.length === 0) return false;
  if (applyDomains.includes(opDomain)) return true;
  if (opDomain === 'groups' && applyDomains.includes('organizations')) return true;
  if (opDomain === 'schools' && applyDomains.includes('organizations')) return true;
  return false;
}
