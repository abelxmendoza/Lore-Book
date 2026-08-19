import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CharacterTitleSection } from './CharacterTitleSection';
import type { Character } from './CharacterProfileCard';

const character = {
  id: 'character-a',
  name: 'Taylor Example',
  alias: ['Tay', 'Static Bloom', 'Static B', 'T.E.'],
  role: 'Main character',
  metadata: {},
} as Character;

describe('CharacterTitleSection compact mode', () => {
  it('displays all nicknames and usernames without add/edit controls', () => {
    render(<CharacterTitleSection character={character} compact omitTitle />);

    expect(screen.getByTestId('character-title-compact')).toBeInTheDocument();
    expect(screen.getByTestId('character-also-known-as')).toBeInTheDocument();
    expect(screen.getByText('Tay')).toBeInTheDocument();
    expect(screen.getByText('Static Bloom')).toBeInTheDocument();
    expect(screen.getByText('Static B')).toBeInTheDocument();
    expect(screen.getByText('T.E.')).toBeInTheDocument();
    expect(screen.queryByText('+2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('character-title-manage-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('character-title-add-alias')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit how they appear/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Keep this title/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rename with the Edit chip/i)).not.toBeInTheDocument();
  });

  it('omits duplicated primary title when parent already shows the name', () => {
    render(<CharacterTitleSection character={character} compact omitTitle />);

    expect(screen.queryByRole('heading', { name: 'Taylor Example' })).not.toBeInTheDocument();
    expect(screen.getByText('Tay')).toBeInTheDocument();
  });

  it('lets the user remove a wrong alias from the header chips', async () => {
    const onUpdated = vi.fn();
    render(
      <CharacterTitleSection
        character={{ ...character, id: 'dummy-character-a' }}
        compact
        omitTitle
        onUpdated={onUpdated}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Remove alias Tay' }));
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        alias: expect.not.arrayContaining(['Tay']),
      }),
    );
  });
});
