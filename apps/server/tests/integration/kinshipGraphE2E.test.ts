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
const mockAddMember = vi.fn();

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
    addMember: (...args: unknown[]) => mockAddMember(...args),
  },
}));
vi.mock('../../src/services/entities/householdNaming', () => ({
  nameHousehold: (...args: unknown[]) => mockNameHousehold(...args),
}));

import { familyGraphInferenceService } from '../../src/services/kinship/familyGraphInferenceService';

type Row = { id: string; name: string; metadata?: Record<string, unknown> | null };

function builder(_table: string, result: { data?: unknown; error?: unknown }) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'ilike', 'limit', 'order', 'in', 'or', 'neq']) b[m] = vi.fn(() => b);
  b.update = vi.fn(() => b);
  b.maybeSingle = vi.fn(() => Promise.resolve(result));
  b.upsert = vi.fn(() => Promise.resolve({ error: null }));
  b.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
  return b;
}

describe('kinship graph E2E (text → family graph)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertKinship.mockResolvedValue(true);
    mockCreateOrganization.mockResolvedValue({ id: 'fam-1' });
    mockNameHousehold.mockReturnValue('Reyes Family');
    mockAddMember.mockResolvedValue({ id: 'member-x' });
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

    // 1) Five protagonist kinship edges plus the inferred Mom↔Dad spouse
    // connection were written.
    expect(result.edges).toBe(6);
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

    // 3) Every kin member was linked into the family group via the real
    // roster service (organization_members), not the orphaned
    // character_organizations table.
    expect(mockAddMember).toHaveBeenCalledTimes(5);
    const linkedMembers = mockAddMember.mock.calls.map(
      (c) => c[2] as { character_id: string; role: string; status: string }
    );
    expect(new Set(linkedMembers.map((l) => l.character_id))).toEqual(
      new Set(['abuela', 'mom', 'dad', 'tia', 'marco'])
    );
    expect(mockAddMember.mock.calls.every((c) => c[0] === 'user-1' && c[1] === 'fam-1')).toBe(true);
    expect(linkedMembers.every((l) => l.role === 'member' && l.status === 'active')).toBe(true);

    // 4) The protagonist is never linked to themselves as kin.
    expect([...rolesByCharacter.keys()]).not.toContain('me');
  });
});
