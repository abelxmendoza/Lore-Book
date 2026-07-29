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
