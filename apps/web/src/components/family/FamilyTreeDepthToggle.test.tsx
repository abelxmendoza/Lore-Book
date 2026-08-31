import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FamilyTreeDepthToggle } from './FamilyTreeDepthToggle';
import type { FamilyTree } from '../../types/socialRoles';

const tree: FamilyTree = {
  self_id: 'me',
  branches: [],
  members: [
    { id: 'me', name: 'You', relation: 'related', relation_label: 'You', generation: 0, is_self: true },
    { id: 'mom', name: 'Elena', relation: 'parent', relation_label: 'Mom', generation: -1 },
    { id: 'cousin', name: 'Lina', relation: 'cousin', relation_label: 'Cousin', generation: 0 },
  ],
};

describe('FamilyTreeDepthToggle', () => {
  it('switches between close family and the full tree', async () => {
    const onChange = vi.fn();
    render(<FamilyTreeDepthToggle value="close" onChange={onChange} tree={tree} />);

    expect(screen.getByTestId('family-tree-depth-close')).toHaveTextContent('2');
    expect(screen.getByTestId('family-tree-depth-full')).toHaveTextContent('3');
    await userEvent.click(screen.getByTestId('family-tree-depth-full'));
    expect(onChange).toHaveBeenCalledWith('full');
  });
});
