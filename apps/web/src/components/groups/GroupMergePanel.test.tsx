import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GroupMergePanel } from './GroupMergePanel';
import type { Organization } from '../organizations/OrganizationProfileCard';

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

    const keepButtons = screen.getAllByRole('button', { name: /keep /i });
    fireEvent.click(keepButtons[0]);

    expect(await screen.findByText(/Demo merge preview/i)).toBeInTheDocument();
    expect(onMerged).toHaveBeenCalled();
  });
});
