import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrganizationNetworkService } from './organizationNetworkService';
// vi.mock() is hoisted above imports, so this static import receives the mock.
import { organizationService } from './organizationService';

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
          data: [
            { from_org_id: 'child', to_org_id: 'parent', relationship_type: 'part_of', notes: '[auto-inferred] test' },
          ],
          error: null,
        })),
      })),
    })),
  },
}));

describe('OrganizationNetworkService', () => {
  const svc = new OrganizationNetworkService();

  beforeEach(() => {
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
        name: "Tia Grace's Household",
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

  it('builds network with hierarchy root', async () => {
    const net = await svc.buildNetwork('u1');
    expect(net.orgCount).toBe(2);
    expect(net.rootOrg?.name).toBe('My Family');
    expect(net.edges.some(e => e.fromId === 'child' && e.toId === 'parent')).toBe(true);
  });
});
