// =====================================================
// EVENT DETAIL MODAL TESTS
// =====================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/utils';
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
  fetchJson: vi.fn().mockResolvedValue({}),
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
      />
    );

    expect(screen.getByText('Test Event')).toBeInTheDocument();
  });

  it('should display event title', () => {
    render(
      <EventDetailModal
        event={mockEvent}
        onClose={mockOnClose}
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
      />
    );

    // Find close button by aria-label
    const closeButton = screen.getByLabelText(/close/i);
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should display event tabs', () => {
    render(
      <EventDetailModal
        event={mockEvent}
        onClose={mockOnClose}
      />
    );

    // Actual tab labels: Overview, Meaning, Connections, Sources
    expect(screen.getByText(/overview/i)).toBeInTheDocument();
    expect(screen.getByText(/meaning/i)).toBeInTheDocument();
    expect(screen.getByText(/sources/i)).toBeInTheDocument();
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
      />
    );

    // Should still render without crashing
    expect(screen.getByText('Test Event')).toBeInTheDocument();
  });

  it('opens main chat with this event as the active focus', async () => {
    const user = userEvent.setup();
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    render(<EventDetailModal event={mockEvent} onClose={mockOnClose} />);

    await user.click(screen.getByTestId('event-open-main-chat'));

    const handoff = dispatch.mock.calls
      .map(([event]) => event)
      .find((event) => event.type === 'lorebook:open-chat-focus') as CustomEvent;
    expect(handoff.detail).toMatchObject({
      entityId: 'event-1',
      entityName: 'Test Event',
      entityType: 'event',
      sourceSurface: 'events',
      sourceLabel: 'Life Log',
      autoSubmit: true,
    });
    expect(handoff.detail.initialPrompt).toMatch(/start by giving me a grounded response/i);
    expect(handoff.detail.initialPrompt).toMatch(/invite me to add or correct context/i);
    expect(mockOnClose).toHaveBeenCalled();
  });
});
