import { describe, it, expect } from 'vitest';

import { buildQuestFiltersQuery } from './questQueryUtils';

describe('buildQuestFiltersQuery', () => {
  it('returns empty string when no filters', () => {
    expect(buildQuestFiltersQuery()).toBe('');
    expect(buildQuestFiltersQuery(undefined)).toBe('');
  });

  it('encodes status, type, and search filters', () => {
    const qs = buildQuestFiltersQuery({
      status: ['active', 'paused'],
      quest_type: 'main',
      search: 'learn piano',
      min_priority: 3,
    });
    expect(qs).toContain('status=active');
    expect(qs).toContain('status=paused');
    expect(qs).toContain('quest_type=main');
    expect(qs).toContain('search=learn+piano');
    expect(qs).toContain('min_priority=3');
  });
});
