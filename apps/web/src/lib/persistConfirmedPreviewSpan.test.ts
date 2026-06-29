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

  it('creates a location for a place span', async () => {
    confirmComposerEntity.mockResolvedValue({ id: 'l1', name: 'Tokyo', type: 'location', created: true });
    await persistConfirmedPreviewSpan(span('Tokyo', { type: 'PLACE', colorKey: 'place' }));
    expect(confirmComposerEntity).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Tokyo', type: 'location', status: 'draft' }),
    );
  });

  it('creates an organization for an organization span', async () => {
    confirmComposerEntity.mockResolvedValue({ id: 'o1', name: 'Google', type: 'organization', created: true });
    await persistConfirmedPreviewSpan(span('Google', { type: 'ORGANIZATION', colorKey: 'organization' }));
    expect(confirmComposerEntity).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Google', type: 'organization', status: 'draft' }),
    );
  });

  it('routes a group span to the organization book', async () => {
    confirmComposerEntity.mockResolvedValue({ id: 'o2', name: 'Chess Club', type: 'organization', created: true });
    await persistConfirmedPreviewSpan(span('Chess Club', { type: 'GROUP', colorKey: 'group' }));
    expect(confirmComposerEntity).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Chess Club', type: 'organization' }),
    );
  });

  it('honors a user type correction (uncertain → organization)', async () => {
    confirmComposerEntity.mockResolvedValue({ id: 'o3', name: 'Apple', type: 'organization', created: true });
    await persistConfirmedPreviewSpan(
      span('Apple', { type: 'OBJECT', colorKey: 'uncertain' }),
      { spanId: '0:5', text: 'Apple', correctedType: 'ORGANIZATION' } as never,
    );
    expect(confirmComposerEntity).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Apple', type: 'organization' }),
    );
  });

  it('skips kinds without a name-based create (e.g. skill)', async () => {
    const result = await persistConfirmedPreviewSpan(span('Guitar', { type: 'SKILL', colorKey: 'skill' }));
    expect(result).toBeNull();
    expect(confirmComposerEntity).not.toHaveBeenCalled();
  });
});
