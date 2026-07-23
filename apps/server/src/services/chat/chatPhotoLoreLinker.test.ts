import { describe, expect, it } from 'vitest';
import { buildConversationLoreContextBlock } from './chatPhotoLoreLinker';
import { buildIngestTextFromVision } from './chatVisionSummaryService';

describe('buildConversationLoreContextBlock', () => {
  it('includes cast, focus, and recent turns', () => {
    const block = buildConversationLoreContextBlock({
      threadEntities: [
        { id: 'c1', name: 'Jamie', type: 'character' },
        { id: 'l1', name: 'Northwind Depot', type: 'location' },
      ],
      chatFocus: { entityId: 'c1', entityName: 'Jamie', entityType: 'character' },
      recentTurns: [
        { role: 'user', content: 'Remember that night with Jamie?' },
        { role: 'assistant', content: 'Yes — tell me more.' },
      ],
    });
    expect(block).toContain('Thread cast: Jamie (character), Northwind Depot (location)');
    expect(block).toContain('Conversation focus: Jamie (character)');
    expect(block).toContain('Remember that night with Jamie?');
  });

  it('returns empty when no context', () => {
    expect(buildConversationLoreContextBlock({})).toBe('');
    expect(buildConversationLoreContextBlock(null)).toBe('');
  });
});

describe('vision lore ingest composition', () => {
  it('keeps conversation context next to photo description for connected memory', () => {
    const lore = buildConversationLoreContextBlock({
      threadEntities: [{ id: 'c1', name: 'Marcus', type: 'character' }],
      chatFocus: { entityId: 'c1', entityName: 'Marcus', entityType: 'character' },
    });
    const text = buildIngestTextFromVision(
      'This was after the show',
      {
        summary: 'Two friends outside a venue at night.',
        perImage: ['Wide shot'],
        people: ['Marcus'],
        places: ['venue'],
        mediaKinds: ['photo'],
      },
      lore,
    );
    expect(text).toContain('This was after the show');
    expect(text).toContain('[Conversation lore context]');
    expect(text).toContain('Marcus');
    expect(text).toContain('[Photo description]: Two friends outside a venue at night.');
  });
});
