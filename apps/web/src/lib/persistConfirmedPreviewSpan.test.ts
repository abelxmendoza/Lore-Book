import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { LexicalPreviewSpan } from '../api/lexicalPreview';

const confirmComposerEntity = vi.fn();
vi.mock('./confirmComposerEntity', () => ({
  confirmComposerEntity: (entity: unknown) => confirmComposerEntity(entity),
}));

import { persistConfirmedPreviewSpan } from './persistConfirmedPreviewSpan';

function span(text: string, partial: Partial<LexicalPreviewSpan> = {}): LexicalPreviewSpan {
  return {
    text,
    start: 0,
    end: text.length,
    type: 'PERSON',
    colorKey: 'person',
    confidence: 0.7,
    temporary: true,
    ...partial,
  };
}

describe('persistConfirmedPreviewSpan', () => {
  beforeEach(() => confirmComposerEntity.mockReset());

  it('creates a character for a person span', async () => {
    confirmComposerEntity.mockResolvedValue({ id: 'c1', name: 'Maria', type: 'character', created: true });
    await persistConfirmedPreviewSpan(span('Maria'));
    expect(confirmComposerEntity).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Maria', type: 'character', status: 'draft' }),
    );
  });

  it('treats an uncertain proper noun as a person (matches the rendered chip)', async () => {
    confirmComposerEntity.mockResolvedValue({ id: 'c2', name: 'Sol', type: 'character', created: true });
    await persistConfirmedPreviewSpan(span('Sol', { type: 'OBJECT', colorKey: 'uncertain' }));
    expect(confirmComposerEntity).toHaveBeenCalledTimes(1);
  });

  it('does NOT create a character for a place span (handled by send→ingest)', async () => {
    const result = await persistConfirmedPreviewSpan(span('Tokyo', { type: 'PLACE', colorKey: 'place' }));
    expect(result).toBeNull();
    expect(confirmComposerEntity).not.toHaveBeenCalled();
  });

  it('does NOT create for an organization span', async () => {
    const result = await persistConfirmedPreviewSpan(span('Google', { type: 'ORGANIZATION', colorKey: 'organization' }));
    expect(result).toBeNull();
    expect(confirmComposerEntity).not.toHaveBeenCalled();
  });

  it('respects a user type correction away from person', async () => {
    const result = await persistConfirmedPreviewSpan(
      span('Apple', { type: 'OBJECT', colorKey: 'uncertain' }),
      { spanId: '0:5', text: 'Apple', correctedType: 'ORGANIZATION' } as never,
    );
    expect(result).toBeNull();
    expect(confirmComposerEntity).not.toHaveBeenCalled();
  });
});
