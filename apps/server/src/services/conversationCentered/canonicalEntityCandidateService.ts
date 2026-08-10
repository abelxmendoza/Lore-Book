import type { EntityType } from '../../types/omegaMemory';
import { normalizeDuplicateKey } from '../../utils/nameNormalization';
import { isPollutingPersonLabel, isPollutingPlaceLabel } from '../actors/entityLabelPollution';
import type { MessageEntityChip } from '../chat/messageEntityDisplayService';

type CandidateEntity = {
  name: string;
  type: EntityType;
  bornConfirmed?: boolean;
};

const PRONOUN_CANDIDATES = new Set([
  'he', 'her', 'hers', 'him', 'his', 'it', 'its', 'she', 'their', 'theirs',
  'them', 'they', 'we', 'you', 'your', 'yours',
]);

function canonicalType(type: MessageEntityChip['type']): EntityType | null {
  if (type === 'character') return 'PERSON';
  if (type === 'location') return 'LOCATION';
  if (type === 'organization') return 'ORG';
  return null;
}

function overlapsCanonicalName(candidate: string, canonical: string): boolean {
  const candidateKey = normalizeDuplicateKey(candidate);
  const canonicalKey = normalizeDuplicateKey(canonical);
  if (!candidateKey || !canonicalKey) return false;
  if (candidateKey === canonicalKey) return true;
  const candidateTokens = candidateKey.split(/\s+/).filter(Boolean);
  const canonicalTokens = new Set(canonicalKey.split(/\s+/).filter(Boolean));
  return candidateTokens.length > 0 && candidateTokens.every((token) => canonicalTokens.has(token));
}

/**
 * Gives tenant-scoped book entities precedence over speculative extractor
 * candidates. This prevents a short spelling such as "Angel" from becoming a
 * second person when the same message explicitly matched canonical
 * "Ángel Negr0". It also rejects pronouns before they can become people,
 * bands, or organizations.
 */
export function mergeCanonicalEntityCandidates(
  extracted: CandidateEntity[],
  bookMatches: MessageEntityChip[],
): CandidateEntity[] {
  const accepted = extracted.filter((candidate) => {
    const key = normalizeDuplicateKey(candidate.name);
    if (!key || PRONOUN_CANDIDATES.has(key)) return false;
    const type = String(candidate.type).toUpperCase();
    if ((type === 'PERSON' || type === 'CHARACTER') && isPollutingPersonLabel(candidate.name)) return false;
    if (type === 'LOCATION' && isPollutingPlaceLabel(candidate.name)) return false;

    return !bookMatches.some((match) => {
      const matchType = canonicalType(match.type);
      if (!matchType) return false;
      const sameKind = matchType === type || (matchType === 'PERSON' && type === 'CHARACTER');
      return sameKind && overlapsCanonicalName(candidate.name, match.name);
    });
  });

  for (const match of bookMatches) {
    const type = canonicalType(match.type);
    if (!type) continue;
    const key = `${type}:${normalizeDuplicateKey(match.name)}`;
    if (accepted.some((candidate) => `${String(candidate.type).toUpperCase()}:${normalizeDuplicateKey(candidate.name)}` === key)) continue;
    accepted.push({ name: match.name, type, bornConfirmed: true });
  }

  const seen = new Set<string>();
  return accepted.filter((candidate) => {
    const key = `${String(candidate.type).toUpperCase()}:${normalizeDuplicateKey(candidate.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
