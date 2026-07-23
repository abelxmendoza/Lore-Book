import type { PlaceEligibilityResult, PlaceEntityKind } from './placeTypes';

export function evaluatePlaceEligibility(input: {
  entityKind: PlaceEntityKind;
  clearBoundary: boolean;
  sourceAllowed: boolean;
  spatialMeaning: boolean;
  notMerelyDescriptive: boolean;
  syntheticNarration: boolean;
}): PlaceEligibilityResult {
  const persistentLocation = input.entityKind === 'PLACE';
  const reasons: string[] = [];

  if (input.syntheticNarration) reasons.push('synthetic_narration');
  if (!input.sourceAllowed) reasons.push('source_not_user_authored');
  if (!input.clearBoundary) reasons.push('unclear_boundary');
  if (!input.spatialMeaning) reasons.push('not_spatial');
  if (!input.notMerelyDescriptive) reasons.push('merely_descriptive');
  if (input.entityKind === 'FRAGMENT') reasons.push('fragment');
  if (input.entityKind === 'GENERIC_REFERENCE') reasons.push('generic_location_hold');
  if (input.entityKind === 'EVENT' || input.entityKind === 'EVENT_SERIES') {
    reasons.push(`route_${input.entityKind.toLowerCase()}`);
  }
  if (input.entityKind === 'SYNTHETIC_NARRATION') reasons.push('synthetic_narration');
  if (input.entityKind === 'NON_PLACE') reasons.push('non_place');
  if (!persistentLocation && input.entityKind === 'ORGANIZATION') {
    reasons.push('organization_not_place');
  }

  // Eligible only for durable places with clean boundaries and user evidence.
  const eligible =
    persistentLocation
    && input.clearBoundary
    && input.sourceAllowed
    && input.spatialMeaning
    && input.notMerelyDescriptive
    && !input.syntheticNarration;

  return {
    eligible,
    persistentLocation,
    spatialMeaning: input.spatialMeaning,
    clearBoundary: input.clearBoundary,
    userAuthoredEvidence: input.sourceAllowed,
    notMerelyDescriptive: input.notMerelyDescriptive,
    reasons,
  };
}
