import { describe, it, expect } from 'vitest';
import {
  conversationFingerprint,
  dedupeConversationThreads,
  disambiguateThreadTitles,
  ensureLocalUniqueTitle,
} from './threadDedupeUtils';
import type { Message } from '../message/ChatMessage';

function msg(role: 'user' | 'assistant', content: string): Message {
  return { id: `${role}-${content}`, role, content, timestamp: new Date() };
}

describe('threadDedupeUtils', () => {
  it('dedupes threads with identical conversation content', () => {
    const messages = [msg('user', 'Hello there'), msg('assistant', 'Hi!')];
    const kept = dedupeConversationThreads([
      { id: 'a', title: 'Hello there', messages, updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'b', title: 'Hello there copy', messages, updatedAt: '2026-01-02T00:00:00Z' },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe('b');
  });

  it('keeps only one empty draft', () => {
    const kept = dedupeConversationThreads([
      { id: 'd1', title: 'Draft', messages: [], updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'd2', title: 'Draft', messages: [], updatedAt: '2026-01-03T00:00:00Z' },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe('d2');
  });

  it('never drops an unhydrated server thread that has messages (cross-device sync)', () => {
    // Regression: a phone conversation arrives on desktop with messages: []
    // (list rows are unhydrated) and a still-generic title. It must survive the
    // empty-draft collapse against a newer local draft.
    const kept = dedupeConversationThreads([
      { id: 'phone', title: 'Draft', messages: [], messageCount: 12, updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'desktop-draft', title: 'Draft', messages: [], updatedAt: '2026-01-03T00:00:00Z' },
    ]);
    expect(kept.map((t) => t.id)).toContain('phone');
    expect(kept).toHaveLength(2);
  });

  it('collapses multiple truly-empty drafts but keeps every thread with a server count', () => {
    const kept = dedupeConversationThreads([
      { id: 'a', title: 'New chat', messages: [], messageCount: 4, updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'b', title: 'Draft', messages: [], messageCount: 0, updatedAt: '2026-01-02T00:00:00Z' },
      { id: 'c', title: 'Draft', messages: [], updatedAt: '2026-01-03T00:00:00Z' },
    ]);
    expect(kept.map((t) => t.id).sort()).toEqual(['a', 'c']);
  });

  it('disambiguates duplicate sidebar titles', () => {
    const labels = disambiguateThreadTitles([
      { id: '1', title: 'Family update', messages: [msg('user', 'a')], updatedAt: '2026-03-01T00:00:00Z' },
      { id: '2', title: 'Family update', messages: [msg('user', 'b')], updatedAt: '2026-03-10T00:00:00Z' },
    ]);
    expect(labels.get('1')).toMatch(/Family update ·/);
    expect(labels.get('2')).toMatch(/Family update ·/);
    expect(labels.get('1')).not.toBe(labels.get('2'));
  });

  it('conversationFingerprint ignores whitespace differences', () => {
    const a = conversationFingerprint([{ role: 'user', content: 'Hello   world' }]);
    const b = conversationFingerprint([{ role: 'user', content: 'hello world' }]);
    expect(a).toBe(b);
  });

  it('ensureLocalUniqueTitle adds date suffix on collision', () => {
    const threads = [
      { id: '1', title: 'Trip planning', messages: [], updatedAt: '2026-03-01T00:00:00Z' },
      { id: '2', title: 'Other', messages: [], updatedAt: '2026-03-02T00:00:00Z' },
    ];
    expect(ensureLocalUniqueTitle('Trip planning', '2', threads)).toMatch(/Trip planning ·/);
  });
});
