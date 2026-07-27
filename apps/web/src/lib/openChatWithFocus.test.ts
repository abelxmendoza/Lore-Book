import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { openChatWithFocus } from './openChatWithFocus';

describe('openChatWithFocus', () => {
  beforeEach(() => {
    vi.stubGlobal('dispatchEvent', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults startNewThread so entity handoffs do not land in a sticky mega-thread', () => {
    openChatWithFocus({
      entityId: 'char-james',
      entityName: 'James',
      entityType: 'character',
      sourceSurface: 'characters',
      sourceLabel: 'Characters',
      knowledgeScope: 'who they are',
      initialPrompt: 'I want to talk about James.',
    });

    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
    const event = vi.mocked(window.dispatchEvent).mock.calls[0]![0] as CustomEvent;
    expect(event.type).toBe('lorebook:open-chat-focus');
    expect(event.detail).toEqual(
      expect.objectContaining({
        entityId: 'char-james',
        entityName: 'James',
        startNewThread: true,
      }),
    );
    expect(typeof event.detail.arrivedAt).toBe('number');
  });

  it('allows callers to opt out of startNewThread', () => {
    openChatWithFocus({
      entityId: 'char-james',
      entityName: 'James',
      entityType: 'character',
      sourceSurface: 'characters',
      sourceLabel: 'Characters',
      startNewThread: false,
      arrivedAt: 42,
    });

    const event = vi.mocked(window.dispatchEvent).mock.calls[0]![0] as CustomEvent;
    expect(event.detail.startNewThread).toBe(false);
    expect(event.detail.arrivedAt).toBe(42);
  });
});
