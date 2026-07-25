import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrganizationActivityPanel } from './OrganizationActivityPanel';
import type { Organization, OrganizationEvent } from './OrganizationProfileCard';

vi.mock('./OrganizationTimelinePanel', () => ({
  OrganizationTimelinePanel: ({ organization }: { organization: Organization }) => (
    <div data-testid="timeline-panel">{organization.name} Timeline</div>
  ),
}));

const org = {
  id: 'org-1',
  name: 'Northwind Crew',
  type: 'club',
  user_relationship: 'member',
  member_count: 0,
  usage_count: 0,
  confidence: 0.9,
  last_seen: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  status: 'active',
} as Organization;

const recorded: OrganizationEvent = {
  id: 'ev-1',
  title: 'Kickoff dinner',
  date: '2026-01-10',
  type: 'social',
};

describe('OrganizationActivityPanel', () => {
  it('shows group Timeline with soft-pedaled recorded milestones', () => {
    const onRemoveEvent = vi.fn();
    render(
      <OrganizationActivityPanel
        organization={org}
        derivedEvents={[]}
        recordedEvents={[recorded]}
        onAddEvent={vi.fn()}
        onRemoveEvent={onRemoveEvent}
        formatDate={(d) => d ?? ''}
      />,
    );

    expect(screen.getByTestId('org-timeline-panel')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-panel')).toHaveTextContent('Northwind Crew Timeline');
    expect(screen.getByTestId('org-timeline-recorded')).toBeInTheDocument();
    expect(screen.getByText('Recorded milestones')).toBeInTheDocument();
    expect(screen.getByText('Kickoff dinner')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Remove Kickoff dinner'));
    expect(onRemoveEvent).toHaveBeenCalledWith('ev-1');
  });
});
