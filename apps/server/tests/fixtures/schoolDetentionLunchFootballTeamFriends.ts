import { expect } from 'vitest';
import type { LexicalPreviewResult } from '../../src/services/lexical/lexicalPreviewService';

/**
 * Fixture: school / community inference with live entity color highlighting.
 *
 * "Abel Mendoza from the coding club at school got detention yesterday. I didn't
 *  see him at lunch break so I had to kick it with my friends from the football team"
 *
 * Exercises: PERSON, school club, school-discipline EVENT, relative + school-day
 * TIME, social friend subgroup, and the inferred community hierarchy.
 */
export const SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_ID =
  'school_detention_lunch_football_team_friends';

export const SCHOOL_DETENTION_LUNCH_FOOTBALL_TEAM_FRIENDS_TEXT =
  "Abel Mendoza from the coding club at school got detention yesterday. " +
  "I didn't see him at lunch break so I had to kick it with my friends from the football team";

const span = (result: LexicalPreviewResult, re: RegExp) =>
  result.spans.find((s) => re.test(s.text));

/** Assert the composer-preview colored spans (read-only; no DB writes). */
export function assertSchoolPreviewSpans(result: LexicalPreviewResult): void {
  const person = span(result, /^Abel Mendoza$/);
  expect(person, 'PERSON Abel Mendoza').toBeDefined();
  expect(person!.type).toBe('PERSON');
  expect(person!.colorKey).toBe('person');

  const club = span(result, /coding club at school/i);
  expect(club, 'GROUP coding club at school').toBeDefined();
  expect(club!.type).toBe('GROUP');
  expect(club!.subtype).toBe('SCHOOL_CLUB');
  expect(club!.colorKey).toBe('group');

  const detention = span(result, /^detention$/i);
  expect(detention, 'EVENT detention').toBeDefined();
  expect(detention!.type).toBe('EVENT');
  expect(detention!.subtype).toBe('SCHOOL_DISCIPLINE_EVENT');
  expect(detention!.colorKey).toBe('event');
  expect(detention!.needsReview, 'detention is review-first').toBe(true);

  const yesterday = span(result, /^yesterday$/i);
  expect(yesterday, 'TIME yesterday').toBeDefined();
  expect(yesterday!.colorKey).toBe('time');
  expect(yesterday!.subtype).toBe('RELATIVE_DATE');

  const lunch = span(result, /lunch break/i);
  expect(lunch, 'TIME lunch break').toBeDefined();
  expect(lunch!.colorKey).toBe('time');
  expect(lunch!.subtype).toBe('SCHOOL_DAY_TIME');

  const friends = span(result, /friends from the football team/i);
  expect(friends, 'GROUP friends from football team').toBeDefined();
  expect(friends!.type).toBe('GROUP');
  expect(friends!.subtype).toBe('SOCIAL_GROUP');
  expect(friends!.colorKey).toBe('group');

  // No stray nightclub / bare-team / "my friends" duplicates survive the merge.
  expect(result.spans.filter((s) => s.colorKey === 'uncertain'), 'no uncertain leftovers').toEqual([]);
}

/** Assert the inferred community hierarchy (soft associations, review-first). */
export function assertSchoolHierarchy(result: LexicalPreviewResult): void {
  const labels = result.inferredAssociations.map((a) => a.label.toLowerCase());

  expect(labels.some((l) => /coding club.*subgroup_of.*school community/.test(l)), 'club → school community').toBe(true);
  expect(labels.some((l) => /football team.*subgroup_of.*school community/.test(l)), 'team → school community').toBe(true);
  expect(labels.some((l) => /friends.*football team.*subgroup_of.*football team/.test(l)), 'friends → football team').toBe(true);
  expect(labels.some((l) => /user.*associated_with.*friends/.test(l)), 'user → friends group').toBe(true);

  // Every inferred association is soft / review-first.
  expect(result.inferredAssociations.every((a) => a.inferredNotConfirmed === true)).toBe(true);
}
