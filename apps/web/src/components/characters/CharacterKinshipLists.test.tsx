import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CharacterKinshipLists } from './CharacterKinshipLists';

const relationships = [
  { character_id: '1', character_name: 'Elena Morgan', relationship_type: 'mother' },
  { character_id: '2', character_name: 'Dana Whitfield', relationship_type: 'stepmother' },
  { character_id: '3', character_name: 'Miriam Vance', relationship_type: 'adoptive_mother' },
  { character_id: '4', character_name: 'Mia Morgan', relationship_type: 'daughter' },
  { character_id: '5', character_name: 'Theo Whitfield', relationship_type: 'stepson' },
  { character_id: '6', character_name: 'Noor Vance', relationship_type: 'adopted_daughter' },
  { character_id: '7', character_name: 'Waffles', relationship_type: 'dog' },
  { character_id: '8', character_name: 'Jamie', relationship_type: 'friend' },
];

describe('CharacterKinshipLists', () => {
  it('splits kin into a parents list and a kids & pets list', () => {
    render(<CharacterKinshipLists relationships={relationships} onOpen={vi.fn()} />);

    const parents = screen.getByTestId('kinship-section-parents');
    expect(within(parents).getByText('Parents')).toBeInTheDocument();
    expect(within(parents).getByText('Elena Morgan')).toBeInTheDocument();
    expect(within(parents).getByText('Dana Whitfield')).toBeInTheDocument();
    expect(within(parents).getByText('Miriam Vance')).toBeInTheDocument();

    const kids = screen.getByTestId('kinship-section-kids_and_pets');
    expect(within(kids).getByText('Kids & pets')).toBeInTheDocument();
    expect(within(kids).getByText('Mia Morgan')).toBeInTheDocument();
    expect(within(kids).getByText('Theo Whitfield')).toBeInTheDocument();
    expect(within(kids).getByText('Noor Vance')).toBeInTheDocument();
    expect(within(kids).getByText('Waffles')).toBeInTheDocument();

    // Parents and kids never bleed into each other, and non-kin stays out.
    expect(within(parents).queryByText('Mia Morgan')).not.toBeInTheDocument();
    expect(within(kids).queryByText('Elena Morgan')).not.toBeInTheDocument();
    expect(screen.queryByText('Jamie')).not.toBeInTheDocument();
  });

  it('keeps step and adoptive legible as sub-labels', () => {
    render(<CharacterKinshipLists relationships={relationships} onOpen={vi.fn()} />);

    expect(screen.getByText('Biological parents (1)')).toBeInTheDocument();
    expect(screen.getByText('Step parents (1)')).toBeInTheDocument();
    expect(screen.getByText('Adoptive parents (1)')).toBeInTheDocument();
    expect(screen.getByText('Children (1)')).toBeInTheDocument();
    expect(screen.getByText('Step children (1)')).toBeInTheDocument();
    expect(screen.getByText('Adopted children (1)')).toBeInTheDocument();
    expect(screen.getByText('Pets (1)')).toBeInTheDocument();
  });

  it('still shows both lists, with empty copy, for a character with no kin', () => {
    render(
      <CharacterKinshipLists
        relationships={[{ character_id: '8', character_name: 'Jamie', relationship_type: 'friend' }]}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByTestId('kinship-section-parents')).toHaveTextContent('No parents linked yet.');
    expect(screen.getByTestId('kinship-section-kids_and_pets')).toHaveTextContent(
      'No kids or pets linked yet.',
    );
  });

  it('opens the character behind a row', () => {
    const onOpen = vi.fn();
    render(<CharacterKinshipLists relationships={relationships} onOpen={onOpen} />);

    fireEvent.click(screen.getByText('Waffles'));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ character_id: '7', character_name: 'Waffles' }),
    );
  });
});
