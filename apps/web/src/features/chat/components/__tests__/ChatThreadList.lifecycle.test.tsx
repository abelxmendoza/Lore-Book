import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useThreadExplorer', () => ({
  useThreadExplorer: () => ({
    hits: [],
    facets: null,
    entityFilter: null,
    setEntityFilter: vi.fn(),
    loading: false,
    active: false,
    clearFilters: vi.fn(),
  }),
}));

vi.mock('../../../../contexts/MockDataContext', () => ({
  useMockData: () => ({ backendUnavailable: false }),
}));

import { ChatThreadList } from '../ChatThreadList';

const baseProps = {
  threads: [],
  currentThreadId: null,
  onNewChat: vi.fn(),
  onSelectThread: vi.fn(),
  onDeleteThread: vi.fn(),
  collapsed: false,
  onToggleCollapsed: vi.fn(),
};

describe('ChatThreadList lifecycle states', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not show a definitive empty state while loading', () => {
    render(
      <ChatThreadList
        {...baseProps}
        threadListState={{ status: 'loading', error: null }}
      />,
    );

    expect(screen.getByText('Loading conversations…')).toBeInTheDocument();
    expect(screen.queryByText('No conversations yet')).not.toBeInTheDocument();
  });

  it('shows a retryable error instead of a false empty state', () => {
    const retry = vi.fn();
    render(
      <ChatThreadList
        {...baseProps}
        threadListState={{ status: 'error', error: 'Network unavailable' }}
        onRetryThreads={retry}
      />,
    );

    expect(screen.getByText('Unable to load conversations')).toBeInTheDocument();
    expect(screen.queryByText('No conversations yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state only after a successful authoritative load', () => {
    render(
      <ChatThreadList
        {...baseProps}
        threadListState={{ status: 'ready', error: null }}
      />,
    );

    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });
});
