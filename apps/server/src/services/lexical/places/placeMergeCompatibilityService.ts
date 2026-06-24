import { type PlaceTaxonomyType } from './placeSuggestionTypes';

const FAMILY: Record<string, string> = {
  city: 'civic',
  city_or_region: 'civic',
  district: 'civic',
  neighborhood: 'civic',
  state: 'civic',
  country: 'civic',
  private_residence: 'residence',
  family_home: 'residence',
  school: 'education',
  middle_school: 'education',
  high_school: 'education',
  university: 'education',
  campus: 'education',
  event_space: 'venue',
  music_venue: 'venue',
  nightclub: 'venue',
  bar: 'venue',
  stadium: 'venue',
  convention_center: 'venue',
  festival_ground: 'venue',
  store: 'commerce',
  pharmacy: 'commerce',
  restaurant: 'commerce',
};

const ALLOWED_ALIAS_PAIRS = new Set([
  'city_or_region:city',
  'district:neighborhood',
  'university:campus',
  'private_residence:family_home',
  'event_space:music_venue',
  'nightclub:music_venue',
]);

export type MergeCompatibilityResult = {
  compatible: boolean;
  reason: string;
};

/** The coarse merge family for a place subtype ('residence' | 'civic' | … | undefined). */
export function placeFamilyOf(subtype?: PlaceTaxonomyType | string): string | undefined {
  return subtype ? FAMILY[subtype] : undefined;
}

export function evaluatePlaceMergeCompatibility(
  left?: PlaceTaxonomyType | string,
  right?: PlaceTaxonomyType | string,
): MergeCompatibilityResult {
  if (!left || !right) return { compatible: true, reason: 'unknown_type_review' };
  if (left === right) return { compatible: true, reason: 'same_subtype' };

  const ordered = [left, right].sort().join(':');
  if (ALLOWED_ALIAS_PAIRS.has(ordered)) return { compatible: true, reason: 'compatible_alias_subtypes' };

  const leftFamily = FAMILY[left];
  const rightFamily = FAMILY[right];
  if (!leftFamily || !rightFamily) return { compatible: false, reason: 'unknown_or_unsupported_subtype' };
  if (leftFamily !== rightFamily) return { compatible: false, reason: `${leftFamily}_vs_${rightFamily}` };

  return { compatible: true, reason: 'same_family' };
}
