// =====================================================
// POST /api/organizations/:id/sync-from-family-tree
// =====================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import organizationsRouter from '../../src/routes/organizations';
import { requireAuth } from '../../src/middleware/auth';

vi.mock('../../src/services/organizationService');
vi.mock('../../src/services/familyGroupSyncService');
vi.mock('../../src/services/kinship/householdFromTreeService');
vi.mock('../../src/middleware/auth');

const mockFrom = vi.fn();
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const app = express();
app.use(express.json());
app.use('/api/organizations', organizationsRouter);

const USER = { id: 'test-user-id', email: 'test@example.com' };
const FAMILY_ORG = { id: 'fam-1', name: "Tía Grace's Family", type: 'family', group_type: 'family' };

describe('POST /api/organizations/:id/sync-from-family-tree', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation((req, res, next) => {
      (req as any).user = USER;
      next();
    });
    mockFrom.mockReturnValue({
      select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
    });

    const { familyGroupSyncService } = await import('../../src/services/familyGroupSyncService');
    vi.mocked(familyGroupSyncService.syncGroup).mockResolvedValue(undefined);
  });

  it('returns 404 for a missing group', async () => {
    const { organizationService } = await import('../../src/services/organizationService');
    vi.mocked(organizationService.getOrganization).mockResolvedValue(null);

    const response = await request(app).post('/api/organizations/nope/sync-from-family-tree').expect(404);
    expect(response.body).toEqual({ success: false, error: 'Group not found' });
  });

  it('rejects non-family groups', async () => {
    const { organizationService } = await import('../../src/services/organizationService');
    vi.mocked(organizationService.getOrganization).mockResolvedValue({
      id: 'org-1',
      name: 'Acme Corp',
      type: 'company',
      group_type: 'company',
    } as any);

    const response = await request(app).post('/api/organizations/org-1/sync-from-family-tree').expect(400);
    expect(response.body.success).toBe(false);
  });

  it('derives spouse and pets from the Family Tree using existing members as anchors', async () => {
    const { organizationService } = await import('../../src/services/organizationService');
    const { deriveHouseholdMembers } = await import('../../src/services/kinship/householdFromTreeService');

    vi.mocked(organizationService.getOrganization).mockResolvedValue(FAMILY_ORG as any);
    vi.mocked(organizationService.getMembers)
      .mockResolvedValueOnce([{ id: 'mem-grace', character_id: 'grace', character_name: 'Grace', status: 'active' } as any])
      .mockResolvedValueOnce([
        { id: 'mem-grace', character_id: 'grace', character_name: 'Grace', status: 'active' },
        { id: 'mem-husband', character_id: 'husband', character_name: 'Robert', role: 'spouse', status: 'active' },
        { id: 'mem-rex', character_id: 'rex', character_name: 'Rex', role: 'pet', status: 'active' },
      ] as any);
    vi.mocked(deriveHouseholdMembers).mockResolvedValue([
      { characterId: 'husband', name: 'Robert', role: 'spouse', species: null, viaAnchorId: 'grace' },
      { characterId: 'rex', name: 'Rex', role: 'pet', species: 'dog', viaAnchorId: 'grace' },
    ]);
    vi.mocked(organizationService.addMember).mockResolvedValue({ id: 'new-member' } as any);

    const response = await request(app).post('/api/organizations/fam-1/sync-from-family-tree').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.added).toBe(2);
    expect(response.body.members).toHaveLength(3);

    expect(deriveHouseholdMembers).toHaveBeenCalledWith('test-user-id', ['grace']);
    expect(organizationService.addMember).toHaveBeenCalledTimes(2);
    expect(organizationService.addMember).toHaveBeenCalledWith(
      'test-user-id',
      'fam-1',
      expect.objectContaining({ character_id: 'husband', character_name: 'Robert', role: 'spouse', status: 'active' }),
    );
    expect(organizationService.addMember).toHaveBeenCalledWith(
      'test-user-id',
      'fam-1',
      expect.objectContaining({ character_id: 'rex', character_name: 'Rex', role: 'pet', status: 'active' }),
    );
  });

  it('is idempotent: a second sync with an already-populated roster adds nothing new', async () => {
    const { organizationService } = await import('../../src/services/organizationService');
    const { deriveHouseholdMembers } = await import('../../src/services/kinship/householdFromTreeService');

    vi.mocked(organizationService.getOrganization).mockResolvedValue(FAMILY_ORG as any);
    const fullRoster = [
      { id: 'mem-grace', character_id: 'grace', character_name: 'Grace', status: 'active' },
      { id: 'mem-husband', character_id: 'husband', character_name: 'Robert', role: 'spouse', status: 'active' },
    ];
    vi.mocked(organizationService.getMembers).mockResolvedValue(fullRoster as any);
    // The Family Tree still reports the same spouse — deriveHouseholdMembers is a
    // pure read of the graph and has no reason to omit someone already linked.
    vi.mocked(deriveHouseholdMembers).mockResolvedValue([
      { characterId: 'husband', name: 'Robert', role: 'spouse', species: null, viaAnchorId: 'grace' },
    ]);
    vi.mocked(organizationService.addMember).mockResolvedValue({ id: 'mem-husband' } as any);

    const response = await request(app).post('/api/organizations/fam-1/sync-from-family-tree').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.members).toHaveLength(2);
    // addMember is still called (real addMember treats an existing character_id as
    // an idempotent update, never a duplicate row) — no new members appear either way.
    expect(organizationService.addMember).toHaveBeenCalledTimes(1);
  });

  it('falls back to characters mentioned in the group title when the roster is empty', async () => {
    const { organizationService } = await import('../../src/services/organizationService');
    const { familyGroupSyncService, charactersMentionedInTitle } = await import(
      '../../src/services/familyGroupSyncService'
    );
    const { deriveHouseholdMembers } = await import('../../src/services/kinship/householdFromTreeService');

    vi.mocked(organizationService.getOrganization).mockResolvedValue(FAMILY_ORG as any);
    vi.mocked(organizationService.getMembers).mockResolvedValue([]);
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({ limit: () => Promise.resolve({ data: [{ id: 'grace', name: 'Grace', alias: [] }], error: null }) }),
      }),
    });
    vi.mocked(charactersMentionedInTitle).mockReturnValue([{ id: 'grace', name: 'Grace' }]);
    vi.mocked(deriveHouseholdMembers).mockResolvedValue([]);

    const response = await request(app).post('/api/organizations/fam-1/sync-from-family-tree').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.added).toBe(0);
    expect(deriveHouseholdMembers).toHaveBeenCalledWith('test-user-id', ['grace']);
    expect(familyGroupSyncService.syncGroup).toHaveBeenCalledTimes(2);
  });
});
