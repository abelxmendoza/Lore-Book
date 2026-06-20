/**
 * Dedupe against known canon — attach evidence instead of duplicate cards.
 */

import { canonicalProjectKey } from '../../lexical/projects/projectDeduplicationService';
import {
  evaluateCharacterIdentity,
  evaluateProjectIdentity,
  identityTierToRedirectDisposition,
} from '../../identityIntegrityPolicy';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import type {
  EntityQualityCandidate,
  EntityQualityContext,
  EntityQualityVerdict,
} from './entityQualityGuardTypes';

function keyForDomain(name: string, domain: EntityQualityCandidate['domain']): string {
  if (domain === 'projects') return canonicalProjectKey(name);
  return normalizeNameKey(name);
}

function findInKnownBook(
  name: string,
  domain: EntityQualityCandidate['domain'],
  ctx: EntityQualityContext
): { id: string; name: string } | null {
  const known = ctx.knownInBook;
  const ids = ctx.knownInBookIds;
  if (!known?.size) return null;

  const targetKey = keyForDomain(name, domain);
  for (const label of known) {
    if (keyForDomain(label, domain) === targetKey) {
      const id = ids?.get(keyForDomain(label, domain)) ?? ids?.get(normalizeNameKey(label));
      return { id: id ?? label, name: label };
    }
  }
  return null;
}

export function guardDuplicateEntity(
  candidate: EntityQualityCandidate,
  ctx: EntityQualityContext
): EntityQualityVerdict | null {
  const name = candidate.name.trim();
  if (!name) return null;

  const exact = findInKnownBook(name, candidate.domain, ctx);
  if (exact) {
    return {
      gate: 'reject',
      name,
      domain: candidate.domain,
      rejectionReason: 'duplicate_canon_exact',
      matchedCanonId: exact.id,
      matchedCanonName: exact.name,
      confidence: 1,
      provenance: [{ guard: 'duplicateEntityGuard', rule: 'canon_exact_match', detail: exact.name }],
      requiresReview: false,
    };
  }

  if (candidate.domain === 'characters') {
    const entities = [...(ctx.knownInBook ?? [])].map((label) => ({
      id: ctx.knownInBookIds?.get(normalizeNameKey(label)) ?? label,
      name: label,
      aliases: [] as string[],
    }));
    const { verdict, matched } = evaluateCharacterIdentity(name, entities);
    const disposition = identityTierToRedirectDisposition(verdict.tier);
    if (disposition === 'auto_merged' && matched) {
      return {
        gate: 'reject',
        name,
        domain: candidate.domain,
        rejectionReason: 'duplicate_canon_identity',
        matchedCanonId: matched.id,
        matchedCanonName: matched.name,
        confidence: verdict.confidence,
        provenance: [{ guard: 'duplicateEntityGuard', rule: 'identity_equivalent', detail: matched.name }],
        requiresReview: false,
      };
    }
  }

  if (candidate.domain === 'projects') {
    const entities = [...(ctx.knownInBook ?? [])].map((label) => ({
      id: ctx.knownInBookIds?.get(canonicalProjectKey(label)) ?? label,
      name: label,
    }));
    const { verdict, matched } = evaluateProjectIdentity(name, entities);
    if (verdict.tier === 'identity_equivalent' && matched) {
      return {
        gate: 'reject',
        name,
        domain: candidate.domain,
        rejectionReason: 'duplicate_canon_project',
        matchedCanonId: matched.id,
        matchedCanonName: matched.name,
        confidence: 1,
        provenance: [{ guard: 'duplicateEntityGuard', rule: 'project_canonical_match', detail: matched.name }],
        requiresReview: false,
      };
    }
  }

  return null;
}
