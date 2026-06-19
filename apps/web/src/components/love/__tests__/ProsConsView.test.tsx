// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

import { describe, it, expect } from 'vitest';
import { render, screen } from '../../../test/utils';
import { ProsConsView } from '../ProsConsView';

describe('ProsConsView', () => {
  const mockProps = {
    relationshipId: 'rel-001',
    pros: ['Great communication', 'Supportive', 'Fun to be around'],
    cons: ['Sometimes busy', 'Can be forgetful'],
    redFlags: ['Avoids commitment'],
    greenFlags: ['Introduces to family', 'Follows through'],
    onUpdate: undefined
  };

  it('renders pros and cons', () => {
    render(<ProsConsView {...mockProps} />);
    
    expect(screen.getByText(/pros \(3\)/i)).toBeInTheDocument();
    expect(screen.getByText(/cons \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText('Great communication')).toBeInTheDocument();
    expect(screen.getByText('Sometimes busy')).toBeInTheDocument();
  });

  it('renders red flags and green flags when provided', () => {
    render(<ProsConsView {...mockProps} />);
    
    expect(screen.getByText(/red flags \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/green flags \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText('Avoids commitment')).toBeInTheDocument();
    expect(screen.getByText('Introduces to family')).toBeInTheDocument();
  });

  it('shows empty state when no pros', () => {
    render(<ProsConsView {...mockProps} pros={[]} />);
    
    expect(screen.getByText(/no pros added yet/i)).toBeInTheDocument();
  });

  it('shows empty state when no cons', () => {
    render(<ProsConsView {...mockProps} cons={[]} />);
    
    expect(screen.getByText(/no cons added yet/i)).toBeInTheDocument();
  });

  it('shows flag panels with empty messages when no flags', () => {
    render(<ProsConsView {...mockProps} redFlags={[]} greenFlags={[]} />);

    expect(screen.getByText(/red flags \(0\)/i)).toBeInTheDocument();
    expect(screen.getByText(/green flags \(0\)/i)).toBeInTheDocument();
    expect(screen.getByText(/no red flags identified/i)).toBeInTheDocument();
  });

  it('displays chat prompt', () => {
    render(<ProsConsView {...mockProps} />);
    
    expect(screen.getByText(/want to add or update pros\/cons\?/i)).toBeInTheDocument();
  });
});
