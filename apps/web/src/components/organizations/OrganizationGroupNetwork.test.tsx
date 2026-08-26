import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { fetchJson } from '../../lib/api';
import { OrganizationGroupNetwork } from './OrganizationGroupNetwork';
import { groupChildrenBySite, locationMatchKey } from './orgNetworkSites';

vi.mock('../../lib/api', () => ({ fetchJson: vi.fn() }));
vi.mock('../../lib/storyRefresh', () => ({ onStoryDataUpdated: vi.fn(() => () => {}) }));

describe('orgNetworkSites', () => {
  it('groups nested teams under matching company locations', () => {
    const { buckets, unassigned } = groupChildrenBySite(
      [
        { locationId: 'dummy-loc-nw-depot', name: 'Northwind Depot' },
        { locationId: 'dummy-loc-hw-lab', name: 'Hollywood lab' },
      ],
      ['field', 'night', 'qa', 'hq'],
      (id) => {
        if (id === 'field') return [{ locationId: 'dummy-loc-nw-depot', name: 'Northwind Depot' }];
        if (id === 'night') return [{ locationId: 'dummy-loc-nw-depot', name: 'Northwind Depot' }];
        if (id === 'qa') return [{ locationId: 'dummy-loc-hw-lab', name: 'Hollywood lab' }];
        return [];
      },
    );
    expect(unassigned).toEqual(['hq']);
    expect(buckets.find((bucket) => bucket.locationId === 'dummy-loc-nw-depot')?.childIds).toEqual(['field', 'night']);
    expect(buckets.find((bucket) => bucket.locationId === 'dummy-loc-hw-lab')?.childIds).toEqual(['qa']);
    expect(locationMatchKey({ location_id: 'dummy-loc-nw-depot', location_name: 'Northwind Depot' })).toBe(
      'id:dummy-loc-nw-depot',
    );
  });
});

describe('OrganizationGroupNetwork', () => {
  it('lists parent, subgroup, and connected groups in the modal network', async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      success: true,
      network: {
        rootOrg: {
          id: 'company', name: 'Vanguard Robotics', group_type: 'company', member_count: 8, member_names: [],
          relationships: [
            { toId: 'team', relationshipType: 'part_of', direction: 'incoming', inferred: false },
            { toId: 'partner', relationshipType: 'affiliated_with', direction: 'outgoing', inferred: false },
          ],
        },
        nodes: [
          {
            id: 'company', name: 'Vanguard Robotics', group_type: 'company', member_count: 8, member_names: [],
            relationships: [
              { toId: 'team', relationshipType: 'part_of', direction: 'incoming', inferred: false },
              { toId: 'partner', relationshipType: 'affiliated_with', direction: 'outgoing', inferred: false },
            ],
          },
          {
            id: 'team', name: 'Robotics Team', group_type: 'team', member_count: 3, member_names: [],
            relationships: [{ toId: 'company', relationshipType: 'part_of', direction: 'outgoing', inferred: false }],
          },
          {
            id: 'partner', name: 'MemoVault', group_type: 'software', member_count: 2, member_names: [],
            relationships: [{ toId: 'company', relationshipType: 'affiliated_with', direction: 'incoming', inferred: false }],
          },
        ],
        edges: [
          { fromId: 'team', toId: 'company', relationshipType: 'part_of', inferred: false },
          { fromId: 'company', toId: 'partner', relationshipType: 'affiliated_with', inferred: false },
        ],
        orgCount: 3,
        edgeCount: 2,
      },
    } as never);

    render(<OrganizationGroupNetwork rootOrgId="company" compact />);
    const companyCard = (await screen.findByRole('button', { name: 'Vanguard Robotics' })).parentElement;
    expect(companyCard).toHaveTextContent('Robotics Team');
    expect(companyCard).toHaveTextContent(/MemoVault \(affiliated\)/);
    expect(screen.getByRole('button', { name: 'Robotics Team' }).parentElement).toHaveTextContent('Vanguard Robotics');
  });

  it('nests groups under company locations in the list view', async () => {
    vi.mocked(fetchJson).mockResolvedValue({
      success: true,
      network: {
        rootOrg: {
          id: 'company', name: 'Northwind Logistics', group_type: 'company', member_count: 4, member_names: [],
          locations: [
            { locationId: 'dummy-loc-nw-depot', name: 'Northwind Depot' },
            { locationId: 'dummy-loc-hw-lab', name: 'Hollywood lab' },
          ],
          relationships: [
            { toId: 'field', relationshipType: 'part_of', direction: 'incoming', inferred: false },
            { toId: 'night', relationshipType: 'part_of', direction: 'incoming', inferred: false },
            { toId: 'qa', relationshipType: 'part_of', direction: 'incoming', inferred: false },
          ],
        },
        nodes: [
          {
            id: 'company', name: 'Northwind Logistics', group_type: 'company', member_count: 4, member_names: [],
            locations: [
              { locationId: 'dummy-loc-nw-depot', name: 'Northwind Depot' },
              { locationId: 'dummy-loc-hw-lab', name: 'Hollywood lab' },
            ],
            relationships: [
              { toId: 'field', relationshipType: 'part_of', direction: 'incoming', inferred: false },
              { toId: 'night', relationshipType: 'part_of', direction: 'incoming', inferred: false },
              { toId: 'qa', relationshipType: 'part_of', direction: 'incoming', inferred: false },
            ],
          },
          {
            id: 'field', name: 'Field Crew', group_type: 'team', member_count: 2, member_names: [],
            locations: [{ locationId: 'dummy-loc-nw-depot', name: 'Northwind Depot' }],
            relationships: [{ toId: 'company', relationshipType: 'part_of', direction: 'outgoing', inferred: false }],
          },
          {
            id: 'night', name: 'Night Shift', group_type: 'team', member_count: 1, member_names: [],
            locations: [{ locationId: 'dummy-loc-nw-depot', name: 'Northwind Depot' }],
            relationships: [{ toId: 'company', relationshipType: 'part_of', direction: 'outgoing', inferred: false }],
          },
          {
            id: 'qa', name: 'QA Lab', group_type: 'team', member_count: 1, member_names: [],
            locations: [{ locationId: 'dummy-loc-hw-lab', name: 'Hollywood lab' }],
            relationships: [{ toId: 'company', relationshipType: 'part_of', direction: 'outgoing', inferred: false }],
          },
        ],
        edges: [
          { fromId: 'field', toId: 'company', relationshipType: 'part_of', inferred: false },
          { fromId: 'night', toId: 'company', relationshipType: 'part_of', inferred: false },
          { fromId: 'qa', toId: 'company', relationshipType: 'part_of', inferred: false },
        ],
        orgCount: 4,
        edgeCount: 3,
      },
    } as never);

    render(<OrganizationGroupNetwork rootOrgId="company" compact />);
    const companyCard = (await screen.findByRole('button', { name: 'Northwind Logistics' })).parentElement;
    expect(companyCard).toHaveTextContent('Locations:');
    expect(companyCard).toHaveTextContent(/Northwind Depot/);
    expect(companyCard).toHaveTextContent(/Field Crew/);
    expect(companyCard).toHaveTextContent(/Night Shift/);
    expect(companyCard).toHaveTextContent(/Hollywood lab/);
    expect(companyCard).toHaveTextContent(/QA Lab/);
    expect(screen.getByRole('button', { name: 'Field Crew' }).parentElement).toHaveTextContent(/Based at/);
    expect(screen.getByRole('button', { name: 'Field Crew' }).parentElement).not.toHaveTextContent(/no groups yet/);
  });
});
