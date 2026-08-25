import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FamilyTreeView, inferEdges } from './FamilyTreeView';
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

describe('inferEdges — disconnected_parent suppresses every connector rule', () => {
  const m = (over: Partial<FamilyMember> & { id: string; generation: number }): FamilyMember => ({
    name: over.id,
    relation: 'related',
    relation_label: 'Relative',
    ...over,
  });

  it('drops the inferred connector for a member who explicitly disconnected', () => {
    const members: FamilyMember[] = [
      m({ id: 'me', generation: 0, is_self: true }),
      m({ id: 'mom', generation: -1, relation: 'parent', side: 'maternal' }),
      m({ id: 'grandma', generation: -2, relation: 'grandparent', side: 'maternal', disconnected_parent: true }),
    ];
    const edges = inferEdges(members);
    expect(edges.filter((e) => e.to === 'grandma')).toHaveLength(0);
  });

  it('wins even over an explicit parent_id (disconnect is the terminal state)', () => {
    const members: FamilyMember[] = [
      m({ id: 'me', generation: 0, is_self: true }),
      m({ id: 'aunt', generation: -1, relation: 'aunt', side: 'maternal' }),
      m({ id: 'cousin', generation: 0, relation: 'cousin', parent_id: 'aunt', disconnected_parent: true }),
    ];
    const edges = inferEdges(members);
    expect(edges.filter((e) => e.to === 'cousin')).toHaveLength(0);
  });

  it('does not affect anyone else in the tree', () => {
    const members: FamilyMember[] = [
      m({ id: 'me', generation: 0, is_self: true }),
      m({ id: 'mom', generation: -1, relation: 'parent', side: 'maternal' }),
      m({ id: 'grandma', generation: -2, relation: 'grandparent', side: 'maternal', disconnected_parent: true }),
      m({ id: 'dad', generation: -1, relation: 'parent', side: 'paternal' }),
    ];
    const edges = inferEdges(members);
    expect(edges).toContainEqual({ from: 'dad', to: 'me' });
    expect(edges).toContainEqual({ from: 'mom', to: 'me' });
  });
});

describe('FamilyTreeView — Connect mode', () => {
  const rowTree: FamilyTree = {
    self_id: 'me',
    branches: [],
    members: [
      { id: 'me', name: 'You', relation: 'related', relation_label: 'You', generation: 0, is_self: true },
      { id: 'aunt-1', name: 'Ana Ruiz', relation: 'aunt', relation_label: 'Aunt', generation: -1 },
      { id: 'uncle-1', name: 'Ben Ruiz', relation: 'uncle', relation_label: 'Uncle', generation: -1 },
    ],
  };

  it('does not show the Connect toggle without onConnectMembers', () => {
    render(<FamilyTreeView tree={rowTree} />);
    expect(screen.queryByRole('button', { name: /^connect$/i })).toBeNull();
  });

  it('shows the Connect toggle when onConnectMembers is provided', () => {
    render(<FamilyTreeView tree={rowTree} onConnectMembers={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeInTheDocument();
  });

  it('tap-tap on mobile opens the quick-pick and confirming "parent" calls onConnectMembers', async () => {
    isMobileMock.mockReturnValue(true);
    const onConnectMembers = vi.fn().mockResolvedValue(undefined);
    render(<FamilyTreeView tree={rowTree} onConnectMembers={onConnectMembers} />);

    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));
    fireEvent.click(screen.getAllByText('Ana Ruiz')[0]);
    fireEvent.click(screen.getAllByText('Ben Ruiz')[0]);

    expect(screen.getByText(/is Ben Ruiz's parent/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/is Ben Ruiz's parent/i));
    await Promise.resolve();

    expect(onConnectMembers).toHaveBeenCalledWith(expect.objectContaining({ id: 'aunt-1' }), expect.objectContaining({ id: 'uncle-1' }), 'parent');
    isMobileMock.mockReturnValue(false);
  });

  it('offers the "married to" option only when both people share a generation', async () => {
    isMobileMock.mockReturnValue(true);
    const onConnectMembers = vi.fn().mockResolvedValue(undefined);
    render(<FamilyTreeView tree={rowTree} onConnectMembers={onConnectMembers} />);

    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));
    fireEvent.click(screen.getAllByText('Ana Ruiz')[0]);
    fireEvent.click(screen.getAllByText('Ben Ruiz')[0]);
    expect(screen.getByText(/married to.*partnered with/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/married to.*partnered with/i));
    await Promise.resolve();
    expect(onConnectMembers).toHaveBeenCalledWith(expect.objectContaining({ id: 'aunt-1' }), expect.objectContaining({ id: 'uncle-1' }), 'spouse');
    isMobileMock.mockReturnValue(false);
  });

  it('Cancel dismisses the quick-pick without calling onConnectMembers', () => {
    isMobileMock.mockReturnValue(true);
    const onConnectMembers = vi.fn();
    render(<FamilyTreeView tree={rowTree} onConnectMembers={onConnectMembers} />);

    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));
    fireEvent.click(screen.getAllByText('Ana Ruiz')[0]);
    fireEvent.click(screen.getAllByText('Ben Ruiz')[0]);
    fireEvent.click(screen.getByText('Cancel'));

    expect(onConnectMembers).not.toHaveBeenCalled();
    expect(screen.queryByText('Cancel')).toBeNull();
    isMobileMock.mockReturnValue(false);
  });
});
