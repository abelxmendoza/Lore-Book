import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ChatFocusChipBar } from './ChatFocusChipBar';
import type { ChatFocus } from '../../../types/chatFocus';
import { emptyChatFocusSessionStats } from '../../../types/chatFocus';

const baseFocus: ChatFocus = {
  entityId: 'rel-001',
  entityName: 'Alex',
  entityType: 'character',
  sourceSurface: 'love',
  sourceLabel: 'Dating & Romance',
  relationshipId: 'rel-001',
  knowledgeScope: 'romantic relationship',
  sessionStats: { ...emptyChatFocusSessionStats(), messagesSent: 1, connectionDelta: 4, affectionDelta: 1.6 },
  baseline: { affectionScore: 92 },
  arrivedAt: Date.now(),
  statBumpKey: 1,
};

describe('ChatFocusChipBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders compact focus chips with entity, source, and stats — no demo chip', () => {
    render(<ChatFocusChipBar focus={baseFocus} onDismiss={() => undefined} />);

    expect(screen.getByTestId('chat-focus-chip-bar')).toBeInTheDocument();
    expect(screen.getByText(/Alex/)).toBeInTheDocument();
    expect(screen.getAllByText(/Dating & Romance/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Dating & Romance focus/i)).toBeInTheDocument();
    // The focus chip bar never carries a "Demo" badge, in demo mode or otherwise.
    expect(screen.queryByText('Demo')).not.toBeInTheDocument();
    expect(screen.getByText(/~94%/)).toBeInTheDocument();
    expect(screen.getByText(/\+4/)).toBeInTheDocument();
  });

  it('applies arrival animation classes for love focus', () => {
    render(<ChatFocusChipBar focus={baseFocus} onDismiss={() => undefined} />);
    const bar = screen.getByTestId('chat-focus-chip-bar');
    expect(bar.className).toMatch(/animate-romantic-enter/);
  });

  it('renders an organization focus chip with groups source labeling', () => {
    render(
      <ChatFocusChipBar
        focus={{
          ...baseFocus,
          entityId: 'org-1',
          entityName: 'Northwind Crew',
          entityType: 'organization',
          sourceSurface: 'organizations',
          sourceLabel: 'Groups & Organizations',
          relationshipId: undefined,
          knowledgeScope: 'what the group is, who is in it, and how it fits your life',
          baseline: undefined,
          sessionStats: emptyChatFocusSessionStats(),
        }}
        onDismiss={() => undefined}
      />,
    );

    expect(screen.getByText(/Northwind Crew/)).toBeInTheDocument();
    expect(screen.getByText(/Groups & Organizations/)).toBeInTheDocument();
  });
});
