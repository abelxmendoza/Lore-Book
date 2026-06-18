import { describe, expect, it } from 'vitest';

import {
  ALL_PERSONA_IDS,
  listPersonaCatalog,
  resolvePersonaId,
  getPersonaDefinition,
} from '../../src/services/personas/personaRegistry';

describe('personaRegistry', () => {
  it('exposes six canonical chat personas', () => {
    expect(ALL_PERSONA_IDS).toHaveLength(6);
  });

  it('maps user-facing aliases to internal ids', () => {
    expect(resolvePersonaId('processing_partner')).toBe('therapist');
    expect(resolvePersonaId('life_historian')).toBe('archivist');
    expect(resolvePersonaId('relationship_advisor')).toBe('gossip_buddy');
    expect(resolvePersonaId('biographer')).toBe('biography_writer');
  });

  it('returns null for unknown slugs', () => {
    expect(resolvePersonaId('random_bot')).toBeNull();
  });

  it('binds Life Historian to ARCHIVIST contract with must_cite evidence', () => {
    const def = getPersonaDefinition('archivist');
    expect(def.displayName).toBe('Life Historian');
    expect(def.contract.id).toBe('ARCHIVIST');
    expect(def.evidencePolicy).toBe('must_cite');
  });

  it('catalog includes display names for UI', () => {
    const catalog = listPersonaCatalog();
    const names = catalog.map((p) => p.displayName);
    expect(names).toContain('Processing Partner');
    expect(names).toContain('Strategist');
    expect(names).toContain('Gossip Buddy');
  });
});
