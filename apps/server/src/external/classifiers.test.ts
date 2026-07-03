import { describe, expect, it } from 'vitest';

import { classifyMilestones } from './classifiers';

describe('classifyMilestones', () => {
  it('keeps original X posts as external lore entries even without milestone keywords', () => {
    const classified = classifyMilestones([
      {
        source: 'x',
        sourceId: 'post-1',
        timestamp: '2025-01-01T00:00:00.000Z',
        type: 'post',
        text: 'quiet day thinking about where this project is going',
      },
    ]);

    expect(classified).toHaveLength(1);
    expect(classified[0].milestone).toBe('post');
  });
});
