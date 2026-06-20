import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyPreviewCorrections,
  applyCorrectionsToLexical,
  mergeCorrectionsIntoPreviewSpans,
} from '../../src/services/corrections/correctionApplicationService';
import type { CorrectedPreviewSpan } from '../../src/services/corrections/correctionTypes';
import type { LexicalAnalysisResult } from '../../src/services/lexical/lexicalTypes';

vi.mock('../../src/services/search/entitySearchService', () => ({
  validateEntityOwnership: vi.fn().mockResolvedValue(true),
}));

function baseCorrection(overrides: Partial<CorrectedPreviewSpan>): CorrectedPreviewSpan {
  return {
    id: '0:5:PLACE',
    text: 'Japan',
    start: 0,
    end: 5,
    originalType: 'PLACE',
    entityStatus: 'new',
    correctionAction: 'change_type',
    correctionSource: 'composer',
    ...overrides,
  };
}

function baseLexical(): LexicalAnalysisResult {
  return {
    messageId: 'msg-1',
    userId: 'user-1',
    rawText: "Denny's in Hollywood and Japan",
    normalizedText: "denny's in hollywood and japan",
    entities: [
      {
        surface: "Denny's in Hollywood",
        normalized: "denny's in hollywood",
        type: 'ORGANIZATION',
        subcategory: 'EMPLOYER',
        startOffset: 0,
        endOffset: 20,
        confidence: 0.7,
        source: 'preview',
      },
      {
        surface: 'Japan',
        normalized: 'japan',
        type: 'PLACE',
        startOffset: 25,
        endOffset: 30,
        confidence: 0.9,
        source: 'preview',
      },
    ],
    intents: [],
    emotions: [],
    relationships: [],
    skills: [],
    places: [],
    events: [],
    ontologyCandidates: [],
    memoryCandidates: [],
    glossaryMatches: [],
    confidence: 0.8,
    ambiguityFlags: [],
    needsClarification: false,
    createdAt: new Date().toISOString(),
  };
}

describe('correctionApplicationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('previewCorrections override lexical output type', async () => {
    const corrections = [
      baseCorrection({
        text: "Denny's in Hollywood",
        start: 0,
        end: 20,
        originalType: 'ORGANIZATION',
        correctedType: 'DEPLOYMENT_SITE',
        correctedSubtype: 'WORKSITE',
        correctionAction: 'mark_worksite',
      }),
    ];

    const lexical = applyCorrectionsToLexical(baseLexical(), corrections);
    const dennys = lexical.entities.find((e) => e.surface.includes('Denny'));
    expect(dennys?.type).toBe('PLACE');
    expect(dennys?.subcategory).toBe('WORKSITE');
  });

  it('ignored spans are excluded from lexical entities', () => {
    const corrections = [
      baseCorrection({
        text: 'Japan',
        start: 25,
        end: 30,
        entityStatus: 'ignored',
        correctionAction: 'ignore_phrase',
      }),
    ];

    const lexical = applyCorrectionsToLexical(baseLexical(), corrections);
    expect(lexical.entities.some((e) => e.surface === 'Japan')).toBe(false);
  });

  it('sensitive mark forces review-first', async () => {
    const result = await applyPreviewCorrections({
      userId: 'user-1',
      messageId: 'msg-1',
      text: 'got detention',
      corrections: [
        baseCorrection({
          text: 'detention',
          originalType: 'EVENT',
          sensitive: true,
          correctionAction: 'mark_sensitive',
        }),
      ],
    });

    expect(result.requiresReview).toBe(true);
    expect(result.correctedSpans[0]?.requiresReview).toBe(true);
  });

  it('confirmed alias produces alias candidate', async () => {
    const result = await applyPreviewCorrections({
      userId: 'user-1',
      messageId: 'msg-1',
      text: 'Oscar Trujio',
      corrections: [
        baseCorrection({
          text: 'Oscar Trujio',
          displayNameOverride: 'Oscar Trujillo',
          userConfirmed: true,
          correctionAction: 'rename',
          linkedEntityId: 'person-oscar',
          linkedEntityName: 'Oscar Trujillo',
        }),
      ],
    });

    expect(result.ontologyAliasCandidates.length).toBeGreaterThan(0);
    expect(result.ontologyAliasCandidates[0]?.alias).toBe('Oscar Trujio');
  });

  it('correction audit row is created', async () => {
    const result = await applyPreviewCorrections({
      userId: 'user-1',
      messageId: 'msg-1',
      text: 'test',
      corrections: [baseCorrection({ correctionAction: 'confirm', userConfirmed: true, entityStatus: 'confirmed' })],
    });

    expect(result.auditId).toBeTruthy();
    expect(typeof result.auditId).toBe('string');
  });

  it('parent entity correction affects preview span subtype metadata', () => {
    const spans = mergeCorrectionsIntoPreviewSpans(
      [{ text: 'Coding Club', start: 10, end: 21, type: 'GROUP' }],
      [
        baseCorrection({
          text: 'Coding Club',
          start: 10,
          end: 21,
          originalType: 'GROUP',
          parentEntityName: 'La Serna High School',
          parentEntityType: 'ORGANIZATION',
          correctionAction: 'set_parent',
        }),
      ]
    );

    expect(spans).toHaveLength(1);
    expect(spans[0]?.type).toBe('GROUP');
  });
});
