import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../../lib/api';
import { CharacterMediaPanel } from './CharacterMediaPanel';

const mockFetch = fetchJson as ReturnType<typeof vi.fn>;

describe('CharacterMediaPanel self photo roles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ media: [] });
  });

  it('shows Selfies / Pictures I\'m In switcher for self profile photos', async () => {
    const user = userEvent.setup();
    render(
      <CharacterMediaPanel
        characterId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        characterName="Alex"
        kind="photo"
        isSelfProfile
      />,
    );

    await screen.findByTestId('photo-role-selfie');
    expect(screen.getByTestId('photo-role-appears_in')).toBeInTheDocument();

    await user.click(screen.getByTestId('photo-role-appears_in'));
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('photoRole=appears_in'),
        undefined,
        expect.any(Object),
      );
    });
  });

  it('does not show role switcher for other characters', async () => {
    render(
      <CharacterMediaPanel
        characterId="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        characterName="Jamie"
        kind="photo"
      />,
    );
    await screen.findByTestId('character-media-upload');
    expect(screen.queryByTestId('photo-role-selfie')).not.toBeInTheDocument();
  });
});
