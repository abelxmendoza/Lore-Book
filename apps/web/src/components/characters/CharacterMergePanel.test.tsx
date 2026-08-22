import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CharacterMergePanel } from './CharacterMergePanel';
import type { Character } from './CharacterProfileCard';
import { useMergeCharactersMutation } from '../../store/api/entitiesApi';

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

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn().mockResolvedValue({ duplicate_groups: [] }),
}));

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
    vi.mocked(useMergeCharactersMutation).mockReturnValue([
      vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue({}) })),
      {} as never,
    ]);
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

  it('copies all duplicate groups from the consolidate hub', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <CharacterMergePanel
        characters={[
          baseCharacter({ id: 'char-1', name: 'Alex Rivera', alias: ['Alex'] }),
          baseCharacter({ id: 'char-2', name: 'Alex Rivera', alias: ['A. Rivera'] }),
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

    fireEvent.click(screen.getByRole('button', { name: /Consolidate characters/i }));
    const copyBtn = await screen.findByRole('button', { name: /copy all duplicate characters/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    const payload = String(writeText.mock.calls[0]?.[0] ?? '');
    expect(payload).toContain('Consolidate Characters — Duplicate Groups');
    expect(payload).toContain('Alex Rivera');
    expect(payload).toContain('Match type: exact');
  });

  it('shows the merge failure on the keep bar', async () => {
    const unwrap = vi.fn().mockRejectedValue({
      status: 400,
      message: 'Could not update the surviving card: duplicate key',
    });
    vi.mocked(useMergeCharactersMutation).mockReturnValue([
      vi.fn(() => ({ unwrap })),
      {} as never,
    ]);

    render(
      <CharacterMergePanel
        characters={[
          baseCharacter({ id: '11111111-1111-1111-1111-111111111111', name: 'Jamie' }),
          baseCharacter({ id: '22222222-2222-2222-2222-222222222222', name: 'J' }),
        ]}
        onConsolidated={vi.fn()}
        selectionMode
        onSelectionModeChange={vi.fn()}
        selectedForMerge={new Set([
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
        ])}
        onToggleSelected={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Keep Jamie/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Could not update the surviving card/i
    );
  });
});
