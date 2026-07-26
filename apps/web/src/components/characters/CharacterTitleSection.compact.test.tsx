import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
  it('keeps header controls and aliases compact behind manage toggle', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<CharacterTitleSection character={character} compact />);

    expect(screen.getByTestId('character-title-compact')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit title' })).not.toBeInTheDocument();
    expect(screen.queryByText('Auto from names')).not.toBeInTheDocument();
    expect(screen.queryByText('Mark unresolved')).not.toBeInTheDocument();
    expect(screen.queryByText('promote')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('character-title-manage-toggle'));
    expect(screen.getByRole('button', { name: 'Edit title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add alias' })).toBeInTheDocument();
  });

  it('omits duplicated primary title when parent already shows the name', () => {
    render(<CharacterTitleSection character={character} compact omitTitle />);

    expect(screen.getByTestId('character-title-compact')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Taylor Example' })).not.toBeInTheDocument();
    expect(screen.getByText('Tay')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByTestId('character-title-manage-toggle')).toBeInTheDocument();
  });
});
