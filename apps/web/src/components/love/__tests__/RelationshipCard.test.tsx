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
    relationship_type: 'boyfriend',
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
    rank_among_active: 1
  };

  it('renders relationship card', () => {
    const onClick = vi.fn();
    render(<RelationshipCard relationship={mockRelationship} onClick={onClick} />);
    
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText(/boyfriend/i)).toBeInTheDocument();
  });

  it('displays relationship scores', () => {
    const onClick = vi.fn();
    render(<RelationshipCard relationship={mockRelationship} onClick={onClick} />);
    
    expect(screen.getByText('92%')).toBeInTheDocument(); // affection_score
    expect(screen.getByText('95%')).toBeInTheDocument(); // compatibility_score
    expect(screen.getByText('90%')).toBeInTheDocument(); // relationship_health
  });

  it('displays status badge', () => {
    const onClick = vi.fn();
    render(<RelationshipCard relationship={mockRelationship} onClick={onClick} />);
    
    expect(screen.getByText(/active/i)).toBeInTheDocument();
  });

  it('displays red flags when present', () => {
    const relationshipWithRedFlags = {
      ...mockRelationship,
      red_flags: ['Avoids commitment']
    };
    const onClick = vi.fn();
    render(<RelationshipCard relationship={relationshipWithRedFlags} onClick={onClick} />);
    
    expect(screen.getByText('Avoids commitment')).toBeInTheDocument();
  });

  it('displays green flags when present', () => {
    const onClick = vi.fn();
    render(<RelationshipCard relationship={mockRelationship} onClick={onClick} />);
    
    expect(screen.getByText('Follows through')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<RelationshipCard relationship={mockRelationship} onClick={onClick} />);
    
    const card = screen.getByText('Alex').closest('div[class*="cursor-pointer"]');
    if (card) {
      card.click();
      expect(onClick).toHaveBeenCalledTimes(1);
    }
  });

  it('displays duration when start_date is provided', () => {
    const onClick = vi.fn();
    render(<RelationshipCard relationship={mockRelationship} onClick={onClick} />);
    
    // Should show duration (days/months/years)
    expect(screen.getByText(/duration/i)).toBeInTheDocument();
  });

  it('handles missing person name gracefully', () => {
    const relationshipWithoutName = {
      ...mockRelationship,
      person_name: undefined
    };
    const onClick = vi.fn();
    render(<RelationshipCard relationship={relationshipWithoutName} onClick={onClick} />);
    
    // Should fallback to relationship type
    expect(screen.getByText(/boyfriend/i)).toBeInTheDocument();
  });
});
