// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { describe, it, expect } from 'vitest';
import { render, screen } from '../../../test/utils';
import { RelationshipTimeline } from '../RelationshipTimeline';

describe('RelationshipTimeline', () => {
  const mockRelationship = {
    id: 'rel-001',
    person_id: 'char-001',
    person_name: 'Alex',
    start_date: '2024-01-01T00:00:00Z',
    end_date: undefined,
    status: 'active',
  } as const;

  const mockDates = [
    {
      id: 'date-001',
      date_type: 'first_date',
      date_time: '2024-01-15T00:00:00Z',
      location: 'Coffee shop',
      description: 'First date',
      sentiment: 0.9,
      was_positive: true,
    },
    {
      id: 'date-002',
      date_type: 'first_kiss',
      date_time: '2024-01-20T00:00:00Z',
      location: 'Park',
      description: 'First kiss',
      sentiment: 0.95,
      was_positive: true,
    },
  ];

  it('renders intimacy arc header and bond period', () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={[]}
        relationship={mockRelationship as any}
      />
    );

    expect(screen.getByText(/intimacy & connection arc/i)).toBeInTheDocument();
    expect(screen.getByText(/bond period/i)).toBeInTheDocument();
    expect(screen.getByText(/connected since/i)).toBeInTheDocument();
  });

  it('shows ongoing badge when no end date', () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={[]}
        relationship={mockRelationship as any}
      />
    );

    expect(screen.getByText(/ongoing bond/i)).toBeInTheDocument();
  });

  it('shows end date when provided', () => {
    const endedRelationship = {
      ...mockRelationship,
      end_date: '2024-06-01T00:00:00Z',
    };

    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={[]}
        relationship={endedRelationship as any}
      />
    );

    expect(screen.getByText(/ended/i)).toBeInTheDocument();
  });

  it('renders empty state when no dates', () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={[]}
        relationship={mockRelationship as any}
      />
    );

    expect(screen.getByText(/no intimacy milestones yet/i)).toBeInTheDocument();
  });

  it('renders intimacy milestones and character book link', () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={mockDates}
        relationship={mockRelationship as any}
        scores={{
          affectionScore: 0.92,
          healthScore: 0.9,
          intensityScore: 0.88,
        }}
      />
    );

    expect(screen.getByText(/intimacy milestones/i)).toBeInTheDocument();
    expect(screen.getByTestId('open-character-book-timeline')).toBeInTheDocument();
    expect(screen.getAllByText(/first date/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/first kiss/i).length).toBeGreaterThan(0);
    expect(screen.getByText('92%')).toBeInTheDocument();
  });

  it('sorts dates chronologically', () => {
    const unsortedDates = [
      {
        id: 'date-002',
        date_type: 'first_kiss',
        date_time: '2024-01-20T00:00:00Z',
        description: 'First kiss',
      },
      {
        id: 'date-001',
        date_type: 'first_date',
        date_time: '2024-01-15T00:00:00Z',
        description: 'First date',
      },
    ];

    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={unsortedDates}
        relationship={mockRelationship as any}
      />
    );

    const dates = screen.getAllByText(/first (date|kiss)/i);
    expect(dates[0].textContent).toMatch(/first date/i);
  });

  it('displays location when provided', () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={mockDates}
        relationship={mockRelationship as any}
      />
    );

    expect(screen.getByText('Coffee shop')).toBeInTheDocument();
  });
});
