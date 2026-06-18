/**
 * INTEGRATION — glossary-derived kinship → family graph persistence.
 *
 * Exercises familyGraphInferenceService end-to-end across modules (kinship
 * extraction → character resolution → relationship + family-group writes) with
 * Supabase and the relationship/organization services mocked. Verifies the
 * glossary vocabulary actually drives protagonist kinship edges and family
 * group creation, plus the error/no-op paths.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();
const mockAssertKinship = vi.fn();
const mockCreateOrganization = vi.fn();
const mockNameHousehold = vi.fn();

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

function builder(result: { data?: unknown; error?: unknown }) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'ilike', 'limit', 'order', 'in']) b[m] = vi.fn(() => b);
  b.upsert = vi.fn(() => Promise.resolve({ error: null }));
  b.update = vi.fn(() => b);
  b.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
  return b;
}

const USER = 'user-1';
const MSG = 'msg-1';

function wireCharacters(chars: Row[], existingOrgs: Row[] = []) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'characters') return builder({ data: chars, error: null });
    if (table === 'organizations') return builder({ data: existingOrgs, error: null });
    if (table === 'character_organizations') return builder({ data: null, error: null });
    return builder({ data: [], error: null });
  });
}

describe('familyGraphInferenceService (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertKinship.mockResolvedValue(true);
    mockCreateOrganization.mockResolvedValue({ id: 'fam-1' });
    mockNameHousehold.mockReturnValue('Test Family');
  });

  it('drives protagonist kinship edges + family group from a multi-kin sentence', async () => {
    wireCharacters([
      { id: 'me', name: 'Me', metadata: { is_self: true } },
      { id: 'abuela', name: 'Abuela', metadata: {} },
      { id: 'juan', name: 'Tío Juan', metadata: {} },
      { id: 'ray', name: 'Tío Ray', metadata: {} },
    ]);

    const result = await familyGraphInferenceService.processMessage(
      USER,
      'I visited Abuela with Tío Juan and Tío Ray',
      MSG,
      []
    );

    expect(result.edges).toBe(3);
    expect(result.familyGroupId).toBe('fam-1');

    // Kinship roles came from the glossary-derived extractor.
    const kinshipArgs = mockAssertKinship.mock.calls.map((c) => c[2]);
    expect(kinshipArgs).toContain('grandmother');
    expect(kinshipArgs.filter((k) => k === 'uncle').length).toBe(2);

    // Family group created once, typed 'family'.
    expect(mockCreateOrganization).toHaveBeenCalledTimes(1);
    expect(mockCreateOrganization.mock.calls[0][1]).toMatchObject({ type: 'family' });
  });

  it('infers kinship from a promoted character name (no inline mention)', async () => {
    wireCharacters([
      { id: 'me', name: 'Me', metadata: { is_self: true } },
      { id: 'tia', name: 'Tía Grace', metadata: {} },
      { id: 'prim', name: 'Cousin Marco', metadata: {} },
    ]);

    const result = await familyGraphInferenceService.processMessage(
      USER,
      'Saw the family today',
      MSG,
      ['tia', 'prim']
    );

    const kinshipArgs = mockAssertKinship.mock.calls.map((c) => c[2]);
    expect(kinshipArgs).toContain('aunt');
    expect(kinshipArgs).toContain('cousin');
    expect(result.edges).toBe(2);
  });

  it('reuses an existing family group instead of creating a duplicate', async () => {
    wireCharacters(
      [
        { id: 'me', name: 'Me', metadata: { is_self: true } },
        { id: 'abuela', name: 'Abuela', metadata: {} },
        { id: 'juan', name: 'Tío Juan', metadata: {} },
      ],
      [{ id: 'existing-fam', name: 'Test Family', metadata: {} }]
    );

    const result = await familyGraphInferenceService.processMessage(
      USER,
      'Dinner with Abuela and Tío Juan',
      MSG,
      []
    );

    expect(result.familyGroupId).toBe('existing-fam');
    expect(mockCreateOrganization).not.toHaveBeenCalled();
  });

  // ── ERROR / no-op paths ────────────────────────────────────────────────────
  it('returns zero edges when the user has no characters', async () => {
    wireCharacters([]);
    const result = await familyGraphInferenceService.processMessage(USER, 'Visited Abuela', MSG, []);
    expect(result).toEqual({ edges: 0 });
    expect(mockAssertKinship).not.toHaveBeenCalled();
  });

  it('creates no kinship edges for a non-family sentence', async () => {
    wireCharacters([{ id: 'me', name: 'Me', metadata: { is_self: true } }]);
    const result = await familyGraphInferenceService.processMessage(
      USER,
      'We shipped the product at the warehouse',
      MSG,
      []
    );
    expect(result.edges).toBe(0);
    expect(result.familyGroupId).toBeUndefined();
    expect(mockCreateOrganization).not.toHaveBeenCalled();
  });

  it('does not assert kinship when only the protagonist matches', async () => {
    wireCharacters([{ id: 'me', name: 'Me', metadata: { is_self: true } }]);
    const result = await familyGraphInferenceService.processMessage(
      USER,
      'I am writing in my journal',
      MSG,
      ['me']
    );
    expect(result.edges).toBe(0);
    expect(mockAssertKinship).not.toHaveBeenCalled();
  });
});
