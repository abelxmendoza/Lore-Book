/**
 * Guarded location reclassification — target book rules must accept the name
 * before a place can be switched to that entity type.
 */
import { describe, expect, it } from 'vitest';

import {
  isLocationReclassifyTarget,
  validateLocationReclassification,
} from './reclassifyLocationService';

describe('isLocationReclassifyTarget', () => {
  it('accepts the five target books', () => {
    for (const t of ['organization', 'character', 'project', 'skill', 'event']) {
      expect(isLocationReclassifyTarget(t)).toBe(true);
    }
  });

  it('rejects unknown domains including location', () => {
    expect(isLocationReclassifyTarget('location')).toBe(false);
    expect(isLocationReclassifyTarget('')).toBe(false);
    expect(isLocationReclassifyTarget(undefined)).toBe(false);
  });
});

describe('validateLocationReclassification', () => {
  it('rejects junk/test labels for every target', () => {
    for (const target of ['organization', 'character', 'project', 'skill', 'event'] as const) {
      expect(validateLocationReclassification('foo', '', target).allowed).toBe(false);
      expect(validateLocationReclassification('x', '', target).allowed).toBe(false);
    }
  });

  it('allows moving a misfiled group name to organization', () => {
    expect(validateLocationReclassification('Northwind Collective', '', 'organization').allowed).toBe(true);
  });

  it('allows character, skill, and event with real names', () => {
    expect(validateLocationReclassification('Marcus', '', 'character').allowed).toBe(true);
    expect(validateLocationReclassification('Welding', '', 'skill').allowed).toBe(true);
    expect(validateLocationReclassification('Ska Prom', '', 'event').allowed).toBe(true);
  });

  it('applies Projects rules for project target', () => {
    expect(validateLocationReclassification('Omega-1', '', 'project').allowed).toBe(true);
  });

  it('rejects names that are too long', () => {
    expect(validateLocationReclassification('a'.repeat(140), '', 'organization').allowed).toBe(false);
  });
});
