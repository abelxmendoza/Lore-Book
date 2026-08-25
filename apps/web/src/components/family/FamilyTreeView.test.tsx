import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FamilyTreeView, inferEdges } from './FamilyTreeView';
import type { FamilyMember, FamilyTree } from '../../types/socialRoles';

// Avatar pulls from the network/avatar service — stub it for an isolated render.
vi.mock('../characters/CharacterAvatar', () => ({
  CharacterAvatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
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
