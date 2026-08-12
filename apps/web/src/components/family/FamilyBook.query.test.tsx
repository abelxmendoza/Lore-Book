import { fireEvent, render, screen } from '@testing-library/react';
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

import { FamilyBook } from './FamilyBook';

describe('FamilyBook query system', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends family questions into focused main chat', () => {
    const handler = vi.fn();
    window.addEventListener('lorebook:open-chat-focus', handler);

    render(<FamilyBook />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Ask in chat' }), {
      target: { value: 'Show my maternal cousins' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ask in chat' }));

    expect(handler).toHaveBeenCalledTimes(1);
    const detail = handler.mock.calls[0][0].detail;
    expect(detail.entityId).toBe('book:family');
    expect(detail.sourceSurface).toBe('family');
    expect(detail.initialPrompt).toBe('Show my maternal cousins');
  });
});
