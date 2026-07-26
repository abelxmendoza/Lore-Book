import { describe, expect, it } from 'vitest';

import {
  confirmationDisplayCount,
  isHistoryFact,
  partitionCurrentHistoryFacts,
} from './whatLoreKnowsFacts';

describe('whatLoreKnowsFacts', () => {
  it('splits current vs history by temporal polarity', () => {
    const { current, history } = partitionCurrentHistoryFacts([
      { fact: 'Works at Vanguard Robotics', status: 'active' },
      { fact: 'Worked at Northwind Depot in the past', status: 'updated' },
    ]);
    expect(current).toHaveLength(1);
    expect(history).toHaveLength(1);
    expect(isHistoryFact({ fact: 'Had pink hair in the past' })).toBe(true);
  });

  it('prefers evidence_ids length for confirmation display', () => {
    expect(
      confirmationDisplayCount({
        mention_count: 50,
        metadata: { evidence_ids: ['a', 'b'], confirmation_count: 2 },
      }),
    ).toBe(2);
  });
});
