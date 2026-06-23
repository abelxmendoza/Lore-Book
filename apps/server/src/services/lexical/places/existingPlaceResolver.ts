import { canonicalPlaceKey, samePlaceName } from './placeDuplicateGuard';
import { evaluatePlaceMergeCompatibility } from './placeMergeCompatibilityService';
import {
  type KnownPlaceRecord,
  type PlaceMergeCandidate,
  type PlaceSuggestionOptions,
  type PlaceTaxonomyType,
} from './placeSuggestionTypes';

function recordsFromOptions(options?: PlaceSuggestionOptions): KnownPlaceRecord[] {
  const records = [...(options?.existingPlaces ?? [])];

  for (const name of options?.knownPlaces ?? []) {
    if (records.some((r) => samePlaceName(r.displayName, name))) continue;
    records.push({
      displayName: name,
      placeType: options?.knownPlaceTypes?.get(name) ?? options?.knownPlaceTypes?.get(canonicalPlaceKey(name)),
    });
  }

  return records;
}

export type ExistingPlaceResolution = {
  exact?: KnownPlaceRecord;
  compatibleDuplicates: PlaceMergeCandidate[];
  incompatibleDuplicates: PlaceMergeCandidate[];
};

export function resolveExistingPlace(
  displayName: string,
  placeType: PlaceTaxonomyType | string,
  options?: PlaceSuggestionOptions,
): ExistingPlaceResolution {
  const compatibleDuplicates: PlaceMergeCandidate[] = [];
  const incompatibleDuplicates: PlaceMergeCandidate[] = [];

  for (const record of recordsFromOptions(options)) {
    const names = [record.displayName, ...(record.aliases ?? [])];
    if (!names.some((name) => samePlaceName(displayName, name))) continue;

    const compatibility = evaluatePlaceMergeCompatibility(placeType, record.placeType);
    const candidate: PlaceMergeCandidate = {
      id: record.id,
      displayName: record.displayName,
      placeType: record.placeType,
      normalizedText: canonicalPlaceKey(record.displayName),
      compatibility: compatibility.compatible ? 'allowed' : 'rejected',
      reason: compatibility.reason,
    };

    if (compatibility.compatible) compatibleDuplicates.push(candidate);
    else incompatibleDuplicates.push(candidate);
  }

  return {
    exact: compatibleDuplicates[0]
      ? {
          id: compatibleDuplicates[0].id,
          displayName: compatibleDuplicates[0].displayName,
          placeType: compatibleDuplicates[0].placeType,
        }
      : undefined,
    compatibleDuplicates,
    incompatibleDuplicates,
  };
}
