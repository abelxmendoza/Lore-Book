import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrganizationActivityPanel } from './OrganizationActivityPanel';
import type { Organization, OrganizationEvent } from './OrganizationProfileCard';

vi.mock('./OrganizationTimelinePanel', () => ({
  OrganizationTimelinePanel: ({ title }: { title?: string }) => (
    <div data-testid="timeline-panel">{title ?? 'timeline'}</div>
  ),
}));

const org = {
  id: 'org-1',
  name: 'Northwind Crew',
  type: 'club',
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
  it('shows conversation timeline and recorded events in one surface', () => {
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

    expect(screen.getByTestId('org-activity-panel')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-panel')).toHaveTextContent('From your conversations');
    expect(screen.getByText('Kickoff dinner')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Remove Kickoff dinner'));
    expect(onRemoveEvent).toHaveBeenCalledWith('ev-1');
  });
});
