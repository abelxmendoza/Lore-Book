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

  it('routes Timeline quick-stat and recent derived activity to the Timeline tab', () => {
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

    fireEvent.click(screen.getByText('Timeline'));
    expect(onTabChange).toHaveBeenCalledWith('timeline');

    fireEvent.click(screen.getByText('Tour stop'));
    expect(onTabChange).toHaveBeenCalledWith('timeline');
  });

  it('leads with Latest and does not invent Mission / Involvement theater', () => {
    render(
      <OrganizationModalOverview
        organization={{
          ...org,
          description: 'Where I spent four years studying design.',
          membership_model: 'strict',
          location: 'Pomona, CA',
          usage_count: 6,
          analytics: {
            user_ranking: 3,
            user_involvement_score: 38,
            group_influence_on_user: 43,
            trend: 'stable',
          },
          profile: {
            purpose: 'Where I spent four years studying design.',
            values: ['Stewardship', 'Reliability', 'Standards'],
          },
        } as Organization}
        allOrganizations={[org]}
        members={[]}
        stories={[
          {
            id: 's1',
            title: 'Guest critique',
            summary: 'Sat in on a junior portfolio review.',
            date: '2026-02-01',
          },
        ]}
        events={[]}
        derivedEvents={[
          {
            id: 'd1',
            title: 'Milestone moment',
            date: '2026-03-01',
            type: 'social',
            involved: [],
            source: 'conversation',
            summary: 'A group-wide moment.',
          },
        ]}
        locationCount={1}
        onTabChange={vi.fn()}
        onOpenChat={vi.fn()}
      />,
    );

    expect(screen.getByText('Latest')).toBeInTheDocument();
    expect(screen.getByText('Milestone moment')).toBeInTheDocument();
    expect(screen.queryByText('Involvement details')).not.toBeInTheDocument();
    expect(screen.queryByText('Group signals')).not.toBeInTheDocument();
    expect(screen.queryByText('Mission')).not.toBeInTheDocument();
    expect(screen.queryByText('Stewardship')).not.toBeInTheDocument();
  });

  it('shows an honest empty state when there is no real content yet', () => {
    render(
      <OrganizationModalOverview
        organization={org}
        allOrganizations={[org]}
        members={[]}
        stories={[]}
        events={[]}
        locationCount={0}
        onTabChange={vi.fn()}
        onOpenChat={vi.fn()}
      />,
    );

    expect(screen.getByText(/Not much saved about this group yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Nothing here is invented/i)).toBeInTheDocument();
  });
});
