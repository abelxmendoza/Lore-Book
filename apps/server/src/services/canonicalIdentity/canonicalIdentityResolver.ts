import { resolvePlaceBoundary } from '../lexical/places/placeBoundaryResolver';
import { canonicalPlaceKey } from '../lexical/places/placeDuplicateGuard';
import { canonicalIdentityKey, buildAliasSet } from './canonicalAliasService';
import { scoreCanonicalIdentity } from './canonicalConfidenceService';
import { resolveCanonicalDuplicate } from './canonicalDuplicateResolver';
import type {
  CanonicalContextSource,
  CanonicalIdentityInput,
  CanonicalIdentityResult,
} from './canonicalIdentityTypes';
import { formatContextualPersonName } from './canonicalNamingService';
import { resolveHouseholdFromOwnedPlace, resolveOwnedPlace } from './canonicalOwnershipResolver';
import { evaluateCanonicalRelationshipEvidence } from './canonicalRelationshipResolver';
import { BARE_FAMILY_TITLES, normalizePersonTitle, titleCaseIdentity } from './canonicalTitleNormalizer';

const PERSON_PAIR_GROUP =
  /\b[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+)?\s*(?:&|\+|and)\s*(?:Tio|Tia|Tía|Mom|Dad|Abuela|Abuelo|[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+)(?:\s+(?:Family|Group|Crew|Squad|Circle))?\b/i;

const CONTEXTUAL_PERSON_ROLE =
  /^(?:potential investor|old college roommate|new guy|girl|girl from rave|promoter|friend|dj|guy|other promoter|recruiter)\b/i;

function emptyResult(input: CanonicalIdentityInput, rejectionReason: string, rulesFired: string[]): CanonicalIdentityResult {
  return {
    status: 'rejected',
    domain: input.domain,
    aliases: [],
    confidence: 0,
    rejectionReason,
    requiresReview: false,
    rulesFired: [...rulesFired, 'rejected'],
    evidencePhrases: [input.contextText ?? input.rawText],
    sourceMessageIds: input.sourceMessageIds ?? [],
    metadata: {},
  };
}

function acceptedResult(
  input: CanonicalIdentityInput,
  displayName: string,
  rulesFired: string[],
  metadata: Record<string, unknown> = {},
): CanonicalIdentityResult {
  const duplicate = resolveCanonicalDuplicate(displayName, input.domain, input.existingIdentities);
  const status = duplicate ? 'duplicate' : 'accepted';
  const canonicalIdentity =
    input.domain === 'place'
      ? canonicalPlaceKey(displayName)
      : canonicalIdentityKey(displayName);

  return {
    status,
    domain: input.domain,
    canonicalIdentity,
    displayName: duplicate?.displayName ?? displayName,
    aliases: buildAliasSet(duplicate?.displayName ?? displayName, input.rawText, duplicate?.aliases),
    duplicateOf: duplicate,
    confidence: scoreCanonicalIdentity({
      domain: input.domain,
      hasContext: Boolean(input.contextText),
      duplicate: Boolean(duplicate),
      rulesFired,
    }),
    requiresReview: status !== 'duplicate' && (rulesFired.includes('contextual_person_name') || rulesFired.includes('event_community_requires_review')),
    rulesFired,
    evidencePhrases: [input.contextText ?? input.rawText],
    sourceMessageIds: input.sourceMessageIds ?? [],
    metadata,
  };
}

function extractContextSource(text: string): CanonicalContextSource | null {
  const patterns: Array<{ preposition: CanonicalContextSource['preposition']; kind: CanonicalContextSource['kind']; re: RegExp }> = [
    { preposition: 'from', kind: 'organization', re: /\bfrom\s+([A-Z][\w&'.-]+(?:\s+[A-Z][\w&'.-]+){0,3})\b/ },
    { preposition: 'with', kind: 'person', re: /\bwith\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,2})\b/ },
    { preposition: 'at', kind: 'event', re: /\bat\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,4}(?:Prom|Party|Show|Festival|Compound|Club|RaveLA))\b/i },
    { preposition: 'from', kind: 'place', re: /\bfrom\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,4})\b/ },
    { preposition: 'in', kind: 'group', re: /\bin\s+(?:the\s+)?([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,3}\s+(?:Class|Club|Team|Band))\b/i },
  ];

  for (const pattern of patterns) {
    const match = pattern.re.exec(text);
    if (match?.[1]) {
      return { preposition: pattern.preposition, kind: pattern.kind, label: match[1].trim() };
    }
  }
  return null;
}

function resolvePerson(input: CanonicalIdentityInput): CanonicalIdentityResult {
  const raw = input.rawText.replace(/[’‘]/g, "'").trim();
  const possessiveTrimmed = raw.replace(/'s$/i, '');
  const normalized = normalizePersonTitle(possessiveTrimmed);
  const firstKey = normalized.displayName.split(/\s+/)[0]?.toLowerCase() ?? '';

  if (normalized.isBareFamilyTitle && firstKey !== 'abuela') {
    return emptyResult(input, 'bare_family_title_without_identity', normalized.rulesFired);
  }

  if (BARE_FAMILY_TITLES.has(raw.toLowerCase()) && raw.toLowerCase() !== 'abuela') {
    return emptyResult(input, 'bare_family_title_without_identity', ['bare_family_title']);
  }

  if (CONTEXTUAL_PERSON_ROLE.test(raw.toLowerCase())) {
    const context = extractContextSource(input.contextText ?? raw);
    if (!context) return emptyResult(input, 'contextual_person_requires_disambiguation', ['context_required']);
    const displayName = formatContextualPersonName(raw, context);
    return acceptedResult(input, displayName, ['contextual_person_name'], {
      context_source: context,
      inferred_not_confirmed: true,
    });
  }

  const rules = [...normalized.rulesFired];
  if (/^(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Professor|Pastor|General)\s+/i.test(normalized.displayName)) {
    rules.push('title_preserved');
  }
  if (/^(?:Tio|Tia|Abuela|Abuelo)\s+/i.test(normalized.displayName)) {
    rules.push('family_title_name');
  }

  return acceptedResult(input, normalized.displayName, rules.length ? rules : ['person_canonicalized'], {
    title: normalized.title,
  });
}

function resolvePlace(input: CanonicalIdentityInput): CanonicalIdentityResult {
  const owned = resolveOwnedPlace(input.rawText);
  if (owned) {
    return acceptedResult(input, owned.displayName, owned.rulesFired, {
      owner_display_name: owned.ownerDisplayName,
      place_kind: owned.placeKind,
    });
  }

  const boundary = resolvePlaceBoundary(input.rawText);
  const displayName = titleCaseIdentity(boundary.text);
  if (!displayName || /^'?s\s+house/i.test(displayName)) {
    return emptyResult(input, 'invalid_orphan_place_identity', ['orphan_owned_place']);
  }

  return acceptedResult(input, displayName, boundary.fixes.length ? boundary.fixes : ['place_canonicalized']);
}

function resolveGroup(input: CanonicalIdentityInput): CanonicalIdentityResult {
  if (PERSON_PAIR_GROUP.test(input.rawText)) {
    return emptyResult(input, 'person_pair_is_not_group_identity', ['person_pair_group_rejected']);
  }

  const household = resolveHouseholdFromOwnedPlace(input.rawText);
  if (household) {
    return acceptedResult(input, household.displayName, household.rulesFired, {
      anchor_display_name: household.ownerDisplayName,
      inferred_not_confirmed: true,
    });
  }

  const displayName = titleCaseIdentity(input.rawText);
  if (/^(?:Tio|Tia|Mom|Dad|Abuela|Abuelo)\s+(?:Family|Group)$/i.test(displayName)) {
    return emptyResult(input, 'bare_title_group_name', ['bare_title_group_name']);
  }

  return acceptedResult(input, displayName, ['group_canonicalized']);
}

function resolveRelationship(input: CanonicalIdentityInput): CanonicalIdentityResult {
  const verdict = evaluateCanonicalRelationshipEvidence(input.contextText ?? input.rawText);
  if (!verdict.allowed) {
    return emptyResult(input, verdict.reason, verdict.rulesFired);
  }
  return acceptedResult(input, titleCaseIdentity(input.rawText), verdict.rulesFired, {
    relationship_evidence_reason: verdict.reason,
  });
}

export function resolveCanonicalIdentity(input: CanonicalIdentityInput): CanonicalIdentityResult {
  switch (input.domain) {
    case 'person':
      return resolvePerson(input);
    case 'place':
      return resolvePlace(input);
    case 'group':
    case 'organization':
      return resolveGroup({ ...input, domain: input.domain === 'organization' ? 'organization' : 'group' });
    case 'relationship':
      return resolveRelationship(input);
    case 'event':
    case 'timeline_anchor':
      return acceptedResult(input, titleCaseIdentity(input.rawText), [`${input.domain}_canonicalized`]);
    default:
      return emptyResult(input, 'unsupported_canonical_domain', ['unsupported_domain']);
  }
}

export const canonicalIdentityResolver = {
  resolveCanonicalIdentity,
};
