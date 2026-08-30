import { describe, expect, it } from 'vitest';
import {
  buildChatSourcesClipboardText,
  dedupeChatSources,
  rankChatSourcesForDisplay,
} from './chatSourcesClipboard';

describe('chatSourcesClipboard', () => {
  it('dedupes and ranks by relevance for Copy all', () => {
    const ranked = rankChatSourcesForDisplay([
      { type: 'entry', id: 'e1', title: 'Low', relevanceScore: 20 },
      { type: 'entry', id: 'e1', title: 'Low dup', relevanceScore: 99 },
      { type: 'character', id: 'c1', title: 'Marcus', relevanceScore: 80 },
    ]);
    expect(ranked.map((s) => s.id)).toEqual(['c1', 'e1']);
    expect(dedupeChatSources(ranked)).toHaveLength(2);

    const text = buildChatSourcesClipboardText(ranked);
    expect(text).toContain('Conversation evidence consulted (2 items)');
    expect(text).toContain('Marcus');
    expect(text).not.toContain('Relevance');
    expect(text).not.toContain('Id:');
  });

  it('omits rejected and internal self-generated sources', () => {
    const text = buildChatSourcesClipboardText([
      { type: 'entry', id: 'e1', title: 'Visible source' },
      { type: 'entry', id: 'e2', title: 'Assistant', usage: 'supporting' },
      { type: 'entry', id: 'e3', title: 'Rejected source', usage: 'rejected' },
    ]);
    expect(text).toContain('Visible source');
    expect(text).not.toContain('Assistant');
    expect(text).not.toContain('Rejected source');
  });
});
