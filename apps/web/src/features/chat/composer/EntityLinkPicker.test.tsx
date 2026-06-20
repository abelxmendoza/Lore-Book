import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EntityLinkPicker } from './EntityLinkPicker';
import { toCorrectedPreviewSpan } from '../../../lib/correctedPreviewSpanReducer';
import type { LexicalPreviewSpan } from '../../../api/lexicalPreview';

const previewSpan: LexicalPreviewSpan = {
  text: 'Oscar Trujio',
  start: 0,
  end: 12,
  type: 'PERSON',
  colorKey: 'person',
  confidence: 0.82,
  temporary: true,
};

const mockResults = [
  {
    entityId: 'oscar-id',
    entityType: 'person' as const,
    displayName: 'Oscar Trujillo',
    aliases: ['Oscar'],
    knownStatus: 'known' as const,
    confidence: 0.96,
    source: 'characters',
    matchKind: 'fuzzy' as const,
  },
];

vi.mock('../../../hooks/useEntitySearch', () => ({
  useEntitySearch: vi.fn(({ query }: { query: string }) => ({
    results: query.trim() ? mockResults : [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

describe('EntityLinkPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('default query equals selected span text', () => {
    render(
      <EntityLinkPicker
        span={toCorrectedPreviewSpan(previewSpan)}
        onAction={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId('entity-link-search-input')).toHaveValue('Oscar Trujio');
  });

  it('selecting result updates correction state after confirm', async () => {
    const onAction = vi.fn();
    render(
      <EntityLinkPicker
        span={toCorrectedPreviewSpan(previewSpan)}
        onAction={onAction}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('entity-search-result-oscar-id'));
    fireEvent.click(screen.getByTestId('entity-link-confirm'));

    await waitFor(() => {
      expect(onAction).toHaveBeenCalledWith({
        kind: 'link_existing',
        spanId: '0:12:PERSON',
        entityId: 'oscar-id',
        entityName: 'Oscar Trujillo',
        entityType: 'person',
        source: 'composer',
      });
    });
  });

  it('cancel closes picker without mutation', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    render(
      <EntityLinkPicker
        span={toCorrectedPreviewSpan(previewSpan)}
        onAction={onAction}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByTestId('entity-link-picker-cancel'));
    expect(onAction).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('type filter can be toggled', () => {
    render(
      <EntityLinkPicker
        span={toCorrectedPreviewSpan(previewSpan)}
        onAction={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const placeFilter = screen.getByTestId('entity-link-type-place');
    fireEvent.click(placeFilter);
    expect(placeFilter.className).toMatch(/violet/);
  });
});
