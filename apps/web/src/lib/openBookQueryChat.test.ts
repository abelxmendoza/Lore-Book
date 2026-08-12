import { describe, expect, it, vi, afterEach } from 'vitest';

import { openBookQueryChat } from './openBookQueryChat';

describe('openBookQueryChat', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens focused main chat for a Places Book query without minting an entity id', () => {
    const handler = vi.fn();
    window.addEventListener('lorebook:open-chat-focus', handler);

    openBookQueryChat('places I visited with Marcus', ['location']);

    expect(handler).toHaveBeenCalledTimes(1);
    const detail = handler.mock.calls[0][0].detail;
    expect(detail.entityId).toBe('book:location');
    expect(detail.entityName).toBe('Places Book');
    expect(detail.entityType).toBe('memory');
    expect(detail.sourceSurface).toBe('locations');
    expect(detail.initialPrompt).toBe('places I visited with Marcus');
    expect(detail.startNewThread).toBe(true);
  });

  it('opens a LoreBook-wide focus when no single domain is selected', () => {
    const handler = vi.fn();
    window.addEventListener('lorebook:open-chat-focus', handler);

    openBookQueryChat('What skills support my active quests?');

    const detail = handler.mock.calls[0][0].detail;
    expect(detail.entityId).toBe('book:lorebook');
    expect(detail.sourceSurface).toBe('lorebook');
    expect(detail.initialPrompt).toBe('What skills support my active quests?');
  });
});
