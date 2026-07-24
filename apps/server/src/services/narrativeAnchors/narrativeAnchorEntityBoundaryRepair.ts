/**
 * Entity boundary repair — possessives belong on places/groups, not people.
 */

import type { EntityBoundaryRepair } from './narrativeAnchorCognitionTypes';

const PLACE_SUFFIX =
  /\b(house|home|apartment|apt|place|household|compound|residence|condo)\b/i;

/**
 * Repair "Tío Ralph's" / "Tío Ralph's House" into person + place.
 */
export function repairEntityBoundary(surface: string): EntityBoundaryRepair {
  const original = (surface ?? '').trim();
  const reasons: string[] = [];
  if (!original) {
    return { original, repaired: false, reasons: ['empty'] };
  }

  // "... house/household" with possessive person
  const placeMatch = original.match(
    /^(.+?)['’]s\s+(house|home|apartment|apt|place|household|compound|residence|condo)\b(.*)$/i,
  );
  if (placeMatch) {
    const person = placeMatch[1]!.trim();
    const placeType = placeMatch[2]!;
    const rest = (placeMatch[3] ?? '').trim();
    const placeName = `${person}'s ${placeType.charAt(0).toUpperCase()}${placeType.slice(1).toLowerCase()}${rest ? ` ${rest}` : ''}`.trim();
    reasons.push('possessive_place_split');
    return {
      original,
      personName: person,
      placeName,
      householdName: /household/i.test(placeType) ? placeName : undefined,
      repaired: true,
      reasons,
    };
  }

  // Trailing possessive only: "Tío Ralph's"
  if (/['’]s$/i.test(original) && !PLACE_SUFFIX.test(original)) {
    const person = original.replace(/['’]s$/i, '').trim();
    reasons.push('strip_trailing_possessive_from_person');
    return {
      original,
      personName: person,
      residual: original,
      repaired: true,
      reasons,
    };
  }

  // "X's Family" / "X's Household" group forms
  const groupMatch = original.match(/^(.+?)['’]s\s+(family|household|crew|circle)\b$/i);
  if (groupMatch) {
    const person = groupMatch[1]!.trim();
    const group = groupMatch[2]!;
    reasons.push('possessive_group_split');
    return {
      original,
      personName: person,
      householdName: /household/i.test(group) ? original : undefined,
      residual: original,
      repaired: true,
      reasons,
    };
  }

  return { original, personName: original, repaired: false, reasons: ['no_repair_needed'] };
}

export function repairPeopleNames(peopleNames: string[]): {
  people: string[];
  places: string[];
  households: string[];
  repairs: EntityBoundaryRepair[];
} {
  const people: string[] = [];
  const places: string[] = [];
  const households: string[] = [];
  const repairs: EntityBoundaryRepair[] = [];

  for (const name of peopleNames) {
    const r = repairEntityBoundary(name);
    repairs.push(r);
    if (r.personName) people.push(r.personName);
    if (r.placeName) places.push(r.placeName);
    if (r.householdName) households.push(r.householdName);
  }

  return {
    people: [...new Set(people)],
    places: [...new Set(places)],
    households: [...new Set(households)],
    repairs,
  };
}
