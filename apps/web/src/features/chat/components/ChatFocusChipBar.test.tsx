import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ChatFocusChipBar } from './ChatFocusChipBar';
import type { ChatFocus } from '../../../types/chatFocus';
import { emptyChatFocusSessionStats } from '../../../types/chatFocus';

vi.mock('../../../contexts/MockDataContext', () => ({
  useMockData: () => ({ runtimeDataMode: 'DEMO' }),
}));

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

  it('renders compact focus chips with entity, source, demo, and stats', () => {
    render(<ChatFocusChipBar focus={baseFocus} onDismiss={() => undefined} />);

    expect(screen.getByTestId('chat-focus-chip-bar')).toBeInTheDocument();
    expect(screen.getByText(/Alex/)).toBeInTheDocument();
    expect(screen.getByText(/Dating & Romance/)).toBeInTheDocument();
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.getByText(/~94%/)).toBeInTheDocument();
    expect(screen.getByText(/\+4/)).toBeInTheDocument();
  });

  it('applies arrival animation classes for love focus', () => {
    render(<ChatFocusChipBar focus={baseFocus} onDismiss={() => undefined} />);
    const bar = screen.getByTestId('chat-focus-chip-bar');
    expect(bar.className).toMatch(/animate-romantic-enter/);
  });
});
