import { expect } from 'vitest';
import type { LexicalAnalysisResult } from '../../src/services/lexical/lexicalTypes';
import type { MeaningResolutionResult } from '../../src/services/meaning/meaningResolutionTypes';
import type { InferenceAssociationResult } from '../../src/services/inference/inferenceAssociationTypes';
import type { ChatSuggestedAction } from '../../src/services/omegaChatService';
import { TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_TEXT } from '../../src/services/lexical/travelContextLexical';

export const TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_ID = 'travel_japan_school_japanese_class';
export { TRAVEL_JAPAN_SCHOOL_JAPANESE_CLASS_TEXT };

export function assertTravelJapanLexicalSnapshot(result: LexicalAnalysisResult): void {
  const surfaces = result.entities.map((e) => e.surface);
  expect(surfaces.some((s) => /^Japan$/i.test(s)), 'expected PLACE Japan').toBe(true);
  expect(surfaces.some((s) => /last summer/i.test(s)), 'expected TIME last summer').toBe(true);
  expect(
    surfaces.some((s) => /favorite summer clothes/i.test(s)),
    'expected PREFERENCE favorite summer clothes'
  ).toBe(true);
  expect(
    result.entities.some((e) => e.type === 'GROUP' && /Japanese Class/i.test(e.surface)),
    'expected GROUP Japanese Class'
  ).toBe(true);
  expect(
    result.entities.some((e) => e.type === 'SKILL' && /Japanese/i.test(e.surface)),
    'expected SKILL/LANGUAGE Japanese'
  ).toBe(true);

  const japanPlace = result.places.find((p) => /japan/i.test(p.name));
  expect(japanPlace?.category).toBe('country');

  expect(result.events.map((e) => e.kind)).toContain('travel');
  expect(result.ambiguityFlags.join(' ')).toMatch(/last_summer|preference|school/i);
}

export function assertTravelJapanMeaningSnapshot(result: MeaningResolutionResult): void {
  expect(result.factuality).toBe('fact');
  expect(result.temporalContext.defaultStatus).toBe('past');
  expect(String(result.temporalContext.startHint ?? '')).toMatch(/last summer/i);

  const travelStmt = result.temporalContext.statements.find(
    (s) => s.predicate === 'traveled_to' && /Japan/i.test(s.object)
  );
  expect(travelStmt, 'expected traveled_to Japan').toBeDefined();

  const travelEvent = result.resolvedEvents.find((e) => e.kind === 'travel');
  expect(travelEvent).toBeDefined();
  expect(travelEvent?.timeHint).toMatch(/last summer/i);
  expect(String(travelEvent?.title ?? '')).not.toMatch(/\d{4}-\d{2}-\d{2}/);

  expect(
    result.ambiguities.some((a) => /last_summer|preference|school_name/i.test(a.code))
  ).toBe(true);
}

export function assertTravelJapanInferenceSnapshot(result: InferenceAssociationResult): void {
  const classGroup = result.inferredGroups.find((g) => /Japanese Class/i.test(g.name));
  expect(classGroup, 'expected Japanese Class group candidate').toBeDefined();
  expect(classGroup?.type).toBe('school_class');
  expect(classGroup?.inferredNotConfirmed).toBe(true);

  expect(
    result.inferredRelationships.some(
      (r) => r.subjectName === 'user' && r.relationshipType === 'member_of' && /Japanese Class/i.test(r.objectName)
    )
  ).toBe(true);

  const interests = result.inferredSkills.filter((s) => s.subjectKind === 'user');
  expect(interests.some((s) => /Japanese language/i.test(s.skill))).toBe(true);
  expect(interests.some((s) => /Japanese culture/i.test(s.skill))).toBe(true);
  expect(interests.every((s) => s.inferredNotConfirmed)).toBe(true);

  expect(result.inferredEvents.some((e) => e.kind === 'travel' && /Japan/i.test(e.title ?? e.place ?? ''))).toBe(true);

  expect(
    result.ambiguities.some((a) => /school|preference|weather/i.test(a.code))
  ).toBe(true);

  const inventedSchool = result.inferredGroups.find(
    (g) => g.type === 'school' && !/unknown/i.test(g.name) && g.name !== 'Unknown School'
  );
  expect(inventedSchool, 'must not invent school name from "my school" alone').toBeUndefined();
}

export function assertTravelJapanActionChips(actions: ChatSuggestedAction[]): void {
  const labels = actions.map((a) => a.label);
  expect(labels.some((l) => /Japanese Class/i.test(l))).toBe(true);
  expect(labels.some((l) => /Japan trip|school trip/i.test(l))).toBe(true);
}

export function assertTravelJapanPreviewSpans(spans: Array<{ text: string; type: string; colorKey: string }>): void {
  const find = (re: RegExp, type?: string) =>
    spans.find((s) => re.test(s.text) && (!type || s.type === type));

  expect(find(/^Japan$/i, 'PLACE')?.colorKey).toBe('place');
  expect(find(/last summer/i, 'TIME_PERIOD')?.colorKey).toBe('time');
  expect(find(/favorite summer clothes/i, 'PREFERENCE')?.colorKey).toBe('preference');
  expect(find(/school.*Japanese Class/i, 'GROUP')?.colorKey).toBe('group');
  expect(find(/Japanese/i, 'LANGUAGE')?.colorKey).toBe('language');
}
