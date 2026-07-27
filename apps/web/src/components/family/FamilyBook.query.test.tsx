import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useShouldUseMockData', () => ({
  useShouldUseMockData: () => true,
}));

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

vi.mock('../../lib/storyRefresh', () => ({
  onStoryDataUpdated: () => () => {},
  dispatchStoryDataUpdated: vi.fn(),
}));

vi.mock('./FamilyTreeView', () => ({
  FamilyTreeView: () => <div data-testid="family-tree-view" />,
  createMockUserFamilyTree: () => null,
  createMockFamilyTreeForCharacter: () => null,
}));

vi.mock('./HierarchicalFamilyTree', () => ({
  HierarchicalFamilyTree: () => <div data-testid="hierarchical-family-tree" />,
}));

vi.mock('../characters/CharacterDetailModal', () => ({
  CharacterDetailModal: () => null,
}));

import { fetchJson } from '../../lib/api';
import { FamilyBook } from './FamilyBook';

describe('FamilyBook query system', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries and filters the synthetic family tree without calling the API', async () => {
    render(<FamilyBook />);

    fireEvent.change(screen.getByLabelText('Ask your Family and Family Tree'), {
      target: { value: 'Show my maternal cousins' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask Family' }));

    await waitFor(() => {
      expect(screen.getByText('1 matching relative')).toBeInTheDocument();
    });
    expect(screen.getByText('Lina Solenne')).toBeInTheDocument();
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

