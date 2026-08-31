import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FamilyFocusChatPanel } from './FamilyFocusChatPanel';

const openChatWithFocus = vi.fn();

vi.mock('../../lib/openChatWithFocus', () => ({
  openChatWithFocus: (input: unknown) => openChatWithFocus(input),
}));

describe('FamilyFocusChatPanel', () => {
  it('shows the family context summary and opens a fresh empty Family chat', () => {
    render(<FamilyFocusChatPanel memberCount={12} householdCount={3} groupCount={2} />);

    expect(screen.getByText('Focus your family in main chat')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('family-open-focus-chat'));

    const call = openChatWithFocus.mock.calls[0][0];
    expect(call).toMatchObject({
      entityId: 'family',
      entityName: 'My family',
      entityType: 'memory',
      sourceSurface: 'family',
      sourceLabel: 'Family',
      startNewThread: true,
    });
    // Opening a focus chat must never pre-fill or auto-send a starter prompt.
    expect(call.initialPrompt).toBeUndefined();
    expect(call.autoSubmit).toBeUndefined();
  });
});
