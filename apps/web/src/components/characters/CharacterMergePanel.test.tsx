import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterMergePanel } from './CharacterMergePanel';
import type { Character } from './CharacterProfileCard';

vi.mock('../../store/api/entitiesApi', () => {
  const mutationHook = () =>
    vi.fn(() => [vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue({}) })), {}]);
  return {
    useGetCharactersBookQuery: vi.fn(() => ({ dataUpdatedAt: 0, refetch: vi.fn() })),
    useUpdateCharacterMutation: mutationHook(),
    useDeleteCharacterMutation: mutationHook(),
    useMergeCharactersMutation: mutationHook(),
  };
});

vi.mock('../../store/invalidateEntityCache', () => ({
  invalidateEntityTags: vi.fn(),
}));

const baseCharacter = (overrides: Partial<Character>): Character => ({
  id: 'char-1',
  name: 'Alex Rivera',
  status: 'active',
  importance_level: 'supporting',
  ...overrides,
});

describe('CharacterMergePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows consolidate controls and protocol copy', () => {
    render(
      <CharacterMergePanel
        characters={[
          baseCharacter({ id: 'char-1', name: 'Alex Rivera' }),
          baseCharacter({ id: 'char-2', name: 'Alex Rivera' }),
        ]}
        demoMode
        onConsolidated={vi.fn()}
        selectionMode={false}
        onSelectionModeChange={vi.fn()}
        selectedForMerge={new Set()}
        onToggleSelected={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    expect(screen.getByText(/Consolidate your cast/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Consolidate characters/i })).toBeInTheDocument();
    expect(screen.getByText(/possible duplicate group/i)).toBeInTheDocument();
  });

  it('shows manual consolidation actions when selection mode is active', () => {
    render(
      <CharacterMergePanel
        characters={[
          baseCharacter({ id: 'char-1', name: 'Alex Rivera' }),
          baseCharacter({ id: 'char-2', name: 'Alex R.' }),
        ]}
        demoMode
        onConsolidated={vi.fn()}
        selectionMode
        onSelectionModeChange={vi.fn()}
        selectedForMerge={new Set(['char-1', 'char-2'])}
        onToggleSelected={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    expect(screen.getByText(/Manual consolidation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Keep Alex Rivera/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Archive selected/i })).toBeInTheDocument();
  });
});
