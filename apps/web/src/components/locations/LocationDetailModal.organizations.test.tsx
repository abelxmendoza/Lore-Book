import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getDemoOrganizationLocationLinks,
  unlinkDemoLocationOrganization,
} from '../../mocks/locationOrganizationDemoData';
import type { LocationProfile } from './LocationProfileCard';

vi.mock('../../contexts/MockDataContext', () => ({
  useMockData: () => ({ useMockData: true }),
}));
vi.mock('../memory-explorer/MemoryCard', () => ({ MemoryCardComponent: () => null }));
vi.mock('../memory-explorer/MemoryDetailModal', () => ({ MemoryDetailModal: () => null }));
vi.mock('../../features/chat/composer/ChatComposer', () => ({ ChatComposer: () => null }));
vi.mock('../../features/chat/message/ChatMessage', () => ({ ChatMessage: () => null }));

import { LocationDetailModal } from './LocationDetailModal';

const location: LocationProfile = {
  id: 'dummy-loc-1',
  name: 'Novara HQ',
  type: 'office',
  visitCount: 4,
  relatedPeople: [],
  tagCounts: [],
  chapters: [],
  moods: [],
  entries: [],
  sources: [],
};

describe('LocationDetailModal — Groups & Organizations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    const testLink = getDemoOrganizationLocationLinks('mock-12').find(
      (link) => link.location_id === 'dummy-loc-1',
    );
    if (testLink) unlinkDemoLocationOrganization(testLink.id);
  });

  it('shows seeded Demo Mode links in the dedicated tab', async () => {
    render(<LocationDetailModal location={location} onClose={vi.fn()} />);

    fireEvent.click(screen.getAllByRole('button', { name: /groups & organizations/i })[0]!);

    expect(await screen.findByText('Novara Systems')).toBeInTheDocument();
    expect(screen.getByText(/durable two-way links/i)).toBeInTheDocument();
  });

  it('links a selected group and exposes it from the organization direction', async () => {
    const user = userEvent.setup();
    render(<LocationDetailModal location={location} onClose={vi.fn()} />);

    fireEvent.click(screen.getAllByRole('button', { name: /groups & organizations/i })[0]!);
    await screen.findByText('Novara Systems');
    fireEvent.click(screen.getByTestId('location-add-organization-toggle'));

    await user.click(screen.getByRole('option', { name: /Tuesday Writers' Workshop/i }));
    fireEvent.click(screen.getByTestId('location-add-organization-submit'));

    expect(await screen.findByText(/is now linked to Novara HQ/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(
        getDemoOrganizationLocationLinks('mock-12').some(
          (link) => link.location_id === 'dummy-loc-1',
        ),
      ).toBe(true);
    });
  });

  it('shows a timeline tab backed by this place memories', async () => {
    render(<LocationDetailModal location={location} onClose={vi.fn()} />);

    fireEvent.click(screen.getAllByRole('button', { name: /timeline/i })[0]!);

    expect(screen.getByText(/chronological view of memories and recorded visits/i)).toBeInTheDocument();
    expect(await screen.findByText(/visits & memories/i)).toBeInTheDocument();
  });

  it('opens the place timeline in main chat with an empty composer', async () => {
    const onClose = vi.fn();
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    render(<LocationDetailModal location={location} onClose={onClose} />);

    fireEvent.click(screen.getAllByRole('button', { name: /timeline/i })[0]!);
    fireEvent.click(screen.getByTestId('location-timeline-open-main-chat'));

    const handoff = dispatch.mock.calls
      .map(([event]) => event)
      .find((event) => event.type === 'lorebook:open-chat-focus') as CustomEvent;
    expect(handoff.detail).toMatchObject({
      entityId: 'dummy-loc-1',
      entityName: 'Novara HQ',
      entityType: 'location',
      sourceSurface: 'locations',
      sourceLabel: 'Locations',
      startNewThread: true,
    });
    expect(handoff.detail.knowledgeScope).toMatch(/chronological place history/i);
    // Opening a focus chat must never pre-fill or auto-send a starter prompt.
    expect(handoff.detail.initialPrompt).toBeUndefined();
    expect(handoff.detail.autoSubmit).toBeUndefined();
    expect(onClose).toHaveBeenCalled();
  });
});
