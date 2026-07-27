import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreateGroupFromCharacterPanel } from './CreateGroupFromCharacterPanel';

describe('CreateGroupFromCharacterPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens main chat focused on the character and notifies parent', async () => {
    const user = userEvent.setup();
    const onOpenedChat = vi.fn();
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('lorebook:open-chat-focus', handler);

    render(
      <CreateGroupFromCharacterPanel
        character={{ id: 'c1', name: 'Marcus', role: 'colleague' }}
        onOpenedChat={onOpenedChat}
        testIdPrefix="create-group"
      />,
    );

    expect(screen.queryByTestId('create-group-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('create-group-details')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('create-group-submit'));

    window.removeEventListener('lorebook:open-chat-focus', handler);

    expect(onOpenedChat).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0].detail.entityId).toBe('c1');
    expect(events[0].detail.entityName).toBe('Marcus');
    expect(events[0].detail.entityType).toBe('character');
    expect(events[0].detail.sourceSurface).toBe('organizations');
    expect(String(events[0].detail.initialPrompt)).toContain('Marcus');
    expect(String(events[0].detail.initialPrompt)).toMatch(/Groups & Organizations/i);
    expect(String(events[0].detail.knowledgeScope)).toMatch(/distributing related lore/i);
  });
});
