/**
 * Authoritative entity-type compatibility and merge-authorization policy.
 *
 * Candidate retrieval is intentionally broader than merge authorization. Every
 * resolver and persistence service must call this module before treating two
 * labels as one identity. Unknown types abstain; false splits are safer than
 * false merges.
 */

export const ENTITY_RESOLVER_VERSION = 'type-safe-v1' as const;

export type NormalizedEntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'country'
  | 'city'
  | 'school'
  | 'software_tool'
  | 'project'
  | 'product'
  | 'event'
  | 'unknown';

export type EntityTypeFamily =
  | 'person'
  | 'organization'
  | 'location'
  | 'artifact'
  | 'event'
  | 'unknown';

export type TypeCompatibilityDecision = {
  compatible: boolean;
  expectedType: NormalizedEntityType;
  candidateType: NormalizedEntityType;
  expectedFamily: EntityTypeFamily;
  candidateFamily: EntityTypeFamily;
  reason: 'SAME_TYPE' | 'COMPATIBLE_FAMILY' | 'INSTITUTION_ORGANIZATION' | 'ENTITY_TYPE_MISMATCH' | 'UNKNOWN_TYPE';
};

export type MergeAuthorizationInput = {
  sourceType: string | null | undefined;
  targetType: string | null | undefined;
  reason: string;
  evidenceIds: string[];
  resolverVersion?: string;
  /** Explicit user-confirmed corrections still cannot cross incompatible families. */
  actor: 'SYSTEM' | 'USER';
};

export type MergeAuthorization = TypeCompatibilityDecision & {
  authorized: boolean;
  authorizationReason: string;
  resolverVersion: string;
  evidenceIds: string[];
};

const TYPE_ALIASES: Record<string, NormalizedEntityType> = {
  person: 'person', character: 'person', people: 'person', human: 'person',
  organization: 'organization', org: 'organization', company: 'organization',
  group: 'organization', family: 'organization', brand: 'organization',
  location: 'location', place: 'location', household: 'location', state: 'location',
  venue: 'location',
  country: 'country', nation: 'country',
  city: 'city', town: 'city',
  school: 'school', university: 'school', college: 'school', campus: 'school',
  software_tool: 'software_tool', software: 'software_tool', tool: 'software_tool',
  app: 'software_tool', application: 'software_tool', platform: 'software_tool',
  chatbot: 'software_tool', ai_tool: 'software_tool',
  project: 'project',
  product: 'product', object: 'product', thing: 'product', possession: 'product',
  event: 'event',
  unknown: 'unknown', unclassified: 'unknown', concept: 'unknown',
};

export function normalizeEntityType(type: string | null | undefined): NormalizedEntityType {
  if (!type) return 'unknown';
  const key = type.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return TYPE_ALIASES[key] ?? 'unknown';
}

export function entityTypeFamily(type: string | NormalizedEntityType | null | undefined): EntityTypeFamily {
  switch (normalizeEntityType(type)) {
    case 'person': return 'person';
    case 'organization':
    case 'school': return 'organization';
    case 'location':
    case 'country':
    case 'city': return 'location';
    case 'software_tool':
    case 'project':
    case 'product': return 'artifact';
    case 'event': return 'event';
    default: return 'unknown';
  }
}

export function areEntityTypesCompatible(
  expectedType: string | null | undefined,
  candidateType: string | null | undefined,
): TypeCompatibilityDecision {
  const expected = normalizeEntityType(expectedType);
  const candidate = normalizeEntityType(candidateType);
  const expectedFamily = entityTypeFamily(expected);
  const candidateFamily = entityTypeFamily(candidate);

  if (expected === 'unknown' || candidate === 'unknown') {
    return { compatible: false, expectedType: expected, candidateType: candidate, expectedFamily, candidateFamily, reason: 'UNKNOWN_TYPE' };
  }
  if (expected === candidate) {
    return { compatible: true, expectedType: expected, candidateType: candidate, expectedFamily, candidateFamily, reason: 'SAME_TYPE' };
  }
  if ((expected === 'school' && candidate === 'organization') || (expected === 'organization' && candidate === 'school')) {
    return { compatible: true, expectedType: expected, candidateType: candidate, expectedFamily, candidateFamily, reason: 'INSTITUTION_ORGANIZATION' };
  }
  if (expectedFamily === candidateFamily) {
    return { compatible: true, expectedType: expected, candidateType: candidate, expectedFamily, candidateFamily, reason: 'COMPATIBLE_FAMILY' };
  }
  return { compatible: false, expectedType: expected, candidateType: candidate, expectedFamily, candidateFamily, reason: 'ENTITY_TYPE_MISMATCH' };
}

/**
 * Matching veto — used when FILTERING candidates for lexical/kinship matching,
 * not when authorizing a persisted merge. Only a known cross-family mismatch
 * blocks a match: untyped mentions and candidates are the common case in live
 * data, and vetoing them re-introduces the resolver skip-drop failure (exact
 * alias matches vetoed, real people silently dropped from ingestion).
 * Persisted merges stay strict via authorizeEntityMerge, where unknown abstains.
 */
export function isMatchVetoedByType(
  expectedType: string | null | undefined,
  candidateType: string | null | undefined,
): boolean {
  return areEntityTypesCompatible(expectedType, candidateType).reason === 'ENTITY_TYPE_MISMATCH';
}

/** Hard authorization boundary for every persisted identity merge. */
export function authorizeEntityMerge(input: MergeAuthorizationInput): MergeAuthorization {
  const compatibility = areEntityTypesCompatible(input.sourceType, input.targetType);
  const resolverVersion = input.resolverVersion?.trim() || ENTITY_RESOLVER_VERSION;
  const evidenceIds = [...new Set(input.evidenceIds.filter(Boolean))];
  const hasAuditEvidence = input.reason.trim().length > 0 && evidenceIds.length > 0 && resolverVersion.length > 0;
  const authorized = compatibility.compatible && hasAuditEvidence;
  return {
    ...compatibility,
    authorized,
    authorizationReason: !compatibility.compatible
      ? compatibility.reason
      : !hasAuditEvidence
        ? 'MISSING_MERGE_EVIDENCE'
        : `${compatibility.reason}:${input.actor}`,
    resolverVersion,
    evidenceIds,
  };
}

export function assertEntityMergeAuthorized(input: MergeAuthorizationInput): MergeAuthorization {
  const decision = authorizeEntityMerge(input);
  if (!decision.authorized) {
    const error = new Error(`Entity merge blocked: ${decision.authorizationReason}`) as Error & {
      code: string;
      authorization: MergeAuthorization;
    };
    error.code = 'ENTITY_MERGE_NOT_AUTHORIZED';
    error.authorization = decision;
    throw error;
  }
  return decision;
}
