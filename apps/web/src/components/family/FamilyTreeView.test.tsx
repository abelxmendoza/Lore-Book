import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FamilyTreeView, inferEdges, generationLabel } from './FamilyTreeView';
import type { FamilyMember, FamilyTree } from '../../types/socialRoles';

// Avatar pulls from the network/avatar service — stub it for an isolated render.
vi.mock('../characters/CharacterAvatar', () => ({
  CharacterAvatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));

const isMobileMock = vi.fn(() => false);
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => isMobileMock(),
}));

beforeAll(() => {
  // jsdom has no ResizeObserver; FamilyTreeView observes its container.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const tree: FamilyTree = {
  self_id: 'me',
  branches: [],
  members: [
    { id: 'me', name: 'You', relation: 'related', relation_label: 'You', generation: 0, is_self: true },
    {
      id: 'char-1',
      name: 'Goth Tio',
      relation: 'uncle',
      relation_label: 'Uncle',
      generation: -1,
      has_card: true,
      needs_review: true,
      review_reason: 'Kinship word is not at the start of the name — likely a nickname.',
    },
  ],
};

describe('inferEdges — explicit parent links', () => {
  const m = (over: Partial<FamilyMember> & { id: string; generation: number }): FamilyMember => ({
    name: over.id,
    relation: 'related',
    relation_label: 'Relative',
    ...over,
  });

  it('honors an explicit parent_id and drops the inferred connector for that child', () => {
    const members: FamilyMember[] = [
      m({ id: 'me', generation: 0, is_self: true }),
      m({ id: 'mom', generation: -1, relation: 'parent', side: 'maternal' }),
      m({ id: 'aunt', generation: -1, relation: 'aunt', side: 'maternal' }),
      // Cousin explicitly re-parented to the aunt (not auto-guessed).
      m({ id: 'cousin', generation: 0, relation: 'cousin', side: 'maternal', parent_id: 'aunt' }),
    ];
    const edges = inferEdges(members);
    expect(edges).toContainEqual({ from: 'aunt', to: 'cousin' });
    // No other parent connector for the cousin.
    expect(edges.filter(e => e.to === 'cousin')).toHaveLength(1);
  });

  it('ignores a parent_id that points at a missing member or itself', () => {
    const members: FamilyMember[] = [
      m({ id: 'me', generation: 0, is_self: true }),
      m({ id: 'x', generation: 0, relation: 'cousin', parent_id: 'ghost' }),
      m({ id: 'y', generation: 0, relation: 'cousin', parent_id: 'y' }),
    ];
    const edges = inferEdges(members);
    expect(edges.some(e => e.from === 'ghost' || e.to === 'y' && e.from === 'y')).toBe(false);
  });

  it('connects cousins to an aunt even when the aunt side is other', () => {
    const members: FamilyMember[] = [
      m({ id: 'me', generation: 0, is_self: true }),
      m({ id: 'grace', generation: -1, relation: 'aunt', side: 'other' }),
      m({ id: 'jerry', generation: 0, relation: 'cousin', side: 'maternal' }),
      m({ id: 'james', generation: 0, relation: 'cousin', side: 'maternal' }),
    ];
    const edges = inferEdges(members);
    expect(edges).toContainEqual({ from: 'grace', to: 'jerry' });
    expect(edges).toContainEqual({ from: 'grace', to: 'james' });
  });

  it('does not draw a niece or nephew as the selected character’s child', () => {
    const members: FamilyMember[] = [
      m({ id: 'uncle', generation: 0, is_self: true }),
      m({
        id: 'mother',
        generation: 0,
        relation: 'sibling',
        parent_id: 'grandmother',
      }),
      m({
        id: 'marcus',
        generation: 1,
        relation: 'niece',
        parent_id: 'mother',
        is_account_self: true,
      }),
      m({ id: 'grandmother', generation: -1, relation: 'parent' }),
    ];

    const edges = inferEdges(members);
    expect(edges).toContainEqual({ from: 'mother', to: 'marcus' });
    expect(edges).not.toContainEqual({ from: 'uncle', to: 'marcus' });
  });

  // Married pairs don't always share every child (blended families) — a
  // step_child is explicitly NOT self's biological/legal child, which means
  // self's spouse is the one who actually is. Both edges should show: self's
  // step-relationship, and the spouse's real parent-child connection.
  it('draws an edge from self\'s spouse to a step-child (the spouse\'s actual child)', () => {
    const members: FamilyMember[] = [
      m({ id: 'me', generation: 0, is_self: true }),
      m({ id: 'spouse', generation: 0, relation: 'spouse' }),
      m({ id: 'kid', generation: 1, relation: 'step_child' }),
    ];
    const edges = inferEdges(members);
    expect(edges).toContainEqual({ from: 'spouse', to: 'kid' });
    expect(edges).toContainEqual({ from: 'me', to: 'kid' });
  });

  it('does not assume self\'s spouse shares self\'s own (non-step) child', () => {
    const members: FamilyMember[] = [
      m({ id: 'me', generation: 0, is_self: true }),
      m({ id: 'spouse', generation: 0, relation: 'spouse' }),
      m({ id: 'kid', generation: 1, relation: 'child' }),
    ];
    const edges = inferEdges(members);
    expect(edges).toContainEqual({ from: 'me', to: 'kid' });
    expect(edges).not.toContainEqual({ from: 'spouse', to: 'kid' });
  });

  it('does not draw a spouse edge to a step-child when self has no spouse in the tree', () => {
    const members: FamilyMember[] = [
      m({ id: 'me', generation: 0, is_self: true }),
      m({ id: 'kid', generation: 1, relation: 'step_child' }),
    ];
    const edges = inferEdges(members);
    expect(edges).toContainEqual({ from: 'me', to: 'kid' });
    expect(edges.filter((e) => e.to === 'kid')).toHaveLength(1);
  });
});

describe('inferEdges — ancestors/descendants beyond great-grandparent/grandchild', () => {
  const m = (over: Partial<FamilyMember> & { id: string; generation: number }): FamilyMember => ({
    name: over.id,
    relation: 'related',
    relation_label: 'Relative',
    ...over,
  });

  it('connects a great-great-grandparent down to the great-grandparent by side, even though nothing hand-codes generation -4', () => {
    const members: FamilyMember[] = [
      m({ id: 'me', generation: 0, is_self: true }),
      m({ id: 'mom', generation: -1, relation: 'parent', side: 'maternal' }),
      m({ id: 'grandma', generation: -2, relation: 'grandparent', side: 'maternal' }),
      m({ id: 'great-grandma', generation: -3, relation: 'related', side: 'maternal' }),
      m({ id: 'great-great-grandma', generation: -4, relation: 'related', side: 'maternal' }),
    ];
    const edges = inferEdges(members);
    expect(edges).toContainEqual({ from: 'great-great-grandma', to: 'great-grandma' });
    expect(edges).toContainEqual({ from: 'great-grandma', to: 'grandma' });
  });

  it('does not connect a distant ancestor to a mismatched side', () => {
    const members: FamilyMember[] = [
      m({ id: 'me', generation: 0, is_self: true }),
      m({ id: 'great-grandma', generation: -3, relation: 'related', side: 'maternal' }),
      m({ id: 'great-great-grandpa', generation: -4, relation: 'related', side: 'paternal' }),
    ];
    const edges = inferEdges(members);
    expect(edges.filter((e) => e.from === 'great-great-grandpa')).toHaveLength(0);
  });

  it('connects a great-great-grandchild up to the great-grandchild by side', () => {
    const members: FamilyMember[] = [
      m({ id: 'me', generation: 0, is_self: true }),
      m({ id: 'kid', generation: 1, relation: 'child', side: 'maternal' }),
      m({ id: 'grandkid', generation: 2, relation: 'grandchild', side: 'maternal' }),
      m({ id: 'great-grandkid', generation: 3, relation: 'related', side: 'maternal' }),
      m({ id: 'great-great-grandkid', generation: 4, relation: 'related', side: 'maternal' }),
    ];
    const edges = inferEdges(members);
    expect(edges).toContainEqual({ from: 'great-grandkid', to: 'great-great-grandkid' });
    expect(edges).toContainEqual({ from: 'grandkid', to: 'great-grandkid' });
  });

  it('leaves the hand-tuned -3..+2 range untouched (no duplicate/competing edges)', () => {
    const members: FamilyMember[] = [
      m({ id: 'me', generation: 0, is_self: true }),
      m({ id: 'mom', generation: -1, relation: 'parent', side: 'maternal' }),
      m({ id: 'grandma', generation: -2, relation: 'grandparent', side: 'maternal' }),
    ];
    const edges = inferEdges(members);
    expect(edges.filter((e) => e.from === 'grandma' && e.to === 'mom')).toHaveLength(1);
  });
});

describe('generationLabel', () => {
  it('uses the named labels for the common range', () => {
    expect(generationLabel(0)).toBe('Your Generation');
    expect(generationLabel(-1)).toBe('Parents / Aunts / Uncles');
    expect(generationLabel(-2)).toBe('Grandparents');
    expect(generationLabel(-3)).toBe('Great-Grandparents');
    expect(generationLabel(1)).toBe('Children');
    expect(generationLabel(2)).toBe('Grandchildren');
  });

  it('spells out up to 3 "Great-"s for distant ancestors/descendants', () => {
    expect(generationLabel(-4)).toBe('Great-Great-Grandparents');
    expect(generationLabel(-5)).toBe('Great-Great-Great-Grandparents');
    expect(generationLabel(4)).toBe('Great-Great-Grandchildren');
  });

  it('switches to numeric N×-Great- notation beyond 3 greats', () => {
    expect(generationLabel(-6)).toBe('4×-Great-Grandparents');
    expect(generationLabel(-10)).toBe('8×-Great-Grandparents');
    expect(generationLabel(7)).toBe('5×-Great-Grandchildren');
  });
});

describe('FamilyTreeView — edit affordances', () => {
  it('shows a review flag on suspect nodes', () => {
    render(<FamilyTreeView tree={tree} />);
    expect(screen.getByTestId('review-flag-char-1')).toBeInTheDocument();
  });

  it('opens the node menu and fires the matching callback', () => {
    const onExclude = vi.fn();
    const onEditRelationship = vi.fn();
    render(<FamilyTreeView tree={tree} onExclude={onExclude} onEditRelationship={onEditRelationship} />);

    fireEvent.click(screen.getByTestId('node-menu-char-1'));
    fireEvent.click(screen.getByText('Remove from family'));

    expect(onExclude).toHaveBeenCalledTimes(1);
    expect(onExclude.mock.calls[0][0].id).toBe('char-1');
    expect(onEditRelationship).not.toHaveBeenCalled();
  });

  it('fires Move to Groups from the node menu', () => {
    const onMoveToGroup = vi.fn();
    render(<FamilyTreeView tree={tree} onMoveToGroup={onMoveToGroup} onExclude={vi.fn()} />);

    fireEvent.click(screen.getByTestId('node-menu-char-1'));
    fireEvent.click(screen.getByTestId('move-to-group-char-1'));

    expect(onMoveToGroup).toHaveBeenCalledTimes(1);
    expect(onMoveToGroup.mock.calls[0][0].id).toBe('char-1');
  });

  it('does not render an edit menu for the self node', () => {
    render(<FamilyTreeView tree={tree} onExclude={vi.fn()} />);
    expect(screen.queryByTestId('node-menu-me')).not.toBeInTheDocument();
  });

  it('opens a member card on node click', () => {
    const onMemberClick = vi.fn();
    render(<FamilyTreeView tree={tree} onMemberClick={onMemberClick} />);
    fireEvent.click(screen.getByTitle(/Goth Tio/));
    expect(onMemberClick).toHaveBeenCalledTimes(1);
    expect(onMemberClick.mock.calls[0][0].id).toBe('char-1');
  });
});

describe('FamilyTreeView — drag-to-reorder (placement editing)', () => {
  const rowTree: FamilyTree = {
    self_id: 'me',
    branches: [],
    members: [
      { id: 'me', name: 'You', relation: 'related', relation_label: 'You', generation: 0, is_self: true },
      { id: 'aunt-1', name: 'Ana Ruiz', relation: 'aunt', relation_label: 'Aunt', generation: -1 },
      { id: 'uncle-1', name: 'Ben Ruiz', relation: 'uncle', relation_label: 'Uncle', generation: -1 },
    ],
  };

  it('does not show the Reorder toggle without onReorderRow', () => {
    render(<FamilyTreeView tree={rowTree} />);
    expect(screen.queryByRole('button', { name: /reorder/i })).toBeNull();
  });

  it('shows the Reorder toggle when onReorderRow is provided, and locks by default', () => {
    render(<FamilyTreeView tree={rowTree} onReorderRow={vi.fn()} />);
    expect(screen.getByRole('button', { name: /reorder/i })).toBeInTheDocument();
    expect(document.querySelector('[draggable="true"]')).toBeNull();
    expect(screen.queryByLabelText(/move .* right/i)).toBeNull();
  });

  it('unlocks dragging on desktop and mobile arrows on mobile after toggling Reorder', () => {
    isMobileMock.mockReturnValue(false);
    const { unmount } = render(<FamilyTreeView tree={rowTree} onReorderRow={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /reorder/i }));
    expect(document.querySelector('[draggable="true"]')).not.toBeNull();
    expect(screen.queryByLabelText(/move .* right/i)).toBeNull();
    unmount();

    isMobileMock.mockReturnValue(true);
    render(<FamilyTreeView tree={rowTree} onReorderRow={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /reorder/i }));
    expect(document.querySelector('[draggable="true"]')).toBeNull();
    expect(screen.getByLabelText('Move Ana Ruiz right')).toBeInTheDocument();
    isMobileMock.mockReturnValue(false);
  });

  it('reorders via mobile arrows and saves the new order for that row only', async () => {
    isMobileMock.mockReturnValue(true);
    const onReorderRow = vi.fn().mockResolvedValue(undefined);
    render(<FamilyTreeView tree={rowTree} onReorderRow={onReorderRow} />);

    fireEvent.click(screen.getByRole('button', { name: /reorder/i }));
    fireEvent.click(screen.getByLabelText('Move Ana Ruiz right'));
    expect(onReorderRow).not.toHaveBeenCalled(); // not saved yet — just a local working order

    fireEvent.click(screen.getByRole('button', { name: /save order/i }));
    await Promise.resolve();

    expect(onReorderRow).toHaveBeenCalledTimes(1);
    expect(onReorderRow).toHaveBeenCalledWith(['uncle-1', 'aunt-1']);
    isMobileMock.mockReturnValue(false);
  });

  it('leaves the self node out of reordering — no move controls on it', () => {
    isMobileMock.mockReturnValue(true);
    render(<FamilyTreeView tree={rowTree} onReorderRow={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /reorder/i }));
    expect(screen.queryByLabelText(/move you /i)).toBeNull();
    isMobileMock.mockReturnValue(false);
  });
});
