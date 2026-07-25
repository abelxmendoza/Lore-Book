import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  identityBookTargetForType,
  openIdentityEntityInBook,
} from './openIdentityEntityInBook';

vi.mock('./skillEntityNavigation', () => ({
  openCharacterBookModal: vi.fn(),
  openLocationBookModal: vi.fn(),
  openOrganizationBookModal: vi.fn(),
}));

import {
  openCharacterBookModal,
  openLocationBookModal,
  openOrganizationBookModal,
} from './skillEntityNavigation';

describe('openIdentityEntityInBook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps types to the correct books', () => {
    expect(identityBookTargetForType('CHARACTER')?.surface).toBe('characters');
    expect(identityBookTargetForType('PERSON')?.surface).toBe('characters');
    expect(identityBookTargetForType('LOCATION')?.surface).toBe('locations');
    expect(identityBookTargetForType('ORG')?.surface).toBe('organizations');
    expect(identityBookTargetForType('CONCEPT')).toBeNull();
  });

  it('opens the Character Book for people', () => {
    expect(openIdentityEntityInBook('char-1', 'CHARACTER')).toBe(true);
    expect(openCharacterBookModal).toHaveBeenCalledWith({ characterId: 'char-1' });
  });

  it('opens Places for locations', () => {
    expect(openIdentityEntityInBook('loc-1', 'LOCATION')).toBe(true);
    expect(openLocationBookModal).toHaveBeenCalledWith('loc-1');
  });

  it('opens Groups for orgs', () => {
    expect(openIdentityEntityInBook('org-1', 'ORG')).toBe(true);
    expect(openOrganizationBookModal).toHaveBeenCalledWith('org-1');
  });

  it('returns false for concepts', () => {
    expect(openIdentityEntityInBook('c-1', 'CONCEPT')).toBe(false);
    expect(openCharacterBookModal).not.toHaveBeenCalled();
  });
});
