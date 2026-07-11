/**
 * Kinship single-source-of-truth invariants.
 *
 * The glossary FAMILY entries are the one place kinship vocabulary is declared.
 * The extractors (kinshipGlossary, entityResolutionCore, lexicalIntelligence)
 * derive their tables from `familyRoleSpecs()`. These tests pin that contract so
 * a future kinship term is added in exactly one place — and prove the derivation
 * fixed coverage gaps the old hard-coded tables had (e.g. cousin equivalence).
 */
import { describe, expect, it } from 'vitest';

import { familyRoleSpecs } from '../../src/services/ontology/glossary';
import { parseKinshipFromName } from '../../src/services/kinship/kinshipGlossary';
import { resolveMention } from '../../src/services/entities/entityResolutionCore';

describe('kinship glossary SSOT', () => {
  it('familyRoleSpecs covers the canonical roles with surface forms', () => {
    const byRole = new Map(familyRoleSpecs().map((s) => [s.role, s]));
    for (const role of ['GRANDMOTHER', 'GRANDFATHER', 'MOTHER', 'FATHER', 'AUNT', 'UNCLE', 'COUSIN', 'SIBLING']) {
      expect(byRole.has(role), `missing role ${role}`).toBe(true);
    }
    // Title-only vs titled forms drive the two extraction strategies.
    expect(byRole.get('MOTHER')?.kinshipForm).toBe('TITLE_ONLY');
    expect(byRole.get('UNCLE')?.kinshipForm).toBe('TITLED');
    // Each role carries its surface terms (longest-first).
    expect(byRole.get('GRANDMOTHER')?.terms).toContain('abuela');
    expect(byRole.get('COUSIN')?.terms).toContain('primo');
  });

  it('kinshipGlossary still derives role extraction from the glossary', () => {
    expect(parseKinshipFromName('Tío Rafa')?.role).toBe('UNCLE');
    expect(parseKinshipFromName('Abuela')?.role).toBe('GRANDMOTHER');
    expect(parseKinshipFromName('Auntie Grace')?.role).toBe('AUNT');
  });

  it('entityResolutionCore resolves cousin kinship (coverage the old table lacked)', () => {
    const result = resolveMention('primo', [{ id: 'c1', name: 'Cousin Mateo', aliases: [] }]);
    expect(result.action).toBe('resolve');
    expect(result.resolvedId).toBe('c1');
  });

  it('entityResolutionCore keeps grandmother kinship equivalence', () => {
    const result = resolveMention('grandma', [{ id: 'g1', name: 'Abuela Rosa', aliases: [] }]);
    expect(result.resolvedId).toBe('g1');
  });
});
