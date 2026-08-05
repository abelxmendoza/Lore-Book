// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../../../test/utils';
import { RelationshipCard } from '../RelationshipCard';

describe('RelationshipCard', () => {
  const mockRelationship = {
    id: 'rel-001',
    person_id: 'char-001',
    person_type: 'character' as const,
    person_name: 'Alex',
    relationship_type: 'girlfriend',
    status: 'active',
    is_current: true,
    affection_score: 0.92,
    emotional_intensity: 0.88,
    compatibility_score: 0.95,
    relationship_health: 0.90,
    is_situationship: false,
    exclusivity_status: 'exclusive',
    strengths: ['Great communication'],
    weaknesses: ['Sometimes busy'],
    pros: ['Fun to be around'],
    cons: ['Can be forgetful'],
    red_flags: [],
    green_flags: ['Follows through'],
    start_date: '2024-01-01T00:00:00Z',
    end_date: undefined,
    created_at: '2024-01-01T00:00:00Z',
    rank_among_all: 1,
    rank_among_active: 1,
  };

  it('renders a clean card with name and demo showcase tag', () => {
    const onClick = vi.fn();
    render(<RelationshipCard relationship={mockRelationship} onClick={onClick} />);

    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText(/exclusive · active partner/i)).toBeInTheDocument();
    expect(screen.getByText(/steadiest anchor/i)).toBeInTheDocument();
  });

  it('shows only the first two demo primary metrics', () => {
    const onClick = vi.fn();
    render(<RelationshipCard relationship={mockRelationship} onClick={onClick} />);
    // rel-001 primaryMetrics start with affection + compatibility
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.queryByText('90%')).not.toBeInTheDocument();
  });

  it('displays status tone via showcase badge', () => {
    const onClick = vi.fn();
    render(<RelationshipCard relationship={mockRelationship} onClick={onClick} />);
    expect(screen.getByText(/active partner/i)).toBeInTheDocument();
  });

  it('displays red flags when present', () => {
    const relationshipWithRedFlags = {
      ...mockRelationship,
      id: 'rel-unknown',
      red_flags: ['Avoids commitment'],
      green_flags: [] as string[],
    };
    const onClick = vi.fn();
    const { container } = render(
      <RelationshipCard relationship={relationshipWithRedFlags} onClick={onClick} />,
    );
    const redBlock = container.querySelector('[class*="text-red-300"]');
    expect(redBlock).toBeInTheDocument();
    expect(redBlock).toHaveTextContent('1');
  });

  it('displays green flags when present', () => {
    const onClick = vi.fn();
    const { container } = render(<RelationshipCard relationship={mockRelationship} onClick={onClick} />);
    const greenBlocks = container.querySelectorAll('[class*="text-green-300"]');
    const greenFlagsBlock = [...greenBlocks].find((el) => el.textContent?.trim() === '1');
    expect(greenFlagsBlock).toBeDefined();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<RelationshipCard relationship={mockRelationship} onClick={onClick} />);

    const card = screen.getByTestId('relationship-card-rel-001');
    card.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('displays compact duration when start_date is provided', () => {
    const onClick = vi.fn();
    render(<RelationshipCard relationship={mockRelationship} onClick={onClick} />);
    expect(screen.getByText(/\d+(d|mo|y)/)).toBeInTheDocument();
  });

  it('handles missing person name gracefully', () => {
    const relationshipWithoutName = {
      ...mockRelationship,
      id: 'rel-unknown',
      person_name: undefined,
    };
    const onClick = vi.fn();
    render(<RelationshipCard relationship={relationshipWithoutName} onClick={onClick} />);
    expect(screen.getAllByText(/girlfriend/i).length).toBeGreaterThan(0);
  });

  it('gives a committed active relationship its own emerald badge, distinct from a plain active default', () => {
    const onClick = vi.fn();
    const { container } = render(<RelationshipCard relationship={mockRelationship} onClick={onClick} />);
    const badge = container.querySelector('[class*="text-emerald-300"]');
    expect(badge).toBeInTheDocument();
  });

  it('gives a crush its own violet shade, not the same as a committed partner', () => {
    const onClick = vi.fn();
    const { container } = render(
      <RelationshipCard
        relationship={{ ...mockRelationship, id: 'rel-crush', relationship_type: 'crush' }}
        onClick={onClick}
      />,
    );
    expect(container.querySelector('[class*="text-violet-300"]')).toBeInTheDocument();
    expect(container.querySelector('[class*="text-emerald-300"]')).not.toBeInTheDocument();
  });

  it('labels one-sided, possible mutual, and mutual interest without overstating uncertainty', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <RelationshipCard
        relationship={{ ...mockRelationship, id: 'rel-yours', relationship_type: 'crush', metadata: { reciprocity: 'user_interest_only' } }}
        onClick={onClick}
      />,
    );
    expect(screen.getByText('Your interest')).toBeInTheDocument();

    rerender(
      <RelationshipCard
        relationship={{ ...mockRelationship, id: 'rel-possible', relationship_type: 'crush', metadata: { reciprocity: 'possible_mutual' } }}
        onClick={onClick}
      />,
    );
    expect(screen.getByText('Possible mutual crush')).toBeInTheDocument();

    rerender(
      <RelationshipCard
        relationship={{ ...mockRelationship, id: 'rel-mutual', relationship_type: 'crush', metadata: { reciprocity: 'mutual_interest' } }}
        onClick={onClick}
      />,
    );
    expect(screen.getByText('Mutual interest')).toBeInTheDocument();
  });

  it('gives a situationship its own fuchsia shade', () => {
    const onClick = vi.fn();
    const { container } = render(
      <RelationshipCard
        relationship={{ ...mockRelationship, id: 'rel-sit', relationship_type: 'situationship', is_situationship: true }}
        onClick={onClick}
      />,
    );
    expect(container.querySelector('[class*="text-fuchsia-300"]')).toBeInTheDocument();
  });

  it('gives ghosted, ended, and blocked each a distinct color instead of sharing one', () => {
    const onClick = vi.fn();
    const ghosted = render(
      <RelationshipCard relationship={{ ...mockRelationship, id: 'rel-g', status: 'ghosted' }} onClick={onClick} />,
    );
    expect(ghosted.container.querySelector('[class*="text-slate-300"]')).toBeInTheDocument();
    ghosted.unmount();

    const ended = render(
      <RelationshipCard relationship={{ ...mockRelationship, id: 'rel-e', status: 'ended' }} onClick={onClick} />,
    );
    expect(ended.container.querySelector('[class*="text-zinc-300"]')).toBeInTheDocument();
    ended.unmount();

    const blocked = render(
      <RelationshipCard relationship={{ ...mockRelationship, id: 'rel-b', status: 'blocked' }} onClick={onClick} />,
    );
    expect(blocked.container.querySelector('[class*="text-red-300"]')).toBeInTheDocument();
  });

  it('gives rekindled its own teal shade, distinct from active green', () => {
    const onClick = vi.fn();
    const { container } = render(
      <RelationshipCard relationship={{ ...mockRelationship, id: 'rel-r', status: 'rekindled' }} onClick={onClick} />,
    );
    expect(container.querySelector('[class*="text-teal-300"]')).toBeInTheDocument();
  });

  it('does not dump filter notes or pros/cons counts on the card', () => {
    const onClick = vi.fn();
    render(
      <RelationshipCard
        relationship={{
          ...mockRelationship,
          user_romantic_filter: { note: 'Set your confirmed sex and orientation to filter Dating & Romance.' },
          pros: ['a', 'b', 'c'],
          cons: ['x'],
        }}
        onClick={onClick}
      />,
    );
    expect(screen.queryByText(/confirmed sex/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pros:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cons:/i)).not.toBeInTheDocument();
  });
});
