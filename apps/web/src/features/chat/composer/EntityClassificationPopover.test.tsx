import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntityClassificationPopover } from './EntityClassificationPopover';
import { applyCorrectionAction, mergeBaseSpans, createEmptyCorrectionState } from '../../../lib/correctedPreviewSpanReducer';
import { toCorrectedPreviewSpan } from '../../../lib/correctedPreviewSpanReducer';
import type { LexicalPreviewSpan } from '../../../api/lexicalPreview';

vi.mock('../../../hooks/useEntitySearch', () => ({
  useEntitySearch: vi.fn(() => ({
    results: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

const previewSpan: LexicalPreviewSpan = {
  text: 'Japan',
  start: 9,
  end: 14,
  type: 'PLACE',
  colorKey: 'place',
  confidence: 0.95,
  temporary: true,
  entityStatus: 'new',
};

describe('EntityClassificationPopover', () => {
  it('correction popover can change entity type', () => {
    const onAction = vi.fn();
    render(
      <EntityClassificationPopover
        span={toCorrectedPreviewSpan(previewSpan)}
        onAction={onAction}
        onClose={() => {}}
      />
    );

    fireEvent.change(screen.getByTestId('entity-correction-type-select'), { target: { value: 'EVENT' } });

    expect(onAction).toHaveBeenCalledWith({
      kind: 'change_type',
      spanId: '9:14:PLACE',
      newType: 'EVENT',
    });
  });

  it('search opens from correction popover', () => {
    render(
      <EntityClassificationPopover
        span={toCorrectedPreviewSpan(previewSpan)}
        onAction={vi.fn()}
        onClose={() => {}}
      />
    );

    fireEvent.click(screen.getByTestId('entity-correction-link-existing'));
    expect(screen.getByTestId('entity-link-picker')).toBeTruthy();
    expect(screen.getByTestId('entity-link-search-input')).toHaveValue('Japan');
  });

  it('linked span shows known solid status in reducer output', () => {
    let state = mergeBaseSpans(createEmptyCorrectionState(), [previewSpan]);
    state = applyCorrectionAction(state, {
      kind: 'link_existing',
      spanId: '9:14:PLACE',
      entityId: 'loc-japan',
      entityName: 'Japan',
      entityType: 'place',
    });

    const linked = state.byId.get('9:14:PLACE')!;
    expect(linked.entityStatus).toBe('known');
    expect(linked.linkedEntityId).toBe('loc-japan');
    expect(linked.correctionAction).toBe('link_existing_entity');
    expect(linked.userConfirmed).toBe(true);
  });
});
