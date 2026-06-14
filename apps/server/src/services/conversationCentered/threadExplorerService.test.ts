import { describe, expect, it } from 'vitest';

import { threadExplorerService } from './threadExplorerService';

describe('threadExplorerService', () => {
  it('buildFacets aggregates entity counts', () => {
    const facets = threadExplorerService.buildFacets([
      {
        id: 'a',
        title: 'Career talk',
        updatedAt: new Date().toISOString(),
        entities: ['Maya', 'KForce'],
        messages: [{ role: 'user', content: 'I started onboarding at KForce' }],
      },
      {
        id: 'b',
        title: 'Family update',
        updatedAt: new Date().toISOString(),
        entities: ['Maya'],
        messages: [],
      },
    ]);

    expect(facets.totalThreads).toBe(2);
    expect(facets.entities.find(e => e.name === 'Maya')?.count).toBe(2);
    expect(facets.entities.find(e => e.name === 'KForce')?.count).toBe(1);
  });
});
