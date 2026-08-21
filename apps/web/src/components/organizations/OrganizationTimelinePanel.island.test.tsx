import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { OrganizationTimelinePanel } from './OrganizationTimelinePanel';
import type { Organization } from './OrganizationProfileCard';

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

vi.mock('../timeline/EventTimelineSwimlanes', () => ({
  EventTimelineSwimlanes: () => <div data-testid="swimlanes" />,
}));

import { fetchJson } from '../../lib/api';

const fetchJsonMock = vi.mocked(fetchJson);

const org: Organization = {
  id: 'org-vanguard',
  name: 'Vanguard Robotics',
  aliases: [],
  type: 'company',
  group_type: 'company',
  membership_model: 'strict',
  user_relationship: 'member',
  is_public_entity: false,
  member_count: 0,
  usage_count: 0,
  confidence: 0.9,
  last_seen: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('Organization timeline island (audit)', () => {
  it('keeps GET /api/organizations/:id/timelines because stitched items have no organizationIds seam', async () => {
    fetchJsonMock.mockResolvedValue({
      success: true,
      timelines: { sharedExperiences: [], lore: [] },
    });

    render(<OrganizationTimelinePanel organization={org} />);

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith('/api/organizations/org-vanguard/timelines');
    });
    expect(
      fetchJsonMock.mock.calls.some(([url]) => String(url).includes('/api/chronology/stitched')),
    ).toBe(false);
  });
});
