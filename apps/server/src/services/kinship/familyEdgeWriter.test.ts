import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  inverseFamilyEdgeType,
  kinshipStringToEdgeType,
  kinshipStringToTreeRelation,
  normalizeFamilyEdgeType,
  normalizeTreeRelation,
} from './familyEdgeWriter';
import {
  extractRelationalKinshipClaims,
  parseFocusedKinshipAssertion,
} from './kinshipGlossary';

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('familyEdgeWriter — type normalization', () => {
  it('maps surface kin labels to typed edges', () => {
    expect(normalizeFamilyEdgeType('mother')).toBe('parent_of');
    expect(normalizeFamilyEdgeType('tía')).toBe('aunt_of');
    expect(normalizeFamilyEdgeType('abuela')).toBe('grandparent_of');
    expect(normalizeFamilyEdgeType('stepdad')).toBe('step_parent_of');
    expect(kinshipStringToEdgeType('cousin')).toBe('cousin_of');
  });

  it('inverts directed family edges bidirectionally', () => {
    expect(inverseFamilyEdgeType('parent_of')).toBe('child_of');
    expect(inverseFamilyEdgeType('child_of')).toBe('parent_of');
    expect(inverseFamilyEdgeType('aunt_of')).toBe('niece_of');
    expect(inverseFamilyEdgeType('sibling_of')).toBe('sibling_of');
    expect(inverseFamilyEdgeType('spouse_of')).toBe('spouse_of');
  });

  it('maps kinship strings onto tree editor relations', () => {
    expect(kinshipStringToTreeRelation('mother')).toBe('parent');
    expect(kinshipStringToTreeRelation('tía')).toBe('aunt');
    expect(kinshipStringToTreeRelation('abuela')).toBe('grandparent');
    expect(kinshipStringToTreeRelation('stepdad')).toBe('step_parent');
    expect(normalizeTreeRelation('cousin')).toBe('cousin');
    expect(normalizeTreeRelation('not_a_relation')).toBeNull();
  });
});

describe('kinshipGlossary — relational chat claims', () => {
  it('extracts "Name is my kin" claims', () => {
    const claims = extractRelationalKinshipClaims('Grace is my aunt and James is my cousin.');
    expect(claims.some((c) => c.sourcePhrase === 'Grace' && c.role === 'AUNT')).toBe(true);
    expect(claims.some((c) => c.sourcePhrase === 'James' && c.role === 'COUSIN')).toBe(true);
  });

  it('extracts "my kin Name" claims', () => {
    const claims = extractRelationalKinshipClaims('I saw my uncle Ben at dinner.');
    expect(claims.some((c) => c.sourcePhrase === 'Ben' && c.role === 'UNCLE')).toBe(true);
  });

  it('parses focused-character kinship corrections', () => {
    expect(parseFocusedKinshipAssertion("actually she's my aunt")).toMatchObject({
      kinship: 'aunt',
      role: 'AUNT',
    });
    expect(parseFocusedKinshipAssertion("she's my aunt, not my cousin")).toMatchObject({
      kinship: 'aunt',
      role: 'AUNT',
      replaces: 'cousin',
    });
    expect(parseFocusedKinshipAssertion('he is my stepdad')).toMatchObject({
      kinship: 'stepfather',
      role: 'STEPFATHER',
    });
    expect(parseFocusedKinshipAssertion('just hanging out')).toBeNull();
  });
});

describe('applyKinshipLabelToCharacter', () => {
  let updateSpy: (patch: Record<string, unknown>) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    updateSpy = vi.fn();
  });

  async function mockCharacterRow(row: { metadata: Record<string, unknown> | null; archetype?: string | null }) {
    const { supabaseAdmin } = await import('../supabaseClient');
    (supabaseAdmin as any).from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: row, error: null }),
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        updateSpy(patch);
        return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
      },
    }));
  }

  it('sets kinship_label and kinship_role from a chat-detected kinship term', async () => {
    await mockCharacterRow({ metadata: {}, archetype: null });
    const { applyKinshipLabelToCharacter } = await import('./familyEdgeWriter');

    await applyKinshipLabelToCharacter('user-1', 'char-1', 'uncle');

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          kinship_role: 'uncle',
          kinship_label: 'Uncle',
          relationship_type: 'family',
          kinship_source: 'chat_inferred',
        }),
        archetype: 'family',
      }),
    );
  });

  it('does not overwrite a user-confirmed kinship label', async () => {
    await mockCharacterRow({
      metadata: { kinship_label: 'Stepdad', kinship_source: 'user_confirmed' },
      archetype: 'family',
    });
    const { applyKinshipLabelToCharacter } = await import('./familyEdgeWriter');

    await applyKinshipLabelToCharacter('user-1', 'char-1', 'father');

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('is a no-op for a synthetic/placeholder character id', async () => {
    await mockCharacterRow({ metadata: {}, archetype: null });
    const { applyKinshipLabelToCharacter } = await import('./familyEdgeWriter');

    await applyKinshipLabelToCharacter('user-1', '__placeholder', 'aunt');

    expect(updateSpy).not.toHaveBeenCalled();
  });
});
