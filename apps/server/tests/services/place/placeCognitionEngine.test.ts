import { describe, expect, it } from 'vitest';

import { resolvePlaceBoundary } from '../../../src/services/lexical/places/placeBoundaryResolver';
import { placeCognitionEngine } from '../../../src/services/place/placeCognitionEngine';
import { classifyPlaceMentionContext } from '../../../src/services/place/placeContextClassifier';
import { inferPlaceVisitSignals } from '../../../src/services/place/placeVisitInference';

describe('Place Cognition Engine v2', () => {
  it('trims discourse leakage: Catch One because I → Catch One', () => {
    const boundary = resolvePlaceBoundary('Catch One because I');
    expect(boundary.text).toBe('Catch One');
    expect(boundary.fixes).toContain('trim_discourse_glue');

    const result = placeCognitionEngine.evaluate({
      span: 'Catch One because I',
      evidenceText: 'I went to Catch One because I needed to dance.',
      knownPlaceNames: ['Catch One'],
      proposedType: 'private_residence',
      proposedConfidence: 0.98,
    });

    expect(result.canonicalTitle).toBe('Catch One');
    expect(result.subtype).toBe('nightclub');
    expect(result.decision).toBe('MERGE_EXISTING');
    expect(result.confidence).toBeLessThan(0.99);
  });

  it('rejects synthetic narration: User mentioned', () => {
    const result = placeCognitionEngine.evaluate({
      span: 'User mentioned',
      evidenceText: 'User mentioned that Dan used to work in the warehouse.',
      proposedConfidence: 0.6,
    });

    expect(result.decision).toBe('REJECT');
    expect(result.entityKind).toBe('SYNTHETIC_NARRATION');
    expect(result.rejectionReason).toBe('synthetic_narration');
    expect(result.confidence).toBeLessThanOrEqual(0.2);
  });

  it('holds generic warehouse references instead of promoting them', () => {
    const result = placeCognitionEngine.evaluate({
      span: 'warehouse',
      evidenceText: 'Dan used to work in the warehouse.',
      proposedConfidence: 0.7,
    });

    expect(result.decision).toBe('HOLD_GENERIC');
    expect(result.entityKind).toBe('GENERIC_REFERENCE');
    expect(result.visitInference.userVisited).toBe(false);
    expect(result.visitInference.visitCount).toBe(0);
  });

  it('canonicalizes USC and does not infer a user visit from third-party attendance', () => {
    const evidence =
      'Marcus attended USC. Jamie graduated from USC last spring.';
    const result = placeCognitionEngine.evaluate({
      span: 'USC',
      evidenceText: evidence,
      proposedConfidence: 0.8,
    });

    expect(result.canonicalTitle).toBe('University of Southern California');
    expect(result.aliases).toEqual(expect.arrayContaining(['usc', 'University of Southern California']));
    expect(result.subtype).toBe('university');
    expect(result.visitInference.visitCount).toBe(0);
    expect(result.visitInference.userVisited).toBe(false);
    expect(
      classifyPlaceMentionContext('University of Southern California', evidence, ['USC', 'usc']),
    ).toBe('ATTENDED');
  });

  it('routes Anime Expo to EVENT, not PLACE', () => {
    const result = placeCognitionEngine.evaluate({
      span: 'AX',
      evidenceText: 'AX was crowded this year.',
    });

    expect(result.canonicalTitle).toBe('Anime Expo');
    expect(result.decision).toBe('ROUTE_EVENT');
    expect(result.entityKind).toBe('EVENT');
  });

  it('keeps Catch One as a PLACE nightclub on clean spans', () => {
    const result = placeCognitionEngine.evaluate({
      span: 'Catch One',
      evidenceText: 'I went to Catch One last night.',
    });

    expect(result.canonicalTitle).toBe('Catch One');
    expect(result.entityKind).toBe('PLACE');
    expect(result.subtype).toBe('nightclub');
    expect(result.decision).toBe('ACCEPT');
    expect(result.visitInference.userVisited).toBe(true);
  });

  it('routes Code Red to EVENT SERIES', () => {
    const result = placeCognitionEngine.evaluate({
      span: 'Code Red',
      evidenceText: 'We went to Code Red after the show.',
    });

    expect(result.decision).toBe('ROUTE_EVENT');
    expect(result.entityKind).toBe('EVENT_SERIES');
  });

  it('routes Klub Nocturno / Lick N Dip style event names away from Places', () => {
    expect(
      placeCognitionEngine.evaluate({
        span: 'Klub Nocturno',
        evidenceText: 'Klub Nocturno was at Catch One.',
      }).entityKind,
    ).toBe('EVENT_SERIES');

    expect(
      placeCognitionEngine.evaluate({
        span: 'Lick N Dip',
        evidenceText: 'I went to Lick N Dip and later Code Red.',
      }).entityKind,
    ).toBe('EVENT_SERIES');
  });

  it('does not treat third-party warehouse work as a user visit', () => {
    const visit = inferPlaceVisitSignals('warehouse', 'Dan used to work in the warehouse.');
    expect(visit.visitCount).toBe(0);
    expect(visit.userVisited).toBe(false);
    expect(visit.context).toBe('WORKED_AT');
  });

  it('builds short descriptions instead of dumping paragraphs', () => {
    const long =
      'User mentioned that there was a long story about many things. '.repeat(20);
    const result = placeCognitionEngine.evaluate({
      span: 'Catch One',
      evidenceText: long,
    });
    expect(result.description ?? '').not.toContain('User mentioned');
    expect((result.description ?? '').length).toBeLessThan(220);
  });
});
