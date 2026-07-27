import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CHAT_JUMP_HIGHLIGHT_KEY,
  CHAT_JUMP_MESSAGE_KEY,
  CHAT_JUMP_SESSION_KEY,
  clearChatThreadJump,
  openChatThreadAtMessage,
  peekChatJumpHighlightTerms,
  peekChatJumpMessageId,
  peekChatJumpSessionId,
  setChatThreadJump,
} from './chatThreadJump';

describe('chatThreadJump', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('stores message, session, and highlight terms', () => {
    setChatThreadJump({
      sessionId: 'sess-1',
      messageId: 'msg-1',
      highlightTerms: ['Jamie', 'Jimmy', 'Jamie'],
    });
    expect(peekChatJumpMessageId()).toBe('msg-1');
    expect(peekChatJumpSessionId()).toBe('sess-1');
    expect(peekChatJumpHighlightTerms()).toEqual(['Jamie', 'Jimmy']);
    expect(sessionStorage.getItem(CHAT_JUMP_MESSAGE_KEY)).toBe('msg-1');
    expect(sessionStorage.getItem(CHAT_JUMP_SESSION_KEY)).toBe('sess-1');
    expect(sessionStorage.getItem(CHAT_JUMP_HIGHLIGHT_KEY)).toContain('Jamie');
  });

  it('navigates after setting jump state', () => {
    const navigate = vi.fn();
    const handler = vi.fn();
    window.addEventListener('lorebook:open-chat-thread', handler);
    openChatThreadAtMessage(navigate, {
      sessionId: 'sess-9',
      messageId: 'msg-9',
      highlightTerms: ['Marcus'],
    });
    expect(navigate).toHaveBeenCalledWith('/chat/sess-9');
    expect(peekChatJumpMessageId()).toBe('msg-9');
    expect(peekChatJumpHighlightTerms()).toEqual(['Marcus']);
    expect(handler).toHaveBeenCalled();
    window.removeEventListener('lorebook:open-chat-thread', handler);
  });

  it('clears all jump keys', () => {
    setChatThreadJump({ sessionId: 's', messageId: 'm', highlightTerms: ['Alex'] });
    clearChatThreadJump();
    expect(peekChatJumpMessageId()).toBeNull();
    expect(peekChatJumpSessionId()).toBeNull();
    expect(peekChatJumpHighlightTerms()).toEqual([]);
  });
});
