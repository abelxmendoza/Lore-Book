import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrganizationNetworkService } from './organizationNetworkService';
// vi.mock() is hoisted above imports, so this static import receives the mock.
import { organizationService } from './organizationService';

let relationshipRows: Array<Record<string, unknown>> = [];

vi.mock('./organizationService', () => ({
  organizationService: {
    listOrganizations: vi.fn(),
  },
}));

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({
          data: relationshipRows,
          error: null,
        })),
      })),
    })),
  },
}));

describe('OrganizationNetworkService', () => {
  const svc = new OrganizationNetworkService();

  beforeEach(() => {
    relationshipRows = [
      { from_org_id: 'child', to_org_id: 'parent', relationship_type: 'part_of', notes: '[auto-inferred] test' },
    ];
    vi.mocked(organizationService.listOrganizations).mockResolvedValue([
      {
        id: 'parent',
        user_id: 'u1',
        name: 'My Family',
        aliases: [],
        type: 'family',
        group_type: 'family',
        membership_model: 'strict',
        status: 'active',
        created_at: '',
        updated_at: '',
        members: [{ id: 'm1', organization_id: 'parent', character_name: 'Sam', status: 'active' }],
      },
      {
        id: 'child',
        user_id: 'u1',
        name: "Aunt Grace's Household",
        aliases: [],
        type: 'family',
        group_type: 'family',
        membership_model: 'strict',
        status: 'active',
        created_at: '',
        updated_at: '',
        members: [{ id: 'm2', organization_id: 'child', character_name: 'Tia', status: 'active' }],
      },
    ] as any);
  });

  it('projects parent_group_id when an older hierarchy has no edge row', async () => {
    relationshipRows = [];
    vi.mocked(organizationService.listOrganizations).mockResolvedValueOnce([
      {
        id: 'parent', user_id: 'u1', name: 'Vanguard Robotics', aliases: [], type: 'company',
        group_type: 'company', membership_model: 'strict', status: 'active', created_at: '', updated_at: '', members: [],
      },
      {
        id: 'child', user_id: 'u1', name: 'Robotics Team', aliases: [], type: 'other',
        group_type: 'team', membership_model: 'strict', status: 'active', created_at: '', updated_at: '', members: [],
        parent_group_id: 'parent',
      },
    ] as any);

    const net = await svc.buildNetwork('u1', 'parent');
    expect(net.edges).toContainEqual(expect.objectContaining({
      fromId: 'child',
      toId: 'parent',
      relationshipType: 'part_of',
    }));
  });

  it('includes company sites on network nodes so the UI can nest groups by location', async () => {
    relationshipRows = [];
    vi.mocked(organizationService.listOrganizations).mockResolvedValueOnce([
      {
        id: 'parent', user_id: 'u1', name: 'Northwind Logistics', aliases: [], type: 'company',
        group_type: 'company', membership_model: 'strict', status: 'active', created_at: '', updated_at: '', members: [],
        locations: [{ id: 'l1', organization_id: 'parent', location_id: 'loc-depot', location_name: 'Northwind Depot', visit_count: 2 }],
      },
      {
        id: 'child', user_id: 'u1', name: 'Field Crew', aliases: [], type: 'other',
        group_type: 'team', membership_model: 'strict', status: 'active', created_at: '', updated_at: '', members: [],
        parent_group_id: 'parent',
        locations: [{ id: 'l2', organization_id: 'child', location_id: 'loc-depot', location_name: 'Northwind Depot', visit_count: 2 }],
      },
    ] as any);

    const net = await svc.buildNetwork('u1', 'parent');
    expect(net.rootOrg?.locations).toEqual([
      { locationId: 'loc-depot', name: 'Northwind Depot' },
    ]);
    expect(net.nodes.find(n => n.id === 'child')?.locations).toEqual([
      { locationId: 'loc-depot', name: 'Northwind Depot' },
    ]);
  });

  it('builds network with hierarchy root', async () => {
    const net = await svc.buildNetwork('u1');
    expect(net.orgCount).toBe(2);
    expect(net.rootOrg?.name).toBe('My Family');
    expect(net.edges.some(e => e.fromId === 'child' && e.toId === 'parent')).toBe(true);
  });
});
