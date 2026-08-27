import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test/utils';
import { MainCharacterProfileCard } from './MainCharacterProfileCard';
import type { Character } from './CharacterProfileCard';

vi.mock('../../lib/runtimeIdentity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/runtimeIdentity')>()),
  canCallAuthenticatedApi: () => false,
}));

vi.mock('../../store/api/entitiesApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../store/api/entitiesApi')>()),
  useGetCharactersBookQuery: () => ({ dataUpdatedAt: 0 }),
}));

const pollutedSelf: Character = {
  id: 'self-1',
  name: 'Jamie Rivera',
  first_name: 'Jamie',
  last_name: 'Rivera',
  role: 'Quality Assurance Technician — Failure Analysis & Prototypes, Vanguard Robotics',
  archetype: 'protagonist',
  importance_level: 'protagonist',
  status: 'active',
  memory_count: 12,
  alias: ['Isolation And Resilience', 'Jamie Rivera the Isolation And Resilience'],
  tags: ["DJ · mentioned in relation to the user's outing · auto-generated"],
  summary: 'Main character energy: builder of timelines and trouble — the one the assistant is legally required to remember.',
  metadata: {
    is_self: true,
    is_user: true,
    middle_name: 'Alex',
    epithet: 'Isolation And Resilience',
    witty_tagline:
      'Main character energy: builder of timelines and trouble — the one the assistant is legally required to remember.',
    context_hooks: [
      'has an interview on the horizon',
      'speaks fluent warehouse diagnostics',
      'between-arc transition era',
    ],
  },
};

describe('MainCharacterProfileCard identity surface', () => {
  it('shows the legal name instead of a chapter-title epithet', () => {
    render(<MainCharacterProfileCard character={pollutedSelf} interactive={false} />);

    const card = screen.getByTestId('main-character-card');
    expect(card).toHaveTextContent('Jamie Rivera');
    expect(card).toHaveTextContent('Quality Assurance Technician');
    expect(card).not.toHaveTextContent('the Isolation And Resilience');
    expect(card).not.toHaveTextContent('builder of timelines and trouble');
    expect(card).not.toHaveTextContent('warehouse diagnostics');
    expect(card).not.toHaveTextContent('interview on the horizon');
    expect(card).not.toHaveTextContent('Upload a resume');
    expect(card).not.toHaveTextContent('auto-generated');
  });
});
