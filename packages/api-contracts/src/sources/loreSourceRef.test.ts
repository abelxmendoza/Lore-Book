import { describe, expect, it } from 'vitest';

import {
  extractLoreEntityRefsFromMetadata,
  extractLoreSourcesFromMetadata,
  intakeChannelFromSourceType,
} from './loreSourceRef';

describe('loreSourceRef', () => {
  it('maps intake channels from stitched source types', () => {
    expect(intakeChannelFromSourceType('chat')).toBe('chat');
    expect(intakeChannelFromSourceType('document_upload')).toBe('document_upload');
    expect(intakeChannelFromSourceType('chat_attachment')).toBe('screenshot');
  });

  it('extracts chat, file, and photo sources from metadata', () => {
    const sources = extractLoreSourcesFromMetadata(
      {
        source_message_id: 'msg-1',
        source_thread_id: 'thread-1',
        source_file_id: 'file-1',
        photoId: 'photo-1',
      },
      { sourceType: 'chat', sourceKind: 'journal_entry', sourceId: 'entry-1' },
    );

    expect(sources.some((source) => source.kind === 'chat_message' && source.id === 'msg-1')).toBe(true);
    expect(sources.some((source) => source.kind === 'user_file' && source.id === 'file-1')).toBe(true);
    expect(sources.some((source) => source.kind === 'photo' && source.id === 'photo-1')).toBe(true);
    expect(sources.some((source) => source.kind === 'journal_entry' && source.id === 'entry-1')).toBe(true);
  });

  it('extracts related entity ids from metadata', () => {
    const entities = extractLoreEntityRefsFromMetadata({
      people: ['char-1'],
      locations: ['loc-1'],
      organization_ids: ['org-1'],
    });

    expect(entities).toEqual([
      { kind: 'character', id: 'char-1' },
      { kind: 'location', id: 'loc-1' },
      { kind: 'organization', id: 'org-1' },
    ]);
  });
});
