import { expect } from 'vitest';
import type { LexicalPreviewResult } from '../../src/services/lexical/lexicalPreviewService';

/**
 * Fixture: lost close-friend / LA music-scene memory.
 *
 * Oscar Trujio — best friend, ska shows, Code Red, before the Pandemic.
 */
export const LOST_BEST_FRIEND_LA_SHOWS_SKA_SCENE_ID =
  'lost_best_friend_la_shows_ska_scene';

export const LOST_BEST_FRIEND_LA_SHOWS_SKA_SCENE_TEXT =
  "Oscar Trujio was my best friend. I havent seen him since before the Pandemic. " +
  "We used to go to shows in LA all the time. We went to Code Red and a bunch of ska shows. " +
  "I've never had any other friends like him since.";

const span = (result: LexicalPreviewResult, re: RegExp) =>
  result.spans.find((s) => re.test(s.text));

export function assertOscarPreviewSpans(result: LexicalPreviewResult): void {
  const person = span(result, /^Oscar Trujio$/);
  expect(person, 'PERSON Oscar Trujio').toBeDefined();
  expect(person!.type).toBe('PERSON');
  expect(person!.colorKey).toBe('person');
  expect(person!.entityStatus, 'Oscar is new until indexed').toBe('new');

  const relationship = span(result, /best friend/i);
  expect(relationship, 'RELATIONSHIP best friend').toBeDefined();
  expect(relationship!.type).toBe('RELATIONSHIP');
  expect(relationship!.colorKey).toBe('relationship');

  const pandemic = span(result, /before the Pandemic/i);
  expect(pandemic, 'TIME before the Pandemic').toBeDefined();
  expect(pandemic!.colorKey).toBe('time');
  expect(pandemic!.needsReview).toBe(true);

  const laShows = span(result, /go to shows in LA/i);
  expect(laShows, 'RECURRING_EVENT shows in LA').toBeDefined();
  expect(laShows!.type).toBe('EVENT');
  expect(laShows!.subtype).toBe('RECURRING_EVENT');
  expect(laShows!.parentContext, 'LA embedded in recurring event').toMatch(/PLACE:\s*LA/);

  const codeRed = span(result, /Code Red/i);
  expect(codeRed, 'AFTERS_RAVE_EVENT_SERIES Code Red').toBeDefined();
  expect(codeRed!.subtype).toBe('AFTERS_RAVE_EVENT_SERIES');
  expect(codeRed!.needsReview, 'canonical event series does not need venue review').not.toBe(true);

  const ska = span(result, /ska shows?/i);
  expect(ska, 'INTEREST ska shows').toBeDefined();
  expect(ska!.colorKey).toBe('interest');

  const emotional = span(result, /never had .* friends like him/i);
  expect(emotional, 'EMOTIONAL_SIGNIFICANCE').toBeDefined();
  expect(emotional!.type).toBe('EMOTIONAL_SIGNIFICANCE');
  expect(emotional!.colorKey).toBe('emotional_significance');
  expect(emotional!.needsReview).toBe(true);

  expect(result.spans.filter((s) => s.colorKey === 'uncertain'), 'no uncertain leftovers').toEqual([]);
}

export function assertOscarInference(result: LexicalPreviewResult): void {
  const labels = result.inferredAssociations.map((a) => a.label.toLowerCase());

  expect(labels.some((l) => /shared_music_scene_history/.test(l)), 'shared music history').toBe(true);
  expect(labels.some((l) => /la ska.*show scene/.test(l)), 'LA scene community').toBe(true);
  expect(labels.some((l) => /interest.*ska/.test(l)), 'ska interest').toBe(true);
  expect(labels.some((l) => /values_relationship_with.*oscar/.test(l)), 'emotional bond').toBe(true);

  expect(result.inferredAssociations.every((a) => a.inferredNotConfirmed === true)).toBe(true);
  expect(result.ambiguities).toContain('absence_not_cause_inferred');
  expect(result.ambiguities).not.toContain('death_inferred');
}

export function assertOscarKnownWhenIndexed(result: LexicalPreviewResult): void {
  const person = span(result, /^Oscar Trujio$/);
  expect(person!.entityStatus).toBe('known');
  expect(person!.matchedEntityName).toBe('Oscar Trujio');
}
