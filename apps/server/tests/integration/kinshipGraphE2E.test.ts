/**
 * E2E — raw narrative text → glossary-derived kinship → fully persisted family graph.
 *
 * This is the end-to-end happy path the consolidation must protect: a single
 * realistic sentence flows through the real kinship extractor + family graph
 * inference service, and we assert the COMPLETE persisted graph — every kinship
 * edge (with glossary roles) AND every family-group membership write. Supabase
 * and the relationship/organization services are mocked to capture writes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const mockAssertKinship = vi.fn();
const mockCreateOrganization = vi.fn();
const mockNameHousehold = vi.fn();
const mockCharOrgUpsert = vi.fn();

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));
vi.mock('../../src/services/relationshipFoundationService', () => ({
  relationshipFoundationService: {
    assertProtagonistKinship: (...args: unknown[]) => mockAssertKinship(...args),
  },
}));
vi.mock('../../src/services/organizationService', () => ({
  organizationService: {
    createOrganization: (...args: unknown[]) => mockCreateOrganization(...args),
  },
}));
vi.mock('../../src/services/entities/householdNaming', () => ({
  nameHousehold: (...args: unknown[]) => mockNameHousehold(...args),
}));

import { familyGraphInferenceService } from '../../src/services/kinship/familyGraphInferenceService';

type Row = { id: string; name: string; metadata?: Record<string, unknown> | null };

function builder(table: string, result: { data?: unknown; error?: unknown }) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'ilike', 'limit', 'order', 'in']) b[m] = vi.fn(() => b);
  b.update = vi.fn(() => b);
  b.upsert =
    table === 'character_organizations'
      ? mockCharOrgUpsert
      : vi.fn(() => Promise.resolve({ error: null }));
  b.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
  return b;
}

describe('kinship graph E2E (text → family graph)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertKinship.mockResolvedValue(true);
    mockCreateOrganization.mockResolvedValue({ id: 'fam-1' });
    mockNameHousehold.mockReturnValue('Reyes Family');
    mockCharOrgUpsert.mockReturnValue(Promise.resolve({ error: null }));
  });

  it('compiles a full family graph from one Thanksgiving sentence', async () => {
    const characters: Row[] = [
      { id: 'me', name: 'Me', metadata: { is_self: true } },
      { id: 'abuela', name: 'Abuela', metadata: {} },
      { id: 'mom', name: 'Mom', metadata: {} },
      { id: 'dad', name: 'Dad', metadata: {} },
      { id: 'tia', name: 'Tía Grace', metadata: {} },
      { id: 'marco', name: 'Cousin Marco', metadata: {} },
    ];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') return builder(table, { data: characters, error: null });
      if (table === 'organizations') return builder(table, { data: [], error: null });
      return builder(table, { data: null, error: null });
    });

    const text = 'At Thanksgiving I sat with Abuela, Mom, Dad, Tía Grace, and cousin Marco';
    const result = await familyGraphInferenceService.processMessage('user-1', text, 'msg-e2e', []);

    // 1) Every kinship edge was asserted with the correct glossary role.
    expect(result.edges).toBe(5);
    const rolesByCharacter = new Map(
      mockAssertKinship.mock.calls.map((c) => [c[1] as string, c[2] as string])
    );
    expect(rolesByCharacter.get('abuela')).toBe('grandmother');
    expect(rolesByCharacter.get('mom')).toBe('mother');
    expect(rolesByCharacter.get('dad')).toBe('father');
    expect(rolesByCharacter.get('tia')).toBe('aunt');
    expect(rolesByCharacter.get('marco')).toBe('cousin');

    // 2) A single family group was created with all five kin as members.
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1);
    const orgPayload = mockCreateOrganization.mock.calls[0][1] as {
      type: string;
      metadata: { member_character_ids: string[] };
    };
    expect(orgPayload.type).toBe('family');
    expect(new Set(orgPayload.metadata.member_character_ids)).toEqual(
      new Set(['abuela', 'mom', 'dad', 'tia', 'marco'])
    );
    expect(result.familyGroupId).toBe('fam-1');

    // 3) Every kin member was linked into the family group.
    expect(mockCharOrgUpsert).toHaveBeenCalledTimes(5);
    const linkedIds = mockCharOrgUpsert.mock.calls.map(
      (c) => (c[0] as { character_id: string; organization_id: string; role: string })
    );
    expect(new Set(linkedIds.map((l) => l.character_id))).toEqual(
      new Set(['abuela', 'mom', 'dad', 'tia', 'marco'])
    );
    expect(linkedIds.every((l) => l.organization_id === 'fam-1')).toBe(true);
    expect(linkedIds.every((l) => l.role === 'member')).toBe(true);

    // 4) The protagonist is never linked to themselves as kin.
    expect([...rolesByCharacter.keys()]).not.toContain('me');
  });
});
