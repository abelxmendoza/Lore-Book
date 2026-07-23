/**
 * Reclassify existing location registry rows by ontology rules.
 * Manual/known plans outrank heuristics; ambiguity stays NEEDS_REVIEW.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import { detectCompoundPlaceNames } from '../../locations/placePresenceSemantics';
import { guardPlaceWrongDomain } from '../../lexical/places/placeWrongDomainGuard';
import { resolvePlaceCanonical } from '../placeCanonicalResolver';
import { isGenericPlaceNoun } from '../placeCanonicalResolver';
import type {
  PlaceMigrationDecision,
  PlaceMigrationPlanItem,
  PlaceMigrationTargetOntology,
} from './placeMigrationTypes';

export type ReclassifyInput = {
  placeId: string;
  name: string;
  type?: string | null;
  aliases?: string[] | null;
  metadata?: Record<string, unknown> | null;
  evidenceText?: string;
  knownPlaceNames?: string[];
  knownPlaceIdsByName?: Map<string, string>;
};

type KnownPlan = {
  decision: PlaceMigrationDecision;
  canonicalTitle?: string;
  newType?: string;
  targetEntityType?: PlaceMigrationTargetOntology;
  aliases?: string[];
  splitNames?: string[];
  demoteReason?: string;
  confidence: number;
  rulesFired: string[];
  warnings?: string[];
};

const KNOWN_PLANS: Record<string, KnownPlan> = {
  stanford: {
    decision: 'KEEP_AND_RETYPE',
    canonicalTitle: 'Stanford University',
    newType: 'university',
    aliases: ['Stanford'],
    confidence: 0.9,
    rulesFired: ['known_plan_stanford'],
  },
  berkeley: {
    decision: 'NEEDS_REVIEW',
    canonicalTitle: 'Berkeley',
    newType: 'city',
    confidence: 0.45,
    rulesFired: ['known_plan_berkeley_ambiguous'],
    warnings: ['Could be University of California, Berkeley or City of Berkeley — resolve from source context'],
  },
  'electrical engineering': {
    decision: 'MOVE_TO_FIELD',
    canonicalTitle: 'Electrical Engineering',
    targetEntityType: 'FIELD_OF_STUDY',
    confidence: 0.98,
    rulesFired: ['known_plan_field_of_study'],
  },
  'club bar sinister': {
    decision: 'KEEP_AND_RETYPE',
    canonicalTitle: 'Bar Sinister',
    newType: 'nightclub',
    aliases: ['Club Bar Sinister', 'Bar Sinister'],
    confidence: 0.88,
    rulesFired: ['known_plan_bar_sinister'],
  },
  'bar sinister': {
    decision: 'KEEP_AND_RETYPE',
    canonicalTitle: 'Bar Sinister',
    newType: 'nightclub',
    aliases: ['Club Bar Sinister', 'Bar Sinister'],
    confidence: 0.88,
    rulesFired: ['known_plan_bar_sinister'],
  },
  'catch one': {
    decision: 'KEEP',
    canonicalTitle: 'Catch One',
    newType: 'nightclub',
    aliases: ['Catch One the club'],
    confidence: 0.95,
    rulesFired: ['known_plan_catch_one'],
  },
  'the lab': {
    decision: 'DEMOTE_TO_CONTEXT_REFERENCE',
    canonicalTitle: 'the lab',
    targetEntityType: 'CONTEXT_REFERENCE',
    demoteReason: 'Generic workplace lab reference — promote only with resolved org/site evidence',
    confidence: 0.85,
    rulesFired: ['known_plan_generic_lab'],
  },
  ax: {
    decision: 'MOVE_TO_EVENT',
    canonicalTitle: 'Anime Expo',
    newType: 'convention',
    targetEntityType: 'EVENT',
    aliases: ['AX', 'Anime Expo'],
    confidence: 0.97,
    rulesFired: ['known_plan_anime_expo'],
  },
  'anime expo': {
    decision: 'MOVE_TO_EVENT',
    canonicalTitle: 'Anime Expo',
    newType: 'convention',
    targetEntityType: 'EVENT',
    aliases: ['AX', 'Anime Expo'],
    confidence: 0.97,
    rulesFired: ['known_plan_anime_expo'],
  },
  china: {
    decision: 'KEEP_AND_RETYPE',
    canonicalTitle: 'China',
    newType: 'country',
    confidence: 0.9,
    rulesFired: ['known_plan_country'],
  },
  downey: {
    decision: 'KEEP_AND_RETYPE',
    canonicalTitle: 'Downey',
    newType: 'city',
    confidence: 0.9,
    rulesFired: ['known_plan_city'],
  },
  'moms house': {
    decision: 'RENAME',
    canonicalTitle: "Mom's House",
    newType: 'private_residence',
    aliases: ['Moms House', "Mom's House"],
    confidence: 0.92,
    rulesFired: ['known_plan_moms_house'],
  },
  "mom's house": {
    decision: 'RENAME',
    canonicalTitle: "Mom's House",
    newType: 'private_residence',
    aliases: ['Moms House', "Mom's House"],
    confidence: 0.92,
    rulesFired: ['known_plan_moms_house'],
  },
  'moreno valley': {
    decision: 'KEEP_AND_RETYPE',
    canonicalTitle: 'Moreno Valley',
    newType: 'city',
    confidence: 0.92,
    rulesFired: ['known_plan_city'],
  },
  'club metro': {
    decision: 'KEEP_AND_RETYPE',
    canonicalTitle: 'Club Metro',
    newType: 'nightclub',
    confidence: 0.93,
    rulesFired: ['known_plan_nightclub'],
  },
  'first street pool': {
    decision: 'RENAME_AND_RETYPE',
    canonicalTitle: 'First Street Pool & Billiards',
    newType: 'pool_hall',
    aliases: ['First Street Pool', 'First Street Pool & Billiards', 'First Street Pool and Billiards'],
    confidence: 0.86,
    rulesFired: ['known_plan_first_street_pool'],
  },
  'first street pool & billiards': {
    decision: 'KEEP_AND_RETYPE',
    canonicalTitle: 'First Street Pool & Billiards',
    newType: 'pool_hall',
    aliases: ['First Street Pool'],
    confidence: 0.9,
    rulesFired: ['known_plan_first_street_pool'],
  },
  'mile square park': {
    decision: 'KEEP_AND_RETYPE',
    canonicalTitle: 'Mile Square Park',
    newType: 'park',
    aliases: ['Mile Square Regional Park', 'Mile Square Park'],
    confidence: 0.9,
    rulesFired: ['known_plan_park'],
    warnings: ['Formal title Mile Square Regional Park only if identity is unambiguous'],
  },
  anaheim: {
    decision: 'KEEP_AND_RETYPE',
    canonicalTitle: 'Anaheim',
    newType: 'city',
    confidence: 0.93,
    rulesFired: ['known_plan_city'],
  },
  'abuelas house': {
    decision: 'RENAME_AND_RETYPE',
    canonicalTitle: "Abuela's House",
    newType: 'private_residence',
    aliases: ['Abuelas House', "Abuela's House", 'Anaheim Family Home'],
    confidence: 0.9,
    rulesFired: ['known_plan_abuelas_house'],
  },
  "abuela's house": {
    decision: 'RENAME_AND_RETYPE',
    canonicalTitle: "Abuela's House",
    newType: 'private_residence',
    aliases: ['Abuelas House', "Abuela's House", 'Anaheim Family Home'],
    confidence: 0.9,
    rulesFired: ['known_plan_abuelas_house'],
  },
  'san diego': {
    decision: 'KEEP_AND_RETYPE',
    canonicalTitle: 'San Diego',
    newType: 'city',
    confidence: 0.7,
    rulesFired: ['known_plan_san_diego'],
    warnings: ['Archive if registry-only with zero evidence'],
  },
  'my home': {
    decision: 'DEMOTE_TO_CONTEXT_REFERENCE',
    canonicalTitle: 'My Home',
    targetEntityType: 'CONTEXT_REFERENCE',
    demoteReason: 'Temporal residence alias — not a permanent canonical place',
    confidence: 0.9,
    rulesFired: ['known_plan_temporal_home'],
  },
  'selfie car': {
    decision: 'MOVE_TO_OBJECT',
    canonicalTitle: 'Selfie Car',
    targetEntityType: 'VEHICLE',
    confidence: 0.96,
    rulesFired: ['known_plan_vehicle'],
  },
  'loud house': {
    decision: 'NEEDS_REVIEW',
    canonicalTitle: 'Loud House',
    confidence: 0.35,
    rulesFired: ['known_plan_loud_house_ambiguous'],
    warnings: ['Could be house, venue nickname, media title, or parser artifact'],
  },
  'catch one vibes': {
    decision: 'ARCHIVE_INVALID',
    canonicalTitle: 'Catch One Vibes',
    demoteReason: 'Mood/theme derived from Catch One — not a Place',
    confidence: 0.97,
    rulesFired: ['known_plan_vibes_artifact'],
  },
  'catch one and club metro': {
    decision: 'SPLIT',
    canonicalTitle: 'Catch One and Club Metro',
    splitNames: ['Catch One', 'Club Metro'],
    confidence: 0.98,
    rulesFired: ['known_plan_composite_split'],
  },
  'goth scene': {
    decision: 'MOVE_TO_COMMUNITY',
    canonicalTitle: 'Goth Scene',
    targetEntityType: 'SOCIAL_SCENE',
    confidence: 0.97,
    rulesFired: ['known_plan_social_scene'],
  },
  "khalil's desk neighbor": {
    decision: 'MOVE_TO_PERSON',
    canonicalTitle: "Khalil's desk neighbor",
    targetEntityType: 'UNRESOLVED_PERSON',
    confidence: 0.96,
    rulesFired: ['known_plan_unresolved_person'],
  },
  dtla: {
    decision: 'RENAME_AND_RETYPE',
    canonicalTitle: 'Downtown Los Angeles',
    newType: 'district',
    aliases: ['DTLA', 'Downtown LA', 'Downtown Los Angeles'],
    confidence: 0.93,
    rulesFired: ['known_plan_dtla'],
  },
  'downtown los angeles': {
    decision: 'KEEP_AND_RETYPE',
    canonicalTitle: 'Downtown Los Angeles',
    newType: 'district',
    aliases: ['DTLA'],
    confidence: 0.93,
    rulesFired: ['known_plan_dtla'],
  },
  'bad dogg compound': {
    decision: 'KEEP_AND_RETYPE',
    canonicalTitle: 'Bad Dogg Compound',
    newType: 'event_space',
    confidence: 0.88,
    rulesFired: ['known_plan_diy_venue'],
  },
  csuf: {
    decision: 'RENAME_AND_RETYPE',
    canonicalTitle: 'California State University, Fullerton',
    newType: 'university',
    aliases: ['CSUF', 'Cal State Fullerton', 'California State University, Fullerton'],
    confidence: 0.95,
    rulesFired: ['known_plan_csuf'],
  },
  'california state university, fullerton': {
    decision: 'KEEP_AND_RETYPE',
    canonicalTitle: 'California State University, Fullerton',
    newType: 'university',
    aliases: ['CSUF', 'Cal State Fullerton'],
    confidence: 0.95,
    rulesFired: ['known_plan_csuf'],
  },
  "abuela's costco": {
    decision: 'DEMOTE_TO_CONTEXT_REFERENCE',
    canonicalTitle: "Abuela's Costco",
    targetEntityType: 'CONTEXT_REFERENCE',
    demoteReason: 'Informal relational store label — resolve to a branch before canon',
    confidence: 0.9,
    rulesFired: ['known_plan_relational_store'],
  },
  "tio juan's doctor": {
    decision: 'MOVE_TO_PERSON',
    canonicalTitle: "Tío Juan's Doctor",
    targetEntityType: 'UNRESOLVED_PERSON',
    confidence: 0.96,
    rulesFired: ['known_plan_doctor_person'],
  },
  "tío juan's doctor": {
    decision: 'MOVE_TO_PERSON',
    canonicalTitle: "Tío Juan's Doctor",
    targetEntityType: 'UNRESOLVED_PERSON',
    confidence: 0.96,
    rulesFired: ['known_plan_doctor_person'],
  },
};

function resolveSplitTargets(
  names: string[],
  knownPlaceIdsByName?: Map<string, string>,
): Array<{ name: string; existingId?: string }> {
  return names.map((name) => {
    const id = knownPlaceIdsByName?.get(normalizeNameKey(name));
    return id ? { name, existingId: id } : { name };
  });
}

/**
 * Pure reclassification for one place record.
 */
export function reclassifyPlaceRecord(input: ReclassifyInput): PlaceMigrationPlanItem {
  const key = normalizeNameKey(input.name);
  const known = KNOWN_PLANS[key];
  const warnings: string[] = [];
  const rulesFired: string[] = [];

  if (known) {
    rulesFired.push(...known.rulesFired);
    if (known.warnings) warnings.push(...known.warnings);

    const item: PlaceMigrationPlanItem = {
      placeId: input.placeId,
      originalTitle: input.name,
      decision: known.decision,
      canonicalTitle: known.canonicalTitle,
      oldType: input.type,
      newType: known.newType,
      targetEntityType: known.targetEntityType,
      aliases: known.aliases,
      demoteReason: known.demoteReason,
      confidence: known.confidence,
      warnings,
      rulesFired,
    };

    if (known.splitNames?.length) {
      item.splitTargets = resolveSplitTargets(known.splitNames, input.knownPlaceIdsByName);
    }

    if (known.decision === 'DEMOTE_TO_CONTEXT_REFERENCE' && key === 'my home') {
      item.temporalAlias = {
        alias: 'my home',
        confidence: 0.4,
        evidenceIds: [],
      };
    }

    return item;
  }

  // Heuristic path for records outside the seed plan.
  const guard = guardPlaceWrongDomain(input.name, input.evidenceText ?? '');
  if (!guard.allowed) {
    const rejected = String(guard.rejectedAs || '').toUpperCase();
    rulesFired.push(...guard.rulesFired, 'wrong_domain_guard');

    if (rejected.includes('SKILL') || rejected.includes('FIELD') || rejected.includes('DISCIPLINE')) {
      return {
        placeId: input.placeId,
        originalTitle: input.name,
        decision: 'MOVE_TO_FIELD',
        canonicalTitle: input.name.trim(),
        oldType: input.type,
        targetEntityType: 'FIELD_OF_STUDY',
        confidence: Math.max(0.8, guard.confidence),
        warnings,
        rulesFired,
      };
    }
    if (rejected.includes('EVENT')) {
      const canon = resolvePlaceCanonical(input.name, input.type ?? undefined);
      return {
        placeId: input.placeId,
        originalTitle: input.name,
        decision: 'MOVE_TO_EVENT',
        canonicalTitle: canon.canonicalTitle,
        oldType: input.type,
        newType: canon.subtype ?? 'event',
        targetEntityType: 'EVENT',
        aliases: canon.aliases,
        confidence: Math.max(0.8, guard.confidence),
        warnings,
        rulesFired: [...rulesFired, ...canon.rulesFired],
      };
    }
    if (rejected.includes('PERSON') || rejected.includes('ROLE')) {
      return {
        placeId: input.placeId,
        originalTitle: input.name,
        decision: 'MOVE_TO_PERSON',
        canonicalTitle: input.name.trim(),
        oldType: input.type,
        targetEntityType: 'UNRESOLVED_PERSON',
        confidence: Math.max(0.8, guard.confidence),
        warnings,
        rulesFired,
      };
    }
    if (rejected.includes('OBJECT') || rejected.includes('VEHICLE') || rejected.includes('PRODUCT')) {
      return {
        placeId: input.placeId,
        originalTitle: input.name,
        decision: 'MOVE_TO_OBJECT',
        canonicalTitle: input.name.trim(),
        oldType: input.type,
        targetEntityType: rejected.includes('VEHICLE') ? 'VEHICLE' : 'NAMED_OBJECT',
        confidence: Math.max(0.8, guard.confidence),
        warnings,
        rulesFired,
      };
    }
    if (rejected.includes('COMMUNITY') || rejected.includes('SCENE')) {
      return {
        placeId: input.placeId,
        originalTitle: input.name,
        decision: 'MOVE_TO_COMMUNITY',
        canonicalTitle: input.name.trim(),
        oldType: input.type,
        targetEntityType: 'SOCIAL_SCENE',
        confidence: Math.max(0.8, guard.confidence),
        warnings,
        rulesFired,
      };
    }
  }

  const compound = detectCompoundPlaceNames(input.name);
  if (compound) {
    rulesFired.push('compound_place_names');
    return {
      placeId: input.placeId,
      originalTitle: input.name,
      decision: 'SPLIT',
      canonicalTitle: input.name.trim(),
      oldType: input.type,
      splitTargets: resolveSplitTargets(compound, input.knownPlaceIdsByName),
      confidence: 0.9,
      warnings,
      rulesFired,
    };
  }

  if (isGenericPlaceNoun(input.name) || /^(?:home|my home|the lab)$/i.test(input.name.trim())) {
    rulesFired.push('generic_or_temporal_reference');
    return {
      placeId: input.placeId,
      originalTitle: input.name,
      decision: 'DEMOTE_TO_CONTEXT_REFERENCE',
      canonicalTitle: input.name.trim(),
      oldType: input.type,
      targetEntityType: 'CONTEXT_REFERENCE',
      demoteReason: 'Generic or temporal place reference',
      confidence: 0.8,
      warnings,
      rulesFired,
    };
  }

  if (/\bvibes?\b$/i.test(input.name.trim())) {
    rulesFired.push('vibes_suffix');
    return {
      placeId: input.placeId,
      originalTitle: input.name,
      decision: 'ARCHIVE_INVALID',
      canonicalTitle: input.name.trim(),
      oldType: input.type,
      demoteReason: 'Mood/theme phrase is not a Place',
      confidence: 0.9,
      warnings,
      rulesFired,
    };
  }

  const canon = resolvePlaceCanonical(input.name, input.type ?? undefined);
  rulesFired.push(...canon.rulesFired);

  if (canon.entityKind === 'EVENT' || canon.entityKind === 'EVENT_SERIES') {
    return {
      placeId: input.placeId,
      originalTitle: input.name,
      decision: 'MOVE_TO_EVENT',
      canonicalTitle: canon.canonicalTitle,
      oldType: input.type,
      newType: canon.subtype ?? 'event',
      targetEntityType: 'EVENT',
      aliases: canon.aliases,
      confidence: 0.85,
      warnings,
      rulesFired,
    };
  }

  const genericType = !input.type || ['place', 'unknown', 'other', 'venue'].includes(String(input.type).toLowerCase());
  if (genericType && canon.subtype) {
    return {
      placeId: input.placeId,
      originalTitle: input.name,
      decision: 'KEEP_AND_RETYPE',
      canonicalTitle: canon.canonicalTitle,
      oldType: input.type,
      newType: canon.subtype,
      aliases: canon.aliases,
      confidence: 0.7,
      warnings,
      rulesFired: [...rulesFired, 'generic_type_retype'],
    };
  }

  return {
    placeId: input.placeId,
    originalTitle: input.name,
    decision: 'KEEP',
    canonicalTitle: canon.canonicalTitle || input.name.trim(),
    oldType: input.type,
    newType: canon.subtype ?? input.type ?? undefined,
    aliases: canon.aliases,
    confidence: 0.6,
    warnings,
    rulesFired: [...rulesFired, 'default_keep'],
  };
}

export function listKnownMigrationPlanKeys(): string[] {
  return Object.keys(KNOWN_PLANS);
}
