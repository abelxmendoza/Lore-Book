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
    if (n === "denny's hollywood" || n === 'dennys hollywood') {
      const type: PlaceTaxonomyType = /\b(work|shift|deployed|deployment|site)\b/i.test(context)
        ? 'deployment_site'
        : 'worksite';
      return { placeType: type, confidence: 0.88, rulesFired: ['dennys_hollywood_worksite'] };
    }
    return { placeType: 'store', confidence: 0.92, rulesFired: ['brand_store'] };
  }

  if (SCHOOL_ABBREVS.has(n)) {
    return { placeType: n === 'csuf' ? 'campus' : 'university', confidence: 0.9, rulesFired: ['school_abbrev'] };
  }

  if (n === 'la') {
    return { placeType: 'city_or_region', confidence: 0.9, rulesFired: ['la_alias_city_or_region'] };
  }

  if (n === 'dtla' || n === 'downtown la' || n === 'downtown los angeles') {
    return { placeType: 'district', confidence: 0.9, rulesFired: ['district_alias'] };
  }

  if (KNOWN_CITIES.has(n)) {
    return { placeType: 'city', confidence: 0.88, rulesFired: ['known_city'] };
  }

  if (n === 'california state university, fullerton' || n === 'california state university fullerton') {
    return { placeType: 'university', confidence: 0.92, rulesFired: ['known_university'] };
  }

  if (n === 'whittier christian middle school') {
    return { placeType: 'middle_school', confidence: 0.92, rulesFired: ['known_middle_school'] };
  }

  if (n === 'bad dogg compound') {
    return { placeType: 'event_space', confidence: 0.9, rulesFired: ['known_event_space'] };
  }

  if (n === 'club nova') {
    return { placeType: 'nightclub', confidence: 0.88, rulesFired: ['known_nightclub'] };
  }

  if (/\b(university|college|campus)\b/i.test(haystack)) {
    rulesFired.push('university_keyword');
    return { placeType: 'university', confidence: 0.85, rulesFired };
  }

  if (/\b(bootcamp|academy|school)\b/i.test(haystack) && !/\b(at|in|near)\s/.test(context)) {
    const type: PlaceTaxonomyType = /\bmiddle\s+school\b/i.test(haystack)
      ? 'middle_school'
      : /\bhigh\s+school\b/i.test(haystack)
        ? 'high_school'
        : 'school';
    rulesFired.push('education_keyword');
    return { placeType: type, confidence: 0.78, rulesFired };
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

  if (/\bclub\b/i.test(haystack) && /\b(goth|night|dance|music|jazz|comedy)\b/i.test(haystack)) {
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
    return { placeType: 'virtual_location', confidence: 0.7, rulesFired: ['virtual_keyword'] };
  }

  return { placeType: 'unknown_place', confidence: 0.45, rulesFired: ['fallback_unknown'] };
}
