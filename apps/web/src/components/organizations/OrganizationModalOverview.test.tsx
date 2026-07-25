import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrganizationModalOverview } from './OrganizationModalOverview';
import type { Organization, OrganizationMember } from './OrganizationProfileCard';

const org = {
  id: 'org-1',
  name: 'Northwind Crew',
  type: 'club',
  member_count: 1,
  usage_count: 0,
  confidence: 0.9,
  last_seen: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  status: 'active',
} as Organization;

const member: OrganizationMember = {
  id: 'mem-1',
  character_id: 'char-jamie',
  character_name: 'Jamie',
  status: 'active',
};

describe('OrganizationModalOverview — Key people', () => {
  it('opens a person when a Key people avatar is clicked', () => {
    const onMemberClick = vi.fn();
    render(
      <OrganizationModalOverview
        organization={org}
        allOrganizations={[org]}
        members={[member]}
        stories={[]}
        events={[]}
        locationCount={0}
        onTabChange={vi.fn()}
        onMemberClick={onMemberClick}
        onOpenChat={vi.fn()}
      />,
    );

    expect(screen.getByText('Key people')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('key-person-mem-1'));
    expect(onMemberClick).toHaveBeenCalledTimes(1);
    expect(onMemberClick.mock.calls[0][0]).toMatchObject({
      id: 'mem-1',
      character_id: 'char-jamie',
      character_name: 'Jamie',
    });
  });

  it('routes Activity quick-stat and recent derived activity to the Activity tab', () => {
    const onTabChange = vi.fn();
    render(
      <OrganizationModalOverview
        organization={org}
        allOrganizations={[org]}
        members={[]}
        stories={[]}
        events={[]}
        derivedEvents={[
          {
            id: 'd1',
            title: 'Tour stop',
            date: '2026-03-01',
            type: 'social',
            involved: ['Jamie'],
            source: 'conversation',
          },
        ]}
        locationCount={0}
        onTabChange={onTabChange}
        onOpenChat={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Activity'));
    expect(onTabChange).toHaveBeenCalledWith('activity');

    fireEvent.click(screen.getByText('Tour stop'));
    expect(onTabChange).toHaveBeenCalledWith('activity');
  });
});
