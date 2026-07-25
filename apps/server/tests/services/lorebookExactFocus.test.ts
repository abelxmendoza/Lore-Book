import { describe, expect, it } from 'vitest';

import {
  applyExactLorebookFocus,
  type ParsedLorebookQuery,
} from '../../src/services/lorebook/lorebookSearchParser';

const baseSpec: ParsedLorebookQuery = {
  scope: 'thematic',
  tone: 'neutral',
  depth: 'detailed',
  audience: 'self',
  includeIntrospection: true,
};

describe('LoreBook Generator exact entity focus', () => {
  it.each([
    ['person', 'characterIds', 'character'],
    ['place', 'locationIds', 'location'],
    ['skill', 'skillIds', 'skill'],
    ['event', 'eventIds', 'event'],
    ['organization', 'organizationIds', 'organization'],
  ] as const)('maps a selected %s id into the biography filter', (type, field, scope) => {
    const focused = applyExactLorebookFocus(baseSpec, {
      id: '22222222-2222-4222-8222-222222222222',
      type,
    });

    expect(focused.scope).toBe(scope);
    expect(focused[field]).toEqual(['22222222-2222-4222-8222-222222222222']);
  });
});
