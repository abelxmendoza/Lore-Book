/**
 * Identity collision detection — same name claimed as self AND relationship.
 * Never auto-merge.
 */
import { extractClaimedName, inferRelationshipRole } from '../ontology/lexicalIntelligence';
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';
import type { IdentityCollision } from './meaningResolutionTypes';
import { padForScan } from '../lexical/lexicalNormalizer';

export function detectIdentityCollisions(
  text: string,
  lexical: LexicalAnalysisResult,
  characterMatches: Array<{ id: string; name: string }> = []
): IdentityCollision[] {
  const collisions: IdentityCollision[] = [];
  const claimedName = extractClaimedName(text);
  const relationshipRole = inferRelationshipRole(text);
  const padded = padForScan(text);

  const isSelfClaim =
    lexical.intents.some((i) => i.kind === 'IDENTITY_CLAIM') ||
    /\b(?:is|was)\s+(?:actually\s+)?me\b/i.test(text) ||
    !!claimedName && /\bis\s+me\b/i.test(text);

  const isRelationshipClaim =
    !!relationshipRole ||
    lexical.relationships.length > 0 ||
    /\bmy\s+(?:father|mother|brother|sister|uncle|aunt|cousin|estranged)\b/i.test(text);

  const disambiguate =
    lexical.intents.some((i) => i.kind === 'DISAMBIGUATE') ||
    (/\bbut\b/i.test(text) && isSelfClaim && isRelationshipClaim) ||
    (/\balso\b/i.test(text) && isSelfClaim && isRelationshipClaim);

  if (!claimedName && !disambiguate) return collisions;

  const name = claimedName ?? lexical.entities.find((e) => e.type === 'IDENTITY_CLAIM')?.surface;
  if (!name) return collisions;

  if (isSelfClaim && (isRelationshipClaim || disambiguate)) {
    const char = characterMatches.find(
      (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
    collisions.push({
      name,
      claims: ['self', 'relationship'],
      relationshipRole: relationshipRole ?? lexical.relationships[0]?.role,
      characterId: char?.id,
      confidence: 0.92,
      mustNotAutoMerge: true,
      requiresConfirmation: true,
    });
  } else if (isSelfClaim && padded.includes(' is me')) {
    collisions.push({
      name,
      claims: ['self'],
      confidence: 0.85,
      mustNotAutoMerge: true,
      requiresConfirmation: true,
    });
  } else if (isRelationshipClaim && relationshipRole) {
    collisions.push({
      name,
      claims: ['relationship'],
      relationshipRole,
      characterId: characterMatches.find(
        (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase()
      )?.id,
      confidence: 0.8,
      mustNotAutoMerge: true,
      requiresConfirmation: true,
    });
  }

  return collisions;
}
