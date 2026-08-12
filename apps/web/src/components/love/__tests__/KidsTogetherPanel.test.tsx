import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KidsTogetherPanel, type KidTogether } from '../KidsTogetherPanel';

vi.mock('../../../lib/openCharacterBookModal', () => ({
  openCharacterBookModal: vi.fn(),
}));

const kids: KidTogether[] = [
  {
    id: 'kid-1',
    name: 'Riley',
    relation: 'together',
    coParents: [{ id: 'coparent-1', name: 'Jordan', relation_label: 'ex-partner' }],
  },
  {
    id: 'kid-2',
    name: 'Sam',
    relation: 'step',
    belongsTo: 'partner',
  },
];

const pets = [
  { id: 'pet-waffles', name: 'Waffles', relation: 'together' as const, belongsTo: 'both' as const, species: 'dog' },
  { id: 'pet-pixel', name: 'Pixel', relation: 'step' as const, belongsTo: 'partner' as const, species: 'cat' },
];

describe('KidsTogetherPanel — pets', () => {
  it('lists shared pets and the ones only one side brought in', () => {
    render(<KidsTogetherPanel kids={[]} pets={pets} loading={false} partnerName="Alex" />);

    expect(screen.getByText('Pets together (1)')).toBeInTheDocument();
    expect(screen.getByText('Their & your pets (1)')).toBeInTheDocument();
    expect(screen.getByText('Waffles')).toBeInTheDocument();
    expect(screen.getByText("Alex's pet")).toBeInTheDocument();
    expect(screen.getAllByTestId('pets-together-card')).toHaveLength(2);
  });

  it('opens a pet character card', () => {
    const onOpenPeripheralCharacter = vi.fn();
    render(
      <KidsTogetherPanel
        kids={[]}
        pets={pets}
        loading={false}
        partnerName="Alex"
        onOpenPeripheralCharacter={onOpenPeripheralCharacter}
      />,
    );

    fireEvent.click(screen.getAllByTestId('pets-together-open-pet')[0]);
    expect(onOpenPeripheralCharacter).toHaveBeenCalledWith('pet-waffles');
  });

  it('mentions pets in the empty state', () => {
    render(<KidsTogetherPanel kids={[]} pets={[]} loading={false} partnerName="Alex" />);
    expect(screen.getByTestId('kids-together-empty')).toHaveTextContent(/kids or pets/i);
  });
});

describe('KidsTogetherPanel', () => {
  it('renders both kids-together and step-kid sections', () => {
    render(<KidsTogetherPanel kids={kids} loading={false} partnerName="Alex" />);

    expect(screen.getByText('Kids together (1)')).toBeInTheDocument();
    expect(screen.getByText('Step-kids (1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Riley' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sam' })).toBeInTheDocument();
    expect(screen.getByTestId('kids-together-open-coparent')).toHaveTextContent('Jordan');
  });

  it('opens the kid character modal via onOpenPeripheralCharacter when clicked', () => {
    const onOpen = vi.fn();
    render(
      <KidsTogetherPanel
        kids={kids}
        loading={false}
        partnerName="Alex"
        onOpenPeripheralCharacter={onOpen}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Riley' }));
    expect(onOpen).toHaveBeenCalledWith('kid-1');
  });

  it('opens a co-parent character modal via onOpenPeripheralCharacter when clicked', () => {
    const onOpen = vi.fn();
    render(
      <KidsTogetherPanel
        kids={kids}
        loading={false}
        partnerName="Alex"
        onOpenPeripheralCharacter={onOpen}
      />,
    );

    fireEvent.click(screen.getByTestId('kids-together-open-coparent'));
    expect(onOpen).toHaveBeenCalledWith('coparent-1');
  });

  it('falls back to openCharacterBookModal and closes the modal when no callback is provided', async () => {
    const { openCharacterBookModal } = await import('../../../lib/openCharacterBookModal');
    const onCloseModal = vi.fn();
    render(<KidsTogetherPanel kids={kids} loading={false} partnerName="Alex" onCloseModal={onCloseModal} />);

    fireEvent.click(screen.getByRole('button', { name: 'Riley' }));
    expect(onCloseModal).toHaveBeenCalled();
    expect(openCharacterBookModal).toHaveBeenCalledWith({ characterId: 'kid-1', tab: 'info' });
  });

  it('does not render a co-parent as clickable when it has no character id', () => {
    const nameOnlyKids: KidTogether[] = [
      {
        id: 'kid-3',
        name: 'Casey',
        relation: 'together',
        coParents: [{ name: 'Unknown Parent' }],
      },
    ];
    render(<KidsTogetherPanel kids={nameOnlyKids} loading={false} partnerName="Alex" />);

    expect(screen.queryByTestId('kids-together-open-coparent')).not.toBeInTheDocument();
    expect(screen.getByText(/Unknown Parent/)).toBeInTheDocument();
  });
});
