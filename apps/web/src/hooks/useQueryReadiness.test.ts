import { describe, expect, it } from 'vitest';

import { buildQueryReadinessRequest } from './useQueryReadiness';

describe('subject-specific LoreBook readiness requests', () => {
  it('uses the exact character id instead of a free-text name match', () => {
    expect(buildQueryReadinessRequest('my story with @Marcus', {
      id: '22222222-2222-4222-8222-222222222222',
      type: 'person',
      name: 'Marcus',
    })).toEqual({
      characterId: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('uses an exact event filter for event and era subjects', () => {
    expect(buildQueryReadinessRequest('the era around @Launch Day', {
      id: '33333333-3333-4333-8333-333333333333',
      type: 'event',
      name: 'Launch Day',
    })).toMatchObject({
      spec: {
        scope: 'event',
        eventIds: ['33333333-3333-4333-8333-333333333333'],
      },
    });
  });
});
