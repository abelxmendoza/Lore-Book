/**
 * Guarded character reclassification — the target book's own rules must
 * accept the name before a character can be switched to that entity type.
 */
import { describe, expect, it } from 'vitest';

import { isReclassifyTarget, validateReclassification } from './reclassifyCharacterService';

describe('isReclassifyTarget', () => {
  it('accepts the five target books', () => {
    for (const t of ['organization', 'location', 'project', 'skill', 'event']) {
      expect(isReclassifyTarget(t)).toBe(true);
    }
  });

  it('rejects unknown domains', () => {
    expect(isReclassifyTarget('character')).toBe(false);
    expect(isReclassifyTarget('')).toBe(false);
    expect(isReclassifyTarget(undefined)).toBe(false);
  });
});

describe('validateReclassification', () => {
  it('applies the shared floor: junk/test labels are rejected for every target', () => {
    for (const target of ['organization', 'location', 'project', 'skill', 'event'] as const) {
      expect(validateReclassification('foo', '', target).allowed).toBe(false);
      expect(validateReclassification('x', '', target).allowed).toBe(false);
    }
  });

  describe('location target follows Places rules', () => {
    it('rejects role titles', () => {
      const r = validateReclassification('Quality Assurance Technician', '', 'location');
      expect(r.allowed).toBe(false);
      expect(r.reason).toMatch(/Places rules rejected/);
    });

    it('rejects person names', () => {
      const r = validateReclassification('Kavi', '', 'location');
      expect(r.allowed).toBe(false);
      expect(r.reason).toMatch(/person/i);
    });

    it('rejects venue sub-area context spans', () => {
      expect(validateReclassification("Renna's Pit", '', 'location').allowed).toBe(false);
    });

    it('allows real venues', () => {
      expect(validateReclassification('Club Nova', '', 'location').allowed).toBe(true);
    });
  });

  describe('project target follows Projects rules', () => {
    it('allows real project names', () => {
      expect(validateReclassification('Omega-1', '', 'project').allowed).toBe(true);
    });
  });

  it('allows organizations, skills, and events with real names (user correction wins)', () => {
    expect(validateReclassification('Vanguard Robotics', '', 'organization').allowed).toBe(true);
    expect(validateReclassification('Welding', '', 'skill').allowed).toBe(true);
    expect(validateReclassification('Ska Prom', '', 'event').allowed).toBe(true);
  });

  it('rejects names that are too long', () => {
    expect(validateReclassification('a'.repeat(140), '', 'organization').allowed).toBe(false);
  });
});
