/**
 * Map cleaned spans to LoreBook place taxonomy slugs.
 */

import {
  BRAND_STORES,
  KNOWN_CITIES,
  SCHOOL_ABBREVS,
  VENUE_COMPOUND_SUFFIX,
  type PlaceTaxonomyType,
} from './placeSuggestionTypes';

const norm = (s: string) =>
  (s ?? '').toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim();

export type TaxonomyClassification = {
  placeType: PlaceTaxonomyType;
  confidence: number;
  rulesFired: string[];
};

export function classifyPlaceTaxonomy(span: string, context = ''): TaxonomyClassification {
  const text = span.trim();
  const n = norm(text);
  const haystack = `${n} ${norm(context)}`;
  const rulesFired: string[] = [];

  if (BRAND_STORES.has(n)) {
    return { placeType: 'store', confidence: 0.92, rulesFired: ['brand_store'] };
  }

  if (SCHOOL_ABBREVS.has(n)) {
    return { placeType: 'university', confidence: 0.9, rulesFired: ['school_abbrev'] };
  }

  if (KNOWN_CITIES.has(n)) {
    return { placeType: 'city', confidence: 0.88, rulesFired: ['known_city'] };
  }

  if (/\b(university|college|campus)\b/i.test(haystack)) {
    rulesFired.push('university_keyword');
    return { placeType: 'university', confidence: 0.85, rulesFired };
  }

  if (/\b(bootcamp|academy|school)\b/i.test(haystack) && !/\b(at|in|near)\s/.test(context)) {
    rulesFired.push('education_keyword');
    return { placeType: 'school', confidence: 0.7, rulesFired };
  }

  if (/\b(gym|dojo|fitness)\b/i.test(haystack)) {
    return { placeType: /\bdojo\b/i.test(haystack) ? 'dojo' : 'gym', confidence: 0.82, rulesFired: ['fitness_keyword'] };
  }

  if (/\b(restaurant|diner|bistro)\b/i.test(haystack)) {
    return { placeType: 'restaurant', confidence: 0.82, rulesFired: ['restaurant_keyword'] };
  }

  if (/\b(bar|pub|lounge|nightclub)\b/i.test(haystack)) {
    const type: PlaceTaxonomyType = /\bnightclub\b/i.test(haystack) ? 'nightclub' : 'bar';
    return { placeType: type, confidence: 0.8, rulesFired: ['nightlife_keyword'] };
  }

  if (/\bclub\b/i.test(haystack) && /\b(metro|night|dance|music|jazz|comedy)\b/i.test(haystack)) {
    return { placeType: 'music_venue', confidence: 0.78, rulesFired: ['named_club_venue'] };
  }

  if (/\b(pharmacy|cvs|walgreens)\b/i.test(haystack)) {
    return { placeType: 'pharmacy', confidence: 0.85, rulesFired: ['pharmacy_keyword'] };
  }

  if (/\b(park|trail|beach)\b/i.test(haystack)) {
    return { placeType: 'park', confidence: 0.8, rulesFired: ['park_keyword'] };
  }

  if (/\b(office|workplace|warehouse)\b/i.test(haystack)) {
    const type: PlaceTaxonomyType = /\bwarehouse\b/i.test(haystack) ? 'worksite' : 'office';
    return { placeType: type, confidence: 0.78, rulesFired: ['workplace_keyword'] };
  }

  if (/\b(compound|warehouse|grounds|arena|stadium|convention)\b/i.test(haystack) || VENUE_COMPOUND_SUFFIX.test(n)) {
    const type: PlaceTaxonomyType = /\bstadium\b/i.test(haystack)
      ? 'stadium'
      : /\bconvention\b/i.test(haystack)
        ? 'convention_center'
        : 'event_space';
    return { placeType: type, confidence: 0.84, rulesFired: ['venue_compound'] };
  }

  if (/\b(house|home|apartment|residence|casa)\b/i.test(haystack) || /'s\s+(house|home)/i.test(text)) {
    return { placeType: 'private_residence', confidence: 0.86, rulesFired: ['residence_keyword'] };
  }

  if (/\b(street|st\.|avenue|ave\.|boulevard|blvd\.|road|rd\.)\b/i.test(haystack)) {
    return { placeType: 'street', confidence: 0.75, rulesFired: ['street_keyword'] };
  }

  if (/\b(neighborhood|district|barrio)\b/i.test(haystack)) {
    return { placeType: 'neighborhood', confidence: 0.75, rulesFired: ['neighborhood_keyword'] };
  }

  if (/\b(deployment|deployed|site)\b/i.test(haystack)) {
    return { placeType: 'deployment_site', confidence: 0.72, rulesFired: ['deployment_keyword'] };
  }

  if (/\b(discord|server|subreddit|online)\b/i.test(haystack)) {
    return { placeType: 'virtual_community', confidence: 0.7, rulesFired: ['virtual_keyword'] };
  }

  return { placeType: 'unknown_place', confidence: 0.45, rulesFired: ['fallback_unknown'] };
}
