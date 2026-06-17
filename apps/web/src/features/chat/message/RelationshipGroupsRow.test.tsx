import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelationshipGroupsRow } from './RelationshipGroupsRow';

describe('RelationshipGroupsRow', () => {
  it('renders scope labels and entity names', () => {
    render(
      <RelationshipGroupsRow
        groups={[
          { scope: 'FAMILY', entityNames: ['Marcus', 'Grandma Rose'], confidence: 0.9 },
          { scope: 'PROFESSIONAL', entityNames: ['Armstrong Robotics'] },
        ]}
      />
    );

    expect(screen.getByText('relationships:')).toBeInTheDocument();
    expect(screen.getByText(/family:/)).toBeInTheDocument();
    expect(screen.getByText(/Marcus, Grandma Rose/)).toBeInTheDocument();
    expect(screen.getByText(/work:/)).toBeInTheDocument();
    expect(screen.getByText('Armstrong Robotics')).toBeInTheDocument();
  });

  it('returns null when groups are empty', () => {
    const { container } = render(<RelationshipGroupsRow groups={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
