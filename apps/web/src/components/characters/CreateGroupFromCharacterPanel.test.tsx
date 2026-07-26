import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreateGroupFromCharacterPanel } from './CreateGroupFromCharacterPanel';

describe('CreateGroupFromCharacterPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens main chat with create-group context and notifies parent', async () => {
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

    await user.type(screen.getByTestId('create-group-name'), 'Vanguard Robotics');
    await user.type(
      screen.getByTestId('create-group-details'),
      'Workplace robotics company where Marcus and I are coworkers',
    );
    await user.click(screen.getByTestId('create-group-submit'));

    window.removeEventListener('lorebook:open-chat-focus', handler);

    expect(onOpenedChat).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0].detail.entityName).toBe('Vanguard Robotics');
    expect(String(events[0].detail.initialPrompt)).toMatch(/company/i);
    expect(String(events[0].detail.initialPrompt)).toContain('Marcus');
  });
});
