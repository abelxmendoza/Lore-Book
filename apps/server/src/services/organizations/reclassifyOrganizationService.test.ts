/**
 * Guarded organization reclassification — target book rules must accept the
 * name before a group can be switched to that entity type.
 */
import { describe, expect, it } from 'vitest';

import {
  isOrganizationReclassifyTarget,
  validateOrganizationReclassification,
} from './reclassifyOrganizationService';

describe('isOrganizationReclassifyTarget', () => {
  it('accepts the five target books', () => {
    for (const t of ['character', 'location', 'project', 'skill', 'event']) {
      expect(isOrganizationReclassifyTarget(t)).toBe(true);
    }
  });

  it('rejects unknown domains including organization', () => {
    expect(isOrganizationReclassifyTarget('organization')).toBe(false);
    expect(isOrganizationReclassifyTarget('')).toBe(false);
    expect(isOrganizationReclassifyTarget(undefined)).toBe(false);
  });
});

describe('validateOrganizationReclassification', () => {
  it('rejects junk/test labels for every target', () => {
    for (const target of ['character', 'location', 'project', 'skill', 'event'] as const) {
      expect(validateOrganizationReclassification('foo', '', target).allowed).toBe(false);
      expect(validateOrganizationReclassification('x', '', target).allowed).toBe(false);
    }
  });

  it('allows moving a misfiled person name to character', () => {
    expect(validateOrganizationReclassification('Marcus Whitfield', '', 'character').allowed).toBe(true);
  });

  it('allows skill and event with real names', () => {
    expect(validateOrganizationReclassification('Welding', '', 'skill').allowed).toBe(true);
    expect(validateOrganizationReclassification('Ska Prom', '', 'event').allowed).toBe(true);
  });

  it('applies Projects rules for project target', () => {
    expect(validateOrganizationReclassification('Omega-1', '', 'project').allowed).toBe(true);
  });

  it('applies Places rules for location target', () => {
    expect(validateOrganizationReclassification('Club Nova', '', 'location').allowed).toBe(true);
    expect(validateOrganizationReclassification('Catch One', '', 'location').allowed).toBe(true);
  });

  it('rejects names that are too long', () => {
    expect(validateOrganizationReclassification('a'.repeat(140), '', 'character').allowed).toBe(false);
  });
});
