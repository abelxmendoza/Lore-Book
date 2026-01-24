// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { describe, it, expect } from 'vitest';
import { render, screen } from '../../../test/utils';
import { RelationshipTimeline } from '../RelationshipTimeline';

describe('RelationshipTimeline', () => {
  const mockRelationship = {
    id: 'rel-001',
    start_date: '2024-01-01T00:00:00Z',
    end_date: undefined,
    status: 'active'
  } as const;

  const mockDates = [
    {
      id: 'date-001',
      date_type: 'first_date',
      date_time: '2024-01-15T00:00:00Z',
      location: 'Coffee shop',
      description: 'First date',
      sentiment: 0.9,
      was_positive: true
    },
    {
      id: 'date-002',
      date_type: 'first_kiss',
      date_time: '2024-01-20T00:00:00Z',
      location: 'Park',
      description: 'First kiss',
      sentiment: 0.95,
      was_positive: true
    }
  ];

  it('renders relationship period', () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={[]}
        relationship={mockRelationship as any}
      />
    );
    
    expect(screen.getByText(/relationship period/i)).toBeInTheDocument();
    expect(screen.getByText(/started:/i)).toBeInTheDocument();
  });

  it('shows ongoing badge when no end date', () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={[]}
        relationship={mockRelationship as any}
      />
    );
    
    expect(screen.getByText(/ongoing/i)).toBeInTheDocument();
  });

  it('shows end date when provided', () => {
    const endedRelationship = {
      ...mockRelationship,
      end_date: '2024-06-01T00:00:00Z'
    };
    
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={[]}
        relationship={endedRelationship as any}
      />
    );
    
    expect(screen.getByText(/ended:/i)).toBeInTheDocument();
  });

  it('renders empty state when no dates', () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={[]}
        relationship={mockRelationship as any}
      />
    );
    
    expect(screen.getByText(/no milestones yet/i)).toBeInTheDocument();
  });

  it('renders date events', () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={mockDates}
        relationship={mockRelationship as any}
      />
    );
    
    expect(screen.getByText(/milestones & dates/i)).toBeInTheDocument();
    // Multiple elements contain "first date" (heading and description), so use getAllByText
    expect(screen.getAllByText(/first date/i).length).toBeGreaterThan(0);
    // Multiple elements contain "first kiss" (heading and description), so use getAllByText
    expect(screen.getAllByText(/first kiss/i).length).toBeGreaterThan(0);
  });

  it('sorts dates chronologically', () => {
    const unsortedDates = [
      {
        id: 'date-002',
        date_type: 'first_kiss',
        date_time: '2024-01-20T00:00:00Z',
        description: 'First kiss'
      },
      {
        id: 'date-001',
        date_type: 'first_date',
        date_time: '2024-01-15T00:00:00Z',
        description: 'First date'
      }
    ];
    
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={unsortedDates}
        relationship={mockRelationship as any}
      />
    );
    
    const dates = screen.getAllByText(/first (date|kiss)/i);
    // First date should appear before first kiss
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

  it('displays description when provided', () => {
    render(
      <RelationshipTimeline
        relationshipId="rel-001"
        dates={mockDates}
        relationship={mockRelationship as any}
      />
    );
    
    expect(screen.getByText('First date')).toBeInTheDocument();
  });
});
