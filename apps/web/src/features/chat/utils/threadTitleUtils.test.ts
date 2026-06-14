import { describe, it, expect } from 'vitest';
import {
  isGenericThreadTitle,
  deriveTitleFromFirstUserMessage,
  resolveThreadDisplayTitle,
  DRAFT_THREAD_TITLE,
} from './threadTitleUtils';

describe('threadTitleUtils', () => {
  it('treats New chat and new thread as generic', () => {
    expect(isGenericThreadTitle('New chat')).toBe(true);
    expect(isGenericThreadTitle('new thread')).toBe(true);
    expect(isGenericThreadTitle('Untitled')).toBe(true);
    expect(isGenericThreadTitle('Family reunion planning')).toBe(false);
  });

  it('derives a specific title from the first user message', () => {
    expect(deriveTitleFromFirstUserMessage('Tell me about Maya and Jerry')).toMatch(/Maya/);
    expect(deriveTitleFromFirstUserMessage('New chat')).toBe(DRAFT_THREAD_TITLE);
  });

  it('resolveThreadDisplayTitle never returns New chat for threads with messages', () => {
    const title = resolveThreadDisplayTitle({
      title: 'New chat',
      messages: [
        { id: '1', role: 'user', content: 'How is my family doing?', timestamp: new Date() },
      ],
      updatedAt: new Date().toISOString(),
    });
    expect(title).not.toMatch(/^new (chat|thread)$/i);
    expect(title.toLowerCase()).not.toBe('new chat');
  });
});
