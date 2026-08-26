import { describe, expect, it } from 'vitest';
import { requiresConfirmedRoster } from './groupTypes';

describe('requiresConfirmedRoster', () => {
  it('lets company / brand / vendor candidates through without a character roster', () => {
    expect(requiresConfirmedRoster({ isPublicEntity: false, groupType: 'company' })).toBe(false);
    expect(requiresConfirmedRoster({ isPublicEntity: false, groupType: 'brand' })).toBe(false);
    expect(requiresConfirmedRoster({ isPublicEntity: false, groupType: 'vendor' })).toBe(false);
    expect(requiresConfirmedRoster({ isPublicEntity: false, groupType: 'software' })).toBe(false);
    expect(requiresConfirmedRoster({ isPublicEntity: false, groupType: 'institution' })).toBe(false);
    expect(requiresConfirmedRoster({ isPublicEntity: false, groupType: 'team' })).toBe(false);
  });

  it('skips the roster gate for public entities even when typed as a social group', () => {
    expect(requiresConfirmedRoster({ isPublicEntity: true, groupType: 'friend_group' })).toBe(false);
  });

  it('still requires two confirmed people for social clusters', () => {
    expect(requiresConfirmedRoster({ isPublicEntity: false, groupType: 'friend_group' })).toBe(true);
    expect(requiresConfirmedRoster({ isPublicEntity: false, groupType: 'household' })).toBe(true);
    expect(requiresConfirmedRoster({ isPublicEntity: false, groupType: 'band' })).toBe(true);
    expect(requiresConfirmedRoster({ isPublicEntity: false, groupType: 'crew' })).toBe(true);
    expect(requiresConfirmedRoster({ isPublicEntity: false, groupType: 'family' })).toBe(true);
  });
});
