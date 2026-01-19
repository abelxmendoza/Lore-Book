// =====================================================
// EVENT DETAIL MODAL TESTS
// =====================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventDetailModal } from './EventDetailModal';

// Mock dependencies
vi.mock('../../hooks/useChatStream', () => ({
  useChatStream: () => ({
    messages: [],
    isLoading: false,
    error: null,
    sendMessage: vi.fn(),
    clearMessages: vi.fn(),
  }),
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

const mockEvent = {
  id: 'event-1',
  title: 'Test Event',
  summary: 'A test event',
  type: 'social',
  start_time: '2024-01-01T10:00:00Z',
  end_time: null,
  confidence: 0.8,
  people: [],
  locations: [],
  activities: [],
};

describe('EventDetailModal', () => {
  const mockOnClose = vi.fn();
  const mockOnUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('should render event information', () => {
    render(
      <EventDetailModal
        event={mockEvent}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    expect(screen.getByText('Test Event')).toBeInTheDocument();
  });

  it('should display event title', () => {
    render(
      <EventDetailModal
        event={mockEvent}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    expect(screen.getByText('Test Event')).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <EventDetailModal
        event={mockEvent}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should display event tabs', () => {
    render(
      <EventDetailModal
        event={mockEvent}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    // Check for tab labels - tabs are "Chat", "Details", "Sources", "Questions"
    expect(screen.getByText(/chat/i)).toBeInTheDocument();
    expect(screen.getByText(/details/i)).toBeInTheDocument();
  });

  it('should handle event with no summary gracefully', () => {
    const eventWithoutSummary = {
      ...mockEvent,
      summary: null,
    };

    render(
      <EventDetailModal
        event={eventWithoutSummary}
        onClose={mockOnClose}
        onUpdate={mockOnUpdate}
      />
    );

    // Should still render without crashing
    expect(screen.getByText('Test Event')).toBeInTheDocument();
  });
});
