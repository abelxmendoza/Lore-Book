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
