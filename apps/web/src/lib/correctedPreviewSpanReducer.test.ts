import { describe, it, expect } from 'vitest';
import {
  applyCorrectionAction,
  createEmptyCorrectionState,
  correctionsForSend,
  mergeBaseSpans,
  visibleCorrectedSpans,
  spanToId,
  toCorrectedPreviewSpan,
} from './correctedPreviewSpanReducer';
import type { LexicalPreviewSpan } from '../api/lexicalPreview';

const dennysSpan: LexicalPreviewSpan = {
  text: "Denny's in Hollywood",
  start: 120,
  end: 140,
  type: 'ORGANIZATION',
  subtype: 'EMPLOYER',
  colorKey: 'organization',
  confidence: 0.78,
  temporary: true,
};

describe('correctedPreviewSpanReducer', () => {
  it('confirm action changes status to confirmed', () => {
    let state = createEmptyCorrectionState();
    state = mergeBaseSpans(state, [dennysSpan]);
    const id = spanToId(dennysSpan);
    state = applyCorrectionAction(state, { kind: 'confirm', spanId: id });

    const span = state.byId.get(id)!;
    expect(span.entityStatus).toBe('confirmed');
    expect(span.userConfirmed).toBe(true);
  });

  it('ignore action removes span from visible list', () => {
    let state = mergeBaseSpans(createEmptyCorrectionState(), [dennysSpan]);
    const id = spanToId(dennysSpan);
    state = applyCorrectionAction(state, { kind: 'ignore_phrase', spanId: id, phrase: dennysSpan.text });

    expect(visibleCorrectedSpans(state)).toHaveLength(0);
    expect(state.ignoredPhrases).toContain("denny's in hollywood");
  });

  it('change type updates corrected type', () => {
    let state = mergeBaseSpans(createEmptyCorrectionState(), [dennysSpan]);
    const id = spanToId(dennysSpan);
    state = applyCorrectionAction(state, {
      kind: 'mark_worksite',
      spanId: id,
    });

    const span = state.byId.get(id)!;
    expect(span.correctedType).toBe('DEPLOYMENT_SITE');
    expect(span.correctionAction).toBe('mark_worksite');
  });

  it('parent entity selection updates parent context', () => {
    let state = mergeBaseSpans(createEmptyCorrectionState(), [dennysSpan]);
    const id = spanToId(dennysSpan);
    state = applyCorrectionAction(state, {
      kind: 'set_parent',
      spanId: id,
      parentEntityId: 'org-armstrong',
      parentEntityName: 'Armstrong Robotics',
      parentEntityType: 'ORGANIZATION',
    });

    expect(state.byId.get(id)?.parentEntityName).toBe('Armstrong Robotics');
    expect(state.byId.get(id)?.parentContext).toContain('Armstrong Robotics');
  });

  it('correction state is included in send payload', () => {
    let state = mergeBaseSpans(createEmptyCorrectionState(), [dennysSpan]);
    const id = spanToId(dennysSpan);
    state = applyCorrectionAction(state, { kind: 'mark_worksite', spanId: id });

    const payload = correctionsForSend(state);
    expect(payload.some((c) => c.correctionAction === 'mark_worksite')).toBe(true);
  });

  it('Denny\'s can be changed from employer to deployment site', () => {
    const span = toCorrectedPreviewSpan(dennysSpan);
    expect(span.originalType).toBe('ORGANIZATION');

    let state = createEmptyCorrectionState();
    state.byId.set(span.id, span);
    state = applyCorrectionAction(state, { kind: 'mark_worksite', spanId: span.id });

    expect(state.byId.get(span.id)?.correctedType).toBe('DEPLOYMENT_SITE');
  });
});
