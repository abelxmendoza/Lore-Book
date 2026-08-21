import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CharacterRelationshipTimeline } from './CharacterRelationshipTimeline';

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

vi.mock('../events/EventDetailModal', () => ({
  EventDetailModal: () => null,
}));

import { fetchJson } from '../../lib/api';

const fetchJsonMock = vi.mocked(fetchJson);

describe('CharacterRelationshipTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchJsonMock.mockResolvedValue({
      success: true,
      timelines: { sharedExperiences: [], lore: [] },
    });
  });

  it('refreshes canonical GET timelines and does not call deprecated rebuild', async () => {
    render(<CharacterRelationshipTimeline characterId="char-maya" />);

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith('/api/conversation/characters/char-maya/timelines');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(fetchJsonMock.mock.calls.every((call) => !String(call[0]).includes('rebuild-timelines'))).toBe(true);
    });
  });
});
