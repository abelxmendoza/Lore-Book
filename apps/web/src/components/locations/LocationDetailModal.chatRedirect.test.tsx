/**
 * Places modal Chat tab has no in-modal composer — hands off to main chat.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LocationDetailModal } from './LocationDetailModal';

const mockOpenChatWithFocus = vi.fn();

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: false }),
}));

vi.mock('../memory-explorer/MemoryCard', () => ({ MemoryCardComponent: () => null }));
vi.mock('../memory-explorer/MemoryDetailModal', () => ({ MemoryDetailModal: () => null }));

vi.mock('../../lib/openChatWithFocus', () => ({
  openChatWithFocus: (...args: unknown[]) => mockOpenChatWithFocus(...args),
}));

vi.mock('../../lib/hydrateBookEntity', async () => {
  const actual = await vi.importActual<typeof import('../../lib/hydrateBookEntity')>(
    '../../lib/hydrateBookEntity',
  );
  return {
    ...actual,
    fetchLocationById: vi.fn(async () => seedLocation),
    isEphemeralEntityId: vi.fn(() => false),
  };
});

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(async () => ({})),
}));

const seedLocation = {
  id: 'loc-first-street-pool',
  name: 'First Street Pool & Billiards',
  visitCount: 3,
  relatedPeople: [],
  tagCounts: [],
  chapters: [],
  moods: [],
  entries: [],
  sources: [],
};

function renderModal(onClose = vi.fn()) {
  return render(
    <LocationDetailModal location={seedLocation as never} onClose={onClose} />,
  );
}

describe('LocationDetailModal — chat handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Chat tab stays in the modal without an in-modal composer', () => {
    const onClose = vi.fn();
    renderModal(onClose);

    fireEvent.click(screen.getAllByRole('button', { name: /^chat$/i })[0]!);

    expect(onClose).not.toHaveBeenCalled();
    expect(mockOpenChatWithFocus).not.toHaveBeenCalled();
    expect(screen.getByTestId('location-chat-panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open main chat with focus/i })).toBeInTheDocument();
    expect(screen.getByText(/Quick questions about First Street Pool & Billiards/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/ask about visits/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('Open main chat with focus hands off to main chat', () => {
    const onClose = vi.fn();
    renderModal(onClose);

    fireEvent.click(screen.getAllByRole('button', { name: /^chat$/i })[0]!);
    fireEvent.click(screen.getByTestId('location-chat-open-main-chat'));

    expect(onClose).toHaveBeenCalled();
    expect(mockOpenChatWithFocus).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'loc-first-street-pool',
        entityName: 'First Street Pool & Billiards',
        entityType: 'location',
        sourceSurface: 'locations',
        initialPrompt: '',
      }),
    );
  });
});
