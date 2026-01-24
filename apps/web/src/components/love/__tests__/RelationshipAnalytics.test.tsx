// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { describe, it, expect } from 'vitest';
import { render, screen } from '../../../test/utils';
import { RelationshipAnalytics } from '../RelationshipAnalytics';

describe('RelationshipAnalytics', () => {
  const mockAnalytics = {
    relationshipId: 'rel-001',
    personId: 'char-001',
    personName: 'Alex',
    affectionScore: 0.92,
    compatibilityScore: 0.95,
    healthScore: 0.90,
    intensityScore: 0.88,
    strengths: ['Great communication', 'Supportive'],
    weaknesses: ['Sometimes busy'],
    pros: ['Fun to be around'],
    cons: ['Can be forgetful'],
    redFlags: [],
    greenFlags: ['Follows through'],
    insights: ['Strong compatibility', 'Healthy communication'],
    recommendations: ['Continue nurturing', 'Keep communicating'],
    affectionTrend: 'increasing',
    healthTrend: 'improving',
    calculatedAt: new Date().toISOString()
  };

  it('renders analytics dashboard', () => {
    render(
      <RelationshipAnalytics
        relationshipId="rel-001"
        analytics={mockAnalytics}
      />
    );
    
    expect(screen.getByText(/relationship health dashboard/i)).toBeInTheDocument();
  });

  it('displays all score metrics', () => {
    render(
      <RelationshipAnalytics
        relationshipId="rel-001"
        analytics={mockAnalytics}
      />
    );
    // Each metric appears in the main cards and in Score Overview, so use getAllByText
    expect(screen.getAllByText(/affection/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/compatibility/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/health/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/intensity/i).length).toBeGreaterThan(0);
  });

  it('displays score percentages correctly', () => {
    render(
      <RelationshipAnalytics
        relationshipId="rel-001"
        analytics={mockAnalytics}
      />
    );
    // Each score appears in the main cards and in Score Overview, so use getAllByText
    expect(screen.getAllByText('92%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('95%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('90%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('88%').length).toBeGreaterThan(0);
  });

  it('displays strengths and weaknesses', () => {
    render(
      <RelationshipAnalytics
        relationshipId="rel-001"
        analytics={mockAnalytics}
      />
    );
    
    expect(screen.getByText(/strengths/i)).toBeInTheDocument();
    expect(screen.getByText(/weaknesses/i)).toBeInTheDocument();
    expect(screen.getByText('Great communication')).toBeInTheDocument();
    expect(screen.getByText('Sometimes busy')).toBeInTheDocument();
  });

  it('displays insights when provided', () => {
    render(
      <RelationshipAnalytics
        relationshipId="rel-001"
        analytics={mockAnalytics}
      />
    );
    
    expect(screen.getByText(/ai insights/i)).toBeInTheDocument();
    // Insight text may include a bullet prefix in the list item
    expect(screen.getByText(/strong compatibility/i)).toBeInTheDocument();
  });

  it('displays recommendations when provided', () => {
    render(
      <RelationshipAnalytics
        relationshipId="rel-001"
        analytics={mockAnalytics}
      />
    );
    
    expect(screen.getByText(/recommendations/i)).toBeInTheDocument();
    expect(screen.getByText('Continue nurturing')).toBeInTheDocument();
  });

  it('hides strengths section when empty', () => {
    const analyticsWithoutStrengths = {
      ...mockAnalytics,
      strengths: []
    };
    
    render(
      <RelationshipAnalytics
        relationshipId="rel-001"
        analytics={analyticsWithoutStrengths}
      />
    );
    
    expect(screen.queryByText(/strengths/i)).not.toBeInTheDocument();
  });

  it('hides weaknesses section when empty', () => {
    const analyticsWithoutWeaknesses = {
      ...mockAnalytics,
      weaknesses: []
    };
    
    render(
      <RelationshipAnalytics
        relationshipId="rel-001"
        analytics={analyticsWithoutWeaknesses}
      />
    );
    
    expect(screen.queryByText(/weaknesses/i)).not.toBeInTheDocument();
  });

  it('hides insights section when empty', () => {
    const analyticsWithoutInsights = {
      ...mockAnalytics,
      insights: []
    };
    
    render(
      <RelationshipAnalytics
        relationshipId="rel-001"
        analytics={analyticsWithoutInsights}
      />
    );
    
    expect(screen.queryByText(/ai insights/i)).not.toBeInTheDocument();
  });

  it('hides recommendations section when empty', () => {
    const analyticsWithoutRecommendations = {
      ...mockAnalytics,
      recommendations: []
    };
    
    render(
      <RelationshipAnalytics
        relationshipId="rel-001"
        analytics={analyticsWithoutRecommendations}
      />
    );
    
    expect(screen.queryByText(/recommendations/i)).not.toBeInTheDocument();
  });

  it('displays trend indicators', () => {
    render(
      <RelationshipAnalytics
        relationshipId="rel-001"
        analytics={mockAnalytics}
      />
    );
    
    // Should show trend text
    expect(screen.getByText(/increasing/i)).toBeInTheDocument();
    expect(screen.getByText(/improving/i)).toBeInTheDocument();
  });
});
