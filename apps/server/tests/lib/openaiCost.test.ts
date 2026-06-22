import { describe, expect, it } from 'vitest';

import { estimateUsdFromTokens } from '../../src/lib/openaiCost';

describe('openaiCost', () => {
  it('estimates gpt-4o-mini chat cost', () => {
    const usd = estimateUsdFromTokens('gpt-4o-mini', 10_000, 2_000);
    expect(usd).toBeCloseTo(0.0027, 4);
  });
});
