import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiCache } from './cache';
import { invalidateCache } from './requestCache';
import { invalidateOrganizationMembershipCaches } from './invalidateOrganizationMembershipCaches';

vi.mock('./requestCache', () => ({
  invalidateCache: vi.fn(),
}));

describe('invalidateOrganizationMembershipCaches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiCache.clear();
    apiCache.set('GET:http://localhost/api/organizations/by-character?character_id=char-1:', {
      organizations: [],
    });
    apiCache.set('GET:http://localhost/api/family-trees/character/char-1/affiliations?name=Mina:', {
      organizations: [],
    });
    apiCache.set('GET:http://localhost/api/characters/char-1/profile-bundle:', {
      bundle: { detail: { id: 'char-1' } },
    });
    apiCache.set('GET:http://localhost/api/organizations/org-1:', { id: 'org-1' });
    apiCache.set('GET:http://localhost/api/characters/char-1/lore-profile:', {
      profile: { groups: [] },
    });
  });

  it('clears membership GETs without wiping character profile-bundle', () => {
    invalidateOrganizationMembershipCaches({
      characterIds: ['char-1'],
      organizationIds: ['org-1'],
    });

    expect(apiCache.get('GET:http://localhost/api/organizations/by-character?character_id=char-1:')).toBeNull();
    expect(
      apiCache.get('GET:http://localhost/api/family-trees/character/char-1/affiliations?name=Mina:'),
    ).toBeNull();
    expect(apiCache.get('GET:http://localhost/api/organizations/org-1:')).toBeNull();
    expect(apiCache.get('GET:http://localhost/api/characters/char-1/lore-profile:')).toBeNull();
    // Profile bundle must survive — wiping it stuck the character modal on loading.
    expect(apiCache.get('GET:http://localhost/api/characters/char-1/profile-bundle:')).not.toBeNull();
    expect(invalidateCache).not.toHaveBeenCalledWith('char-1');
    expect(invalidateCache).toHaveBeenCalledWith('/api/organizations/by-character');
    expect(invalidateCache).toHaveBeenCalledWith('/api/characters/char-1/lore-profile');
  });
});
