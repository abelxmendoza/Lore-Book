import { describe, it, expect } from 'vitest';
import { clientLexicalPreviewSpans } from './clientLexicalPreview';
import {
  applyCorrectionAction,
  createEmptyCorrectionState,
  mergeBaseSpans,
  visibleCorrectedSpans,
  spanToId,
} from './correctedPreviewSpanReducer';
import { colorKeyForPreviewType } from './entityColorMap';

const FIXTURE =
  'I went to Japan last summer. It was so hot I took my favorite summer clothes. I went on the trip with my school Japanese Class.';

describe('clientLexicalPreviewSpans', () => {
  it('highlights Japan as PLACE', () => {
    const spans = clientLexicalPreviewSpans(FIXTURE);
    const japan = spans.find((s) => s.text === 'Japan');
    expect(japan?.type).toBe('PLACE');
    expect(japan?.colorKey).toBe('place');
  });

  it('highlights last summer as TIME_PERIOD', () => {
    const spans = clientLexicalPreviewSpans(FIXTURE);
    expect(spans.some((s) => /last summer/i.test(s.text) && s.type === 'TIME_PERIOD')).toBe(true);
  });

  it('highlights school Japanese Class as GROUP', () => {
    const spans = clientLexicalPreviewSpans(FIXTURE);
    expect(spans.some((s) => s.type === 'GROUP' && /Japanese Class/i.test(s.text))).toBe(true);
  });

  it('highlights school Japanese Class as GROUP (Japanese subject embedded)', () => {
    const spans = clientLexicalPreviewSpans(FIXTURE);
    expect(spans.some((s) => s.type === 'GROUP' && /Japanese Class/i.test(s.text))).toBe(true);
  });

  it('highlights favorite summer clothes as PREFERENCE', () => {
    const spans = clientLexicalPreviewSpans(FIXTURE);
    expect(spans.some((s) => s.type === 'PREFERENCE' && /favorite summer clothes/i.test(s.text))).toBe(true);
  });
});

describe('entityCorrectionActions', () => {
  it('ignored phrase is not highlighted again', () => {
    let state = createEmptyCorrectionState();
    const spans = clientLexicalPreviewSpans(FIXTURE);
    const japan = spans.find((s) => s.text === 'Japan')!;
    state = mergeBaseSpans(state, spans);
    state = applyCorrectionAction(state, {
      kind: 'ignore_phrase',
      phrase: 'Japan',
      spanId: spanToId(japan),
    });
    expect(visibleCorrectedSpans(state).some((s) => s.text === 'Japan')).toBe(false);
    expect(state.ignoredPhrases).toContain('japan');
  });

  it('can change entity type via correction state', () => {
    const spans = clientLexicalPreviewSpans(FIXTURE);
    const japan = spans.find((s) => s.text === 'Japan')!;
    let state = mergeBaseSpans(createEmptyCorrectionState(), spans);
    const spanId = spanToId(japan);
    state = applyCorrectionAction(state, {
      kind: 'change_type',
      spanId,
      newType: 'EVENT',
    });
    const corrected = state.byId.get(spanId)!;
    expect(corrected.correctedType).toBe('EVENT');
    expect(colorKeyForPreviewType('EVENT')).toBe('event');
  });
});
