import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroupMergePanel } from './GroupMergePanel';
import type { Organization, OrganizationMember } from '../organizations/OrganizationProfileCard';

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

const baseOrg = (overrides: Partial<Organization>): Organization => ({
  id: 'org-1',
  name: 'Summit Staffing',
  aliases: [],
  type: 'company',
  group_type: 'company',
  membership_model: 'fuzzy',
  user_relationship: 'referenced',
  is_public_entity: false,
  description: 'Demo staffing agency',
  status: 'active',
  member_count: 2,
  usage_count: 10,
  confidence: 0.9,
  last_seen: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  metadata: {},
  members: [],
  stories: [],
  events: [],
  locations: [],
  ...overrides,
});

const member = (id: string, character_name: string, role?: string): OrganizationMember => ({
  id,
  character_name,
  role,
  status: 'active',
});

describe('GroupMergePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows duplicate banner in demo mode when names match', () => {
    const organizations = [
      baseOrg({ id: 'org-1', name: 'Summit Staffing', usage_count: 12 }),
      baseOrg({ id: 'org-2', name: 'Summit Staffing', aliases: ['Summit Staffing agency'], usage_count: 4 }),
    ];

    render(
      <GroupMergePanel
        organizations={organizations}
        demoMode
        onMerged={vi.fn()}
        selectionMode={false}
        onSelectionModeChange={vi.fn()}
        selectedForMerge={new Set()}
        onToggleSelected={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    expect(screen.getByText(/possible duplicate group cluster/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review duplicates/i })).toBeInTheDocument();
  });

  it('opens review dialog and supports demo merge preview', async () => {
    const onMerged = vi.fn();
    const organizations = [
      baseOrg({ id: 'org-1', name: 'Summit Staffing', usage_count: 12 }),
      baseOrg({ id: 'org-2', name: 'Summit Staffing', usage_count: 4 }),
    ];

    render(
      <GroupMergePanel
        organizations={organizations}
        demoMode
        onMerged={onMerged}
        selectionMode={false}
        onSelectionModeChange={vi.fn()}
        selectedForMerge={new Set()}
        onToggleSelected={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /review duplicates/i }));
    expect(screen.getByText(/Review duplicate groups/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /keep summit staffing/i })[0]);

    expect(await screen.findByText(/Demo merge preview/i)).toBeInTheDocument();
    expect(onMerged).toHaveBeenCalled();
  });

  it('shows rosters, shared people, and other merge candidates', () => {
    const organizations = [
      baseOrg({
        id: 'org-house',
        name: 'Northwind Household',
        group_type: 'family',
        usage_count: 8,
        member_count: 4,
        members: [
          member('m-marcus', 'Marcus'),
          member('m-jamie', 'Jamie'),
          member('m-alex', 'Alex'),
          member('m-taylor', 'Taylor'),
        ],
      }),
      baseOrg({
        id: 'org-family',
        name: 'Northwind Family',
        group_type: 'family',
        usage_count: 5,
        member_count: 3,
        members: [member('m-marcus-2', 'Marcus'), member('m-jamie-2', 'Jamie'), member('m-alex-2', 'Alex')],
      }),
      baseOrg({
        id: 'org-work',
        name: 'Vanguard Robotics',
        group_type: 'company',
        usage_count: 20,
        member_count: 2,
        members: [member('m-marcus-3', 'Marcus'), member('m-gary', 'Gary')],
      }),
    ];

    render(
      <GroupMergePanel
        organizations={organizations}
        demoMode
        onMerged={vi.fn()}
        selectionMode={false}
        onSelectionModeChange={vi.fn()}
        selectedForMerge={new Set()}
        onToggleSelected={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /review duplicates/i }));

    expect(screen.getByText(/Shared members/i)).toBeInTheDocument();
    expect(screen.getByText(/Shared people: Marcus, Jamie, Alex/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep northwind household/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep northwind family/i })).toBeInTheDocument();
    expect(screen.getByText(/Other groups that share people/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to this review/i })).toBeInTheDocument();
    expect(screen.getByText(/Shares Marcus/i)).toBeInTheDocument();
  });

  it('lets you correct a roster and add another merge candidate to the review', () => {
    const organizations = [
      baseOrg({
        id: 'org-house',
        name: 'Northwind Household',
        group_type: 'family',
        usage_count: 8,
        member_count: 3,
        members: [member('m-marcus', 'Marcus'), member('m-jamie', 'Jamie'), member('m-alex', 'Alex')],
      }),
      baseOrg({
        id: 'org-family',
        name: 'Northwind Family',
        group_type: 'family',
        usage_count: 5,
        member_count: 3,
        members: [member('m-marcus-2', 'Marcus'), member('m-jamie-2', 'Jamie'), member('m-alex-2', 'Alex')],
      }),
      baseOrg({
        id: 'org-work',
        name: 'Vanguard Robotics',
        group_type: 'company',
        usage_count: 20,
        member_count: 2,
        members: [member('m-marcus-3', 'Marcus'), member('m-gary', 'Gary')],
      }),
    ];

    render(
      <GroupMergePanel
        organizations={organizations}
        demoMode
        onMerged={vi.fn()}
        selectionMode={false}
        onSelectionModeChange={vi.fn()}
        selectedForMerge={new Set()}
        onToggleSelected={vi.fn()}
        onClearSelection={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /review duplicates/i }));

    fireEvent.click(screen.getByRole('button', { name: /remove alex from northwind household/i }));
    expect(screen.queryByRole('button', { name: /remove alex from northwind household/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove alex from northwind family/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/add a person to northwind household/i), {
      target: { value: 'Jeff' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add person to northwind household/i }));
    expect(screen.getByRole('button', { name: /remove jeff from northwind household/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add to this review/i }));
    expect(screen.getByRole('button', { name: /keep vanguard robotics/i })).toBeInTheDocument();
  });
});
