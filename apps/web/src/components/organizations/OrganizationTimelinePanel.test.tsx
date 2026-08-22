import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OrganizationTimelinePanel } from './OrganizationTimelinePanel';
import type { Organization } from './OrganizationProfileCard';
import type { OrgDerivedEvent } from '../../mocks/organizationTimeline';

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

import { fetchJson } from '../../lib/api';

vi.mock('../timeline/EventTimelineSwimlanes', () => ({
  EventTimelineSwimlanes: ({
    lanes,
    events,
  }: {
    lanes: Array<{ key: string; label: string }>;
    events: Array<{ laneKey: string }>;
  }) => (
    <div data-testid="swimlanes">
      {lanes.map((lane) => (
        <div key={lane.key} data-testid={`lane-${lane.key}`}>
          {lane.label}:{events.filter((e) => e.laneKey === lane.key).length}
        </div>
      ))}
    </div>
  ),
}));

function makeOrg(partial: Partial<Organization>): Organization {
  return {
    id: 'org-1',
    name: 'Northwind Crew',
    aliases: [],
    type: 'club',
    group_type: 'club',
    membership_model: 'strict',
    user_relationship: 'member',
    is_public_entity: false,
    member_count: 0,
    usage_count: 0,
    confidence: 0.9,
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'active',
    ...partial,
  } as Organization;
}

const events: OrgDerivedEvent[] = [
  {
    id: '1',
    title: 'Hang with crew',
    date: '2026-01-01',
    type: 'social',
    involved: ['Jamie'],
    audience: 'with_user',
    user_was_present: true,
    source: 'conversation',
  },
  {
    id: '2',
    title: 'They met without me',
    date: '2026-01-02',
    type: 'social',
    involved: ['Marcus'],
    audience: 'without_user',
    source: 'conversation',
  },
  {
    id: '3',
    title: 'Crew milestone',
    date: '2026-01-03',
    type: 'other',
    involved: ['Jamie', 'Marcus'],
    audience: 'group_wide',
    source: 'conversation',
  },
];

describe('OrganizationTimelinePanel', () => {
  it('uses Mine stance voice with character-parity lanes', () => {
    render(
      <OrganizationTimelinePanel organization={makeOrg({ user_relationship: 'member' })} events={events} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /swimlanes/i }));

    expect(screen.getByTestId('org-timeline-stance')).toHaveAttribute('data-stance', 'mine');
    expect(screen.getByTestId('org-timeline-stance-badge')).toHaveTextContent('Mine');
    expect(screen.getByText(/Groups you belong to/i)).toBeInTheDocument();
    expect(screen.getByTestId('lane-with')).toHaveTextContent('With you:1');
    expect(screen.getByTestId('lane-without')).toHaveTextContent('Without you:2');
  });

  it('relabels lanes for Their world stance', () => {
    render(
      <OrganizationTimelinePanel
        organization={makeOrg({
          name: 'Vanguard Robotics',
          user_relationship: 'aware_of',
          members: [
            { id: 'm1', character_id: 'c1', character_name: 'Gary', status: 'active' },
          ],
        })}
        events={events}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /swimlanes/i }));

    expect(screen.getByTestId('org-timeline-stance')).toHaveAttribute('data-stance', 'their_world');
    expect(screen.getByTestId('org-timeline-stance-badge')).toHaveTextContent('Their world');
    expect(screen.getByTestId('lane-with')).toHaveTextContent('Crossed paths:1');
    expect(screen.getByTestId('lane-without')).toHaveTextContent('Their world:2');
  });

  it('loads GET timelines and never auto-rebuilds an empty canonical feed', async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      success: true,
      timelines: {
        sharedExperiences: [],
        lore: [],
        unresolved: [],
        compatibilityReview: [],
      },
    });

    render(
      <OrganizationTimelinePanel
        organization={makeOrg({ user_relationship: 'member' })}
        active
      />,
    );

    await waitFor(() => {
      expect(fetchJson).toHaveBeenCalled();
    });
    const urls = vi.mocked(fetchJson).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/api/organizations/org-1/timelines'))).toBe(true);
    expect(urls.some((url) => url.includes('rebuild-timelines'))).toBe(false);
  });
});
