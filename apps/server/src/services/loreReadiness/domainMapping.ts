import type { Domain } from '../biographyGeneration/types';
import type { LoreTopicId } from './types';

/** Maps UI topic domains to server atom domain tags. */
export const TOPIC_DOMAIN_ALIASES: Record<string, Domain[]> = {
  professional: ['professional'],
  relationships: ['relationships', 'friendship', 'romance'],
  family: ['family'],
  creative: ['creative', 'fighting', 'robotics'],
  health: ['health'],
  education: ['education'],
  personal: ['personal'],
};

export function topicDomainsFor(topicDomain?: string): Domain[] {
  if (!topicDomain) return [];
  return TOPIC_DOMAIN_ALIASES[topicDomain] ?? [topicDomain as Domain];
}

export function atomMatchesTopicDomain(atomDomains: Domain[], topicDomain?: string): boolean {
  if (!topicDomain) return true;
  const aliases = topicDomainsFor(topicDomain);
  return atomDomains.some((d) => aliases.includes(d));
}

export function aggregateDomainCoverage(
  rows: Array<{ domain: string; atomCount: number; entryCount: number }>,
  topicDomain?: string
): { atomCount: number; entryCount: number } {
  if (!topicDomain) {
    return {
      atomCount: rows.reduce((sum, r) => sum + r.atomCount, 0),
      entryCount: rows.reduce((sum, r) => sum + r.entryCount, 0),
    };
  }

  const aliases = new Set(topicDomainsFor(topicDomain));
  let atomCount = 0;
  let entryCount = 0;
  for (const row of rows) {
    if (aliases.has(row.domain as Domain)) {
      atomCount += row.atomCount;
      entryCount += row.entryCount;
    }
  }
  return { atomCount, entryCount };
}

export function topicIdToDefaultSpec(topicId: LoreTopicId): {
  scope: 'full_life' | 'domain' | 'thematic';
  domain?: Domain;
} {
  switch (topicId) {
    case 'full_life':
      return { scope: 'full_life' };
    case 'professional':
      return { scope: 'domain', domain: 'professional' };
    case 'relationships':
      return { scope: 'domain', domain: 'relationships' };
    case 'family':
      return { scope: 'domain', domain: 'family' };
    case 'creative':
      return { scope: 'domain', domain: 'creative' };
    case 'health':
      return { scope: 'domain', domain: 'health' };
    case 'education':
      return { scope: 'domain', domain: 'education' };
    case 'personal':
      return { scope: 'domain', domain: 'personal' };
    case 'character_book':
    case 'place_book':
      return { scope: 'thematic' };
    default:
      return { scope: 'thematic' };
  }
}
