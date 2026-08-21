/**
 * Conservative attach eligibility — strong identity enriches canon; weak
 * similarity stays reviewable; noise never becomes an alias.
 */

import { namesMatchAsAcronym, namesOverlapByContainment, normalizeNameKey } from '../../../utils/nameNormalization';
import { isRelationalPlaceholder, parseCharacterName } from '../../../utils/characterNameMatching';
import { isValidAliasForCharacter } from '../../characters/aliasConstraintService';
import {
  evaluateCharacterIdentity,
  evaluateLocationIdentity,
  evaluateProjectIdentity,
} from '../../identityIntegrityPolicy';
import { findSimilarExistingSkill } from '../../skills/skillSimilarityResolver';
import { resolveSkillCanonical } from '../../skills/skillCanonicalResolver';
import { isGenericOrganizationPhrase } from '../quality/organizationCandidateGuard';
import { classifyInstitutionPlaceRole } from '../quality/institutionPlaceRole';
import { inferNamedOrganizationForName } from '../../organizations/inference/namedOrganizationInference';
import type { LoreBookDomain } from '../parser/loreBookParserTypes';
import type {
  AttachCanonIndex,
  AttachCanonRecord,
  AttachDecision,
  AttachDiagnostic,
  AttachEligibilityInput,
  AttachEvidenceRef,
  AttachMatchBasis,
  AttachPlan,
} from './suggestionAttachTypes';

const DEPT_OR_UNIT =
  /\b(?:team|lab|department|division|group|unit|office|desk|crew|squad)\b/i;

const GARBAGE_ALIAS =
  /^(?:her|his|their|my|the|a|an)\s+(?:friend|guy|girl|person|dude)|because\s+i$|^user mentioned$|^\w+\s+because\s+/i;

const PLACE_ACRONYM_PAIRS: Array<[string, string]> = [
  ['LAX', 'Los Angeles International Airport'],
];

const ORG_DOMAINS = new Set<LoreBookDomain>(['organizations', 'groups', 'schools']);

export function evidenceRefKey(ref: AttachEvidenceRef): string {
  return [
    normalizeNameKey(ref.quote),
    ref.sourceMessageId ?? '',
    String(ref.start ?? ''),
    String(ref.end ?? ''),
  ].join('|');
}

export function mergeEvidenceRefs(
  existing: AttachEvidenceRef[],
  incoming: AttachEvidenceRef,
): { refs: AttachEvidenceRef[]; attached: boolean } {
  const quote = incoming.quote.trim();
  if (!quote) return { refs: existing, attached: false };
  const next = { ...incoming, quote };
  const key = evidenceRefKey(next);
  if (existing.some((item) => evidenceRefKey(item) === key)) {
    return { refs: existing, attached: false };
  }
  return { refs: [...existing, next], attached: true };
}

export function mergeAliasList(
  canonicalName: string,
  existing: string[],
  incoming: string | undefined,
): { aliases: string[]; added: boolean } {
  const seen = new Set<string>([normalizeNameKey(canonicalName), ...existing.map(normalizeNameKey)]);
  const aliases = [...existing];
  const candidate = incoming?.trim();
  if (!candidate) return { aliases, added: false };
  const key = normalizeNameKey(candidate);
  if (!key || seen.has(key)) return { aliases, added: false };
  aliases.push(candidate);
  return { aliases, added: true };
}

function tenantRecords(records: AttachCanonRecord[] | undefined, userId?: string): AttachCanonRecord[] {
  if (!records?.length) return [];
  if (!userId) return records.filter((row) => !row.userId);
  return records.filter((row) => !row.userId || row.userId === userId);
}

function labelsOf(record: AttachCanonRecord): string[] {
  return [record.name, ...record.aliases];
}

function exactOrAliasMatch(name: string, record: AttachCanonRecord): 'exact_normalized' | 'existing_alias' | null {
  const key = normalizeNameKey(name);
  if (normalizeNameKey(record.name) === key) return 'exact_normalized';
  if (record.aliases.some((alias) => normalizeNameKey(alias) === key)) return 'existing_alias';
  return null;
}

function isDepartmentHierarchy(incoming: string, canonical: string): boolean {
  const a = normalizeNameKey(incoming);
  const b = normalizeNameKey(canonical);
  if (a === b) return false;
  const containment = namesOverlapByContainment(a, b);
  if (!containment) return false;
  const longer = a.length >= b.length ? incoming : canonical;
  const shorter = a.length >= b.length ? canonical : incoming;
  if (DEPT_OR_UNIT.test(longer) && !DEPT_OR_UNIT.test(shorter)) return true;
  if (isGenericOrganizationPhrase(incoming) || isGenericOrganizationPhrase(canonical)) return true;
  return false;
}

function placeAcronymMatch(incoming: string, record: AttachCanonRecord): boolean {
  const labels = labelsOf(record);
  for (const [shortName, fullName] of PLACE_ACRONYM_PAIRS) {
    const incomingIsShort = normalizeNameKey(incoming) === normalizeNameKey(shortName);
    const incomingIsFull = normalizeNameKey(incoming) === normalizeNameKey(fullName);
    const recordHasPair = labels.some(
      (label) =>
        normalizeNameKey(label) === normalizeNameKey(shortName) ||
        normalizeNameKey(label) === normalizeNameKey(fullName),
    );
    if (recordHasPair && (incomingIsShort || incomingIsFull)) return true;
  }
  return false;
}

function isGarbageAlias(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || GARBAGE_ALIAS.test(trimmed)) return true;
  if (/\bbecause\b/i.test(trimmed)) return true;
  if (isRelationalPlaceholder(trimmed)) return true;
  return false;
}

function characterFirstNameOnly(incoming: string, record: AttachCanonRecord): boolean {
  const incomingTokens = incoming.trim().split(/\s+/);
  if (incomingTokens.length !== 1) return false;
  const parsed = parseCharacterName(record.name);
  const given = (parsed.coreName ?? record.name).split(/\s+/)[0];
  return normalizeNameKey(incoming) === normalizeNameKey(given);
}

function evidenceNamesFullIdentity(evidence: string, fullName: string): boolean {
  if (!evidence.trim()) return false;
  return normalizeNameKey(evidence).includes(normalizeNameKey(fullName));
}

function orgAcronymMatch(incoming: string, record: AttachCanonRecord): boolean {
  return labelsOf(record).some((label) => namesMatchAsAcronym(incoming, label));
}

function namedOrgSameAs(incoming: string, record: AttachCanonRecord): boolean {
  const named = inferNamedOrganizationForName(incoming);
  if (!named) return false;
  const namedLabels = [named.displayName, ...named.aliases];
  return labelsOf(record).some((label) =>
    namedLabels.some(
      (namedLabel) =>
        normalizeNameKey(namedLabel) === normalizeNameKey(label) || namesMatchAsAcronym(namedLabel, label),
    ),
  );
}

function typesConflict(incomingType: string | undefined, canonicalType: string | undefined): boolean {
  if (!incomingType || !canonicalType) return false;
  const a = incomingType.toLowerCase();
  const b = canonicalType.toLowerCase();
  if (a === b) return false;
  const institution = new Set(['university', 'school', 'institution', 'college', 'bootcamp']);
  const company = new Set(['company', 'employer', 'startup', 'agency']);
  if (institution.has(a) && institution.has(b)) return false;
  if (company.has(a) && company.has(b)) return false;
  if ((a === 'software' || b === 'software') && a !== b) return true;
  if (institution.has(a) && company.has(b)) return true;
  if (company.has(a) && institution.has(b)) return true;
  if ((a === 'person' || a === 'character') && b !== a) return true;
  if ((a === 'place' || a === 'location') && ORG_DOMAINS.has(b as LoreBookDomain)) return false;
  return a !== b;
}

function diagnostic(partial: Omit<AttachDiagnostic, 'aliasAdded' | 'evidenceAttached' | 'suggestionSuppressed' | 'canonicalTypePreserved'> & {
  aliasAdded?: boolean;
  evidenceAttached?: boolean;
  suggestionSuppressed?: boolean;
  canonicalTypePreserved?: boolean;
}): AttachDiagnostic {
  const attach = partial.decision === 'ATTACH_EXACT' || partial.decision === 'ATTACH_ALIAS';
  return {
    ...partial,
    typeConflict: partial.typeConflict,
    aliasAdded: partial.aliasAdded ?? false,
    evidenceAttached: partial.evidenceAttached ?? attach,
    suggestionSuppressed: partial.suggestionSuppressed ?? attach,
    canonicalTypePreserved: partial.canonicalTypePreserved ?? attach,
  };
}

function finishPlan(
  input: AttachEligibilityInput,
  target: AttachCanonRecord,
  base: AttachDiagnostic,
): AttachPlan {
  const evidenceRef: AttachEvidenceRef = {
    quote: (input.evidence ?? '').trim(),
    sourceMessageId: input.sourceMessageId,
    start: input.spanStart,
    end: input.spanEnd,
  };
  const mergedEvidence = mergeEvidenceRefs(target.evidence ?? [], evidenceRef);
  const aliasCandidate =
    base.decision === 'ATTACH_ALIAS' && base.aliasToAdd ? base.aliasToAdd : undefined;
  const mergedAliases = mergeAliasList(target.name, target.aliases, aliasCandidate);
  const mentionBump = mergedEvidence.attached ? 1 : 0;
  return {
    ...base,
    aliasAdded: mergedAliases.added,
    aliasToAdd: mergedAliases.added ? aliasCandidate : undefined,
    evidenceAttached: mergedEvidence.attached,
    suggestionSuppressed: true,
    target,
    evidenceRef,
    nextAliases: mergedAliases.aliases,
    nextEvidence: mergedEvidence.refs,
    nextMentionCount: (target.mentionCount ?? 1) + mentionBump,
  };
}

function rejectDiag(input: AttachEligibilityInput, basis: AttachMatchBasis, reason: string): AttachDiagnostic {
  return diagnostic({
    candidate: input.name,
    domain: input.domain,
    decision: 'REJECT',
    matchBasis: basis,
    typeConflict: false,
    reason,
  });
}

function createNew(input: AttachEligibilityInput, reason = 'no_canonical_match'): AttachDiagnostic {
  return diagnostic({
    candidate: input.name,
    domain: input.domain,
    decision: 'CREATE_NEW',
    matchBasis: 'none',
    typeConflict: false,
    suggestionSuppressed: false,
    evidenceAttached: false,
    reason,
  });
}

function review(
  input: AttachEligibilityInput,
  target: AttachCanonRecord | undefined,
  basis: AttachMatchBasis,
  reason: string,
  typeConflict = false,
): AttachDiagnostic {
  return diagnostic({
    candidate: input.name,
    domain: input.domain,
    decision: 'REVIEW_DUPLICATE',
    canonical: target ? { id: target.id, name: target.name, domain: target.domain } : undefined,
    matchBasis: basis,
    typeConflict,
    suggestionSuppressed: false,
    evidenceAttached: false,
    canonicalTypePreserved: false,
    reason,
  });
}

export function isSafeAliasSurface(name: string, domain: LoreBookDomain, canonicalName: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (normalizeNameKey(trimmed) === normalizeNameKey(canonicalName)) return false;
  if (isGarbageAlias(trimmed)) return false;
  if (domain === 'characters') {
    if (!isValidAliasForCharacter(canonicalName, trimmed)) return false;
    const incomingTokens = trimmed.split(/\s+/);
    const canonTokens = canonicalName.trim().split(/\s+/);
    if (incomingTokens.length === 1 && canonTokens.length >= 2) return false;
    return true;
  }
  if (ORG_DOMAINS.has(domain)) {
    if (isGenericOrganizationPhrase(trimmed)) return false;
    if (isDepartmentHierarchy(trimmed, canonicalName)) return false;
    return namesMatchAsAcronym(trimmed, canonicalName) || namesOverlapByContainment(
      normalizeNameKey(trimmed),
      normalizeNameKey(canonicalName),
    ) === false;
  }
  if (domain === 'locations') {
    if (DEPT_OR_UNIT.test(trimmed) && !DEPT_OR_UNIT.test(canonicalName)) return false;
    return true;
  }
  return true;
}

function attachExact(
  input: AttachEligibilityInput,
  target: AttachCanonRecord,
  basis: AttachMatchBasis,
  reason: string,
  extra: Partial<AttachDiagnostic> = {},
): AttachPlan {
  const conflict = typesConflict(input.incomingType, target.canonicalType);
  const base = diagnostic({
    candidate: input.name,
    domain: input.domain,
    decision: 'ATTACH_EXACT',
    canonical: { id: target.id, name: target.name, domain: target.domain },
    matchBasis: basis,
    typeConflict: conflict,
    incomingTypeNormalized: conflict ? target.canonicalType : input.incomingType,
    reason,
    ...extra,
  });
  return finishPlan(input, target, base);
}

function attachAlias(
  input: AttachEligibilityInput,
  target: AttachCanonRecord,
  basis: AttachMatchBasis,
  reason: string,
  extra: Partial<AttachDiagnostic> = {},
): AttachPlan | AttachDiagnostic {
  const surface = input.name.trim();
  if (!isSafeAliasSurface(surface, target.domain, target.name) && basis !== 'normalized_skill_identity' && basis !== 'acronym_match' && basis !== 'place_acronym' && basis !== 'first_name_only' && basis !== 'routed_canonical') {
    return review(input, target, basis, 'unsafe_alias_surface');
  }
  const conflict = typesConflict(input.incomingType, target.canonicalType);
  const base = diagnostic({
    candidate: input.name,
    domain: input.domain,
    decision: 'ATTACH_ALIAS',
    canonical: { id: target.id, name: target.name, domain: target.domain },
    matchBasis: basis,
    typeConflict: conflict,
    aliasToAdd: surface,
    aliasAdded: true,
    incomingTypeNormalized: conflict ? target.canonicalType : input.incomingType,
    reason,
    ...extra,
  });
  return finishPlan(input, target, base);
}

function evaluateCharacters(input: AttachEligibilityInput, pool: AttachCanonRecord[]): AttachDiagnostic | AttachPlan {
  if (isGarbageAlias(input.name) || isRelationalPlaceholder(input.name)) {
    return rejectDiag(input, 'relational_reference', 'relational_or_descriptive_not_identity');
  }

  const identity = evaluateCharacterIdentity(
    input.name,
    pool.map((row) => ({ id: row.id, name: row.name, aliases: row.aliases })),
  );

  if (identity.verdict.tier === 'identity_equivalent' && identity.matched) {
    const target = pool.find((row) => row.id === identity.matched?.id);
    if (target) {
      const exact = exactOrAliasMatch(input.name, target);
      if (exact) return attachExact(input, target, exact, exact === 'existing_alias' ? 'existing_alias' : 'exact_canonical_name');
    }
  }

  const givenMatches = pool.filter((row) => characterFirstNameOnly(input.name, row));
  if (givenMatches.length > 1) {
    return review(input, givenMatches[0], 'first_name_only', 'ambiguous_given_name');
  }
  const unique = givenMatches[0] ?? null;
  if (unique && characterFirstNameOnly(input.name, unique)) {
    if (evidenceNamesFullIdentity(input.evidence ?? '', unique.name)) {
      return attachAlias(input, unique, 'first_name_only', 'given_name_with_full_identity_evidence');
    }
    return review(input, unique, 'first_name_only', 'first_name_only');
  }

  if (identity.verdict.tier === 'similar' && identity.matched) {
    const target = pool.find((row) => row.id === identity.matched?.id);
    return review(input, target, 'fuzzy_similarity', identity.verdict.reasons[0] ?? 'similar_person_not_equivalent');
  }

  return createNew(input);
}

function evaluateOrgs(input: AttachEligibilityInput, pool: AttachCanonRecord[]): AttachDiagnostic | AttachPlan {
  if (isGarbageAlias(input.name) || isGenericOrganizationPhrase(input.name)) {
    return rejectDiag(input, 'malformed_span', 'generic_or_descriptive_org');
  }

  for (const record of pool) {
    const exact = exactOrAliasMatch(input.name, record);
    if (exact) {
      return attachExact(input, record, exact, exact === 'existing_alias' ? 'existing_alias' : 'exact_canonical_name');
    }
  }

  for (const record of pool) {
    if (isDepartmentHierarchy(input.name, record.name)) {
      return review(input, record, 'hierarchy_not_duplicate', 'parent_vs_department');
    }
  }

  for (const record of pool) {
    if (orgAcronymMatch(input.name, record) || namedOrgSameAs(input.name, record)) {
      const conflict = typesConflict(input.incomingType, record.canonicalType);
      if (conflict && !record.canonicalType) {
        return review(input, record, 'type_conflict_weak_identity', 'type_conflict_without_canonical_type', true);
      }
      return attachAlias(input, record, 'acronym_match', 'acronym_match');
    }
  }

  for (const record of pool) {
    if (namesOverlapByContainment(normalizeNameKey(input.name), normalizeNameKey(record.name))) {
      const conflict = typesConflict(input.incomingType, record.canonicalType);
      if (conflict) return review(input, record, 'type_conflict_weak_identity', 'type_conflict_weak_identity', true);
      return review(input, record, 'containment', 'containment_not_identity');
    }
  }

  return createNew(input);
}

function evaluateSkills(input: AttachEligibilityInput, pool: AttachCanonRecord[]): AttachDiagnostic | AttachPlan {
  const similar = findSimilarExistingSkill(
    input.name,
    pool.map((row) => ({ name: row.name, aliases: row.aliases })),
  );

  if (similar.match && (similar.method === 'exact' || similar.method === 'alias' || similar.method === 'canonical')) {
    const target = pool.find((row) => normalizeNameKey(row.name) === normalizeNameKey(similar.match!.name));
    if (!target) return createNew(input);
    const exact = exactOrAliasMatch(input.name, target);
    if (exact) return attachExact(input, target, exact === 'existing_alias' ? 'existing_alias' : 'exact_normalized', 'exact_or_alias_skill');
    const canonical = resolveSkillCanonical(input.name);
    if (normalizeNameKey(canonical.canonicalTitle) === normalizeNameKey(target.name)) {
      return attachAlias(input, target, 'normalized_skill_identity', 'normalized_skill_identity');
    }
    return attachAlias(input, target, 'normalized_skill_identity', `skill_${similar.method}`);
  }

  if (similar.match && similar.method === 'fuzzy') {
    const target = pool.find((row) => normalizeNameKey(row.name) === normalizeNameKey(similar.match!.name));
    return review(input, target, 'fuzzy_similarity', 'related_skill_not_same_capability');
  }

  return createNew(input);
}

function evaluatePlaces(input: AttachEligibilityInput, pool: AttachCanonRecord[], orgPool: AttachCanonRecord[]): AttachDiagnostic | AttachPlan {
  if (isGarbageAlias(input.name) || /\bbecause\b/i.test(input.name)) {
    return rejectDiag(input, 'malformed_span', 'malformed_place_span');
  }

  for (const record of pool) {
    const exact = exactOrAliasMatch(input.name, record);
    if (exact) return attachExact(input, record, exact, exact === 'existing_alias' ? 'existing_alias' : 'exact_canonical_name');
    if (placeAcronymMatch(input.name, record)) {
      return attachAlias(input, record, 'place_acronym', 'place_acronym');
    }
  }

  const venue = evaluateLocationIdentity(
    input.name,
    pool.map((row) => ({ id: row.id, name: row.name, aliases: row.aliases })),
  );
  if (venue.verdict.tier === 'identity_equivalent' && venue.matched) {
    const target = pool.find((row) => row.id === venue.matched?.id);
    if (target) return attachExact(input, target, 'exact_normalized', 'canonical_venue');
  }

  for (const record of pool) {
    if (isDepartmentHierarchy(input.name, record.name)) {
      return review(input, record, 'hierarchy_not_duplicate', 'place_vs_department');
    }
  }

  for (const org of orgPool) {
    const exact = exactOrAliasMatch(input.name, org);
    const acronym = orgAcronymMatch(input.name, org) || namedOrgSameAs(input.name, org) || placeAcronymMatch(input.name, org);
    if (!exact && !acronym) continue;
    const role = classifyInstitutionPlaceRole(input.name, input.evidence ?? '');
    return attachAlias(input, org, 'routed_canonical', 'wrong_book_routed_to_institution', {
      contextualRole: role,
    });
  }

  return createNew(input);
}

function evaluateProjects(input: AttachEligibilityInput, pool: AttachCanonRecord[]): AttachDiagnostic | AttachPlan {
  const identity = evaluateProjectIdentity(
    input.name,
    pool.map((row) => ({ id: row.id, name: row.name, aliases: row.aliases })),
  );
  if (identity.verdict.tier === 'identity_equivalent' && identity.matched) {
    const target = pool.find((row) => row.id === identity.matched?.id);
    if (target) {
      const exact = exactOrAliasMatch(input.name, target);
      return attachExact(input, target, exact ?? 'exact_normalized', 'exact_project');
    }
  }
  if (identity.verdict.tier === 'similar' && identity.matched) {
    const target = pool.find((row) => row.id === identity.matched?.id);
    return review(input, target, 'fuzzy_similarity', 'similar_project');
  }
  return createNew(input);
}

function questIdentityKey(title: string): string {
  return normalizeNameKey(title).replace(/\b(?:my|the|a|an)\s+/g, ' ').replace(/\s+/g, ' ').trim();
}

function evaluateQuests(input: AttachEligibilityInput, pool: AttachCanonRecord[]): AttachDiagnostic | AttachPlan {
  const incomingKey = questIdentityKey(input.name);
  for (const record of pool) {
    const exact = exactOrAliasMatch(input.name, record);
    if (exact || questIdentityKey(record.name) === incomingKey) {
      return attachExact(input, record, exact ?? 'exact_normalized', 'exact_quest');
    }
  }
  return createNew(input);
}

export function forceAttachFromUserMerge(
  input: AttachEligibilityInput,
  target: AttachCanonRecord,
): AttachPlan {
  const plan = attachAlias(input, target, 'routed_canonical', 'user_merge_memory');
  if ('target' in plan) return plan;
  return attachExact(input, target, 'canonical_id', 'user_merge_memory');
}

export function evaluateAttachEligibility(input: AttachEligibilityInput): AttachDiagnostic | AttachPlan {
  const name = input.name.trim();
  if (!name) return rejectDiag(input, 'malformed_span', 'empty_name');
  if (input.canonStatus === 'degraded') {
    return diagnostic({
      candidate: name,
      domain: input.domain,
      decision: 'DEGRADED',
      matchBasis: 'none',
      typeConflict: false,
      suggestionSuppressed: true,
      evidenceAttached: false,
      reason: 'canonical_index_degraded',
    });
  }

  const scoped: AttachCanonIndex = {};
  for (const [domain, rows] of Object.entries(input.canon) as Array<[LoreBookDomain, AttachCanonRecord[]]>) {
    scoped[domain] = tenantRecords(rows, input.userId);
  }

  const domain = input.domain;
  if (domain === 'characters') return evaluateCharacters(input, scoped.characters ?? []);
  if (ORG_DOMAINS.has(domain)) {
    const pool = [...(scoped.organizations ?? []), ...(scoped.groups ?? []), ...(scoped.schools ?? [])];
    return evaluateOrgs({ ...input, name }, pool);
  }
  if (domain === 'skills') return evaluateSkills(input, scoped.skills ?? []);
  if (domain === 'locations') {
    return evaluatePlaces(input, scoped.locations ?? [], [...(scoped.organizations ?? []), ...(scoped.groups ?? [])]);
  }
  if (domain === 'projects') return evaluateProjects(input, scoped.projects ?? []);
  if (domain === 'quests') return evaluateQuests(input, scoped.quests ?? []);
  return createNew(input);
}

export function isAttachPlan(result: AttachDiagnostic | AttachPlan): result is AttachPlan {
  return (result.decision === 'ATTACH_EXACT' || result.decision === 'ATTACH_ALIAS') && 'target' in result;
}
