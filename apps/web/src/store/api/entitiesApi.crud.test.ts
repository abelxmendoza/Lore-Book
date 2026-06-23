import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/api', () => ({
  fetchJson: vi.fn(),
}));

vi.mock('../../lib/requestCache', () => ({
  invalidateCache: vi.fn(),
}));

import { fetchJson } from '../../lib/api';
import { invalidateCache } from '../../lib/requestCache';
import { makeStore } from '../index';
import { entitiesApi } from './entitiesApi';

const mockedFetchJson = vi.mocked(fetchJson);
const mockedInvalidateCache = vi.mocked(invalidateCache);

const charactersBook = {
  characters: [],
  duplicate_groups: [],
  counts: {
    characters: 0,
    locations: 0,
    events: 0,
    organizations: 0,
    skills: 0,
    projects: 0,
  },
};

const waitForBookRefetch = async (expectedBookCalls: number) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const bookCalls = mockedFetchJson.mock.calls.filter(([url]) => url === '/api/books/characters');
    if (bookCalls.length >= expectedBookCalls) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Expected ${expectedBookCalls} character book fetches`);
};

const waitForRomanticRefetch = async (expectedCalls: number) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const calls = mockedFetchJson.mock.calls.filter(
      ([url]) => url === '/api/conversation/romantic-relationships'
    );
    if (calls.length >= expectedCalls) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Expected ${expectedCalls} romantic relationship fetches`);
};

const waitForOrganizationRefetch = async (expectedCalls: number) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const calls = mockedFetchJson.mock.calls.filter(([url]) => url === '/api/organizations');
    if (calls.length >= expectedCalls) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Expected ${expectedCalls} organization fetches`);
};

describe('entitiesApi character CRUD mutations', () => {
  beforeEach(() => {
    mockedFetchJson.mockReset();
    mockedInvalidateCache.mockReset();
    mockedFetchJson.mockImplementation(async (url) => {
      if (url === '/api/books/characters') {
        return { success: true, data: charactersBook };
      }
      if (url === '/api/conversation/romantic-relationships') {
        return { success: true, relationships: [] };
      }
      if (url === '/api/organizations') {
        return { success: true, organizations: [] };
      }
      if (typeof url === 'string' && url.endsWith('/members')) {
        return { success: true, member: { id: 'member-1', character_name: 'Mina' } };
      }
      return { success: true };
    });
  });

  it('updates a character and refetches the subscribed Character Book query', async () => {
    const store = makeStore();
    const subscription = store.dispatch(entitiesApi.endpoints.getCharactersBook.initiate());
    await subscription.unwrap();

    await store.dispatch(
      entitiesApi.endpoints.updateCharacter.initiate({
        id: 'char-1',
        values: { status: 'archived' },
      })
    ).unwrap();

    await waitForBookRefetch(2);
    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/characters/char-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived' }),
      }),
      expect.any(Object)
    );
    expect(mockedInvalidateCache).toHaveBeenCalledWith('char-1');
    expect(mockedInvalidateCache).toHaveBeenCalledWith('/api/characters');

    subscription.unsubscribe();
  });

  it('deletes a character with correction reason and refetches the subscribed Character Book query', async () => {
    const store = makeStore();
    const subscription = store.dispatch(entitiesApi.endpoints.getCharactersBook.initiate());
    await subscription.unwrap();

    await store.dispatch(
      entitiesApi.endpoints.deleteCharacter.initiate({
        id: 'char-2',
        redistribute: true,
        reason: 'wrong_person_or_not_real',
        reason_note: 'Created from a bad extraction',
      })
    ).unwrap();

    await waitForBookRefetch(2);
    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/characters/char-2?redistribute=true',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({
          reason: 'wrong_person_or_not_real',
          reason_note: 'Created from a bad extraction',
        }),
      }),
      expect.any(Object)
    );
    expect(mockedInvalidateCache).toHaveBeenCalledWith('char-2');
    expect(mockedInvalidateCache).toHaveBeenCalledWith('/api/characters');

    subscription.unsubscribe();
  });

  it('rescans romantic relationships and refetches subscribed relationship list', async () => {
    const store = makeStore();
    const subscription = store.dispatch(entitiesApi.endpoints.getRomanticRelationships.initiate());
    await subscription.unwrap();

    await store.dispatch(entitiesApi.endpoints.rescanRomanticRelationships.initiate()).unwrap();

    await waitForRomanticRefetch(2);
    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/conversation/romantic-relationships/rescan',
      expect.objectContaining({ method: 'POST' }),
      expect.any(Object)
    );
    expect(mockedInvalidateCache).toHaveBeenCalledWith('/api/conversation/romantic-relationships');

    subscription.unsubscribe();
  });

  it('updates a romantic relationship and refetches the subscribed relationship list', async () => {
    const store = makeStore();
    const subscription = store.dispatch(entitiesApi.endpoints.getRomanticRelationships.initiate());
    await subscription.unwrap();

    await store.dispatch(
      entitiesApi.endpoints.updateRomanticRelationship.initiate({
        id: 'rel-1',
        values: {
          status: 'ended',
          is_current: false,
          reason: 'user_marked_relationship_ended',
        },
      })
    ).unwrap();

    await waitForRomanticRefetch(2);
    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/conversation/romantic-relationships/rel-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          status: 'ended',
          is_current: false,
          reason: 'user_marked_relationship_ended',
        }),
      }),
      expect.any(Object)
    );
    expect(mockedInvalidateCache).toHaveBeenCalledWith('/api/conversation/romantic-relationships');

    subscription.unsubscribe();
  });

  it('deletes a romantic relationship with reason and refetches the subscribed relationship list', async () => {
    const store = makeStore();
    const subscription = store.dispatch(entitiesApi.endpoints.getRomanticRelationships.initiate());
    await subscription.unwrap();

    await store.dispatch(
      entitiesApi.endpoints.deleteRomanticRelationship.initiate({
        id: 'rel-2',
        reason: 'no_romantic_interest',
        reason_note: 'Should not appear in Love',
      })
    ).unwrap();

    await waitForRomanticRefetch(2);
    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/conversation/romantic-relationships/rel-2',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({
          reason: 'no_romantic_interest',
          reason_note: 'Should not appear in Love',
        }),
      }),
      expect.any(Object)
    );
    expect(mockedInvalidateCache).toHaveBeenCalledWith('/api/conversation/romantic-relationships');

    subscription.unsubscribe();
  });

  it('updates an organization and refetches the subscribed organization list', async () => {
    const store = makeStore();
    const subscription = store.dispatch(entitiesApi.endpoints.getOrganizations.initiate());
    await subscription.unwrap();

    await store.dispatch(
      entitiesApi.endpoints.updateOrganization.initiate({
        id: 'org-1',
        values: { description: 'Updated group context' },
      })
    ).unwrap();

    await waitForOrganizationRefetch(2);
    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/organizations/org-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ description: 'Updated group context' }),
      }),
      expect.any(Object)
    );
    expect(mockedInvalidateCache).toHaveBeenCalledWith('org-1');
    expect(mockedInvalidateCache).toHaveBeenCalledWith('/api/organizations');

    subscription.unsubscribe();
  });

  it('adds an organization member through the shared mutation layer', async () => {
    const store = makeStore();
    const subscription = store.dispatch(entitiesApi.endpoints.getOrganizations.initiate());
    await subscription.unwrap();

    await store.dispatch(
      entitiesApi.endpoints.addOrganizationMember.initiate({
        organizationId: 'org-1',
        member: { character_name: 'Mina', role: 'Captain', status: 'active' },
      })
    ).unwrap();

    await waitForOrganizationRefetch(2);
    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/organizations/org-1/members',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ character_name: 'Mina', role: 'Captain', status: 'active' }),
      }),
      expect.any(Object)
    );
    expect(mockedInvalidateCache).toHaveBeenCalledWith('org-1');
    expect(mockedInvalidateCache).toHaveBeenCalledWith('/api/organizations');

    subscription.unsubscribe();
  });

  it('removes an organization relationship through the shared mutation layer', async () => {
    const store = makeStore();
    const subscription = store.dispatch(entitiesApi.endpoints.getOrganizations.initiate());
    await subscription.unwrap();

    await store.dispatch(
      entitiesApi.endpoints.removeOrganizationRelationship.initiate({
        organizationId: 'org-1',
        relationshipId: 'org-rel-1',
      })
    ).unwrap();

    await waitForOrganizationRefetch(2);
    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/organizations/org-1/relationships/org-rel-1',
      expect.objectContaining({ method: 'DELETE' }),
      expect.any(Object)
    );
    expect(mockedInvalidateCache).toHaveBeenCalledWith('org-1');
    expect(mockedInvalidateCache).toHaveBeenCalledWith('/api/organizations');

    subscription.unsubscribe();
  });

  it('deletes an organization and refetches the subscribed organization list', async () => {
    const store = makeStore();
    const subscription = store.dispatch(entitiesApi.endpoints.getOrganizations.initiate());
    await subscription.unwrap();

    await store.dispatch(entitiesApi.endpoints.deleteOrganization.initiate('org-2')).unwrap();

    await waitForOrganizationRefetch(2);
    expect(mockedFetchJson).toHaveBeenCalledWith(
      '/api/organizations/org-2',
      expect.objectContaining({ method: 'DELETE' }),
      expect.any(Object)
    );
    expect(mockedInvalidateCache).toHaveBeenCalledWith('org-2');
    expect(mockedInvalidateCache).toHaveBeenCalledWith('/api/organizations');

    subscription.unsubscribe();
  });
});
